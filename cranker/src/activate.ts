import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import nacl from "tweetnacl";
import { config } from "./config";

import TxoracleIdl from "../../program/idls/txoracle.json";

/**
 * One-shot TxLINE activation for a fresh service wallet:
 *   1. generate (or load) the wallet and fund it with devnet SOL;
 *   2. on-chain `subscribe(serviceLevel 1, 4 weeks)` — standard free World
 *      Cup + International Friendlies bundle, no TxL required;
 *   3. guest JWT -> sign `${txSig}:${leagues}:${jwt}` -> /api/token/activate;
 *   4. write TX_API_TOKEN / TX_JWT into cranker/.env and sanity-check the API.
 */
async function main() {
  const SERVICE_LEVEL_ID = 1;
  const DURATION_WEEKS = 4;
  const SELECTED_LEAGUES: number[] = []; // standard free bundle

  // 1. Wallet
  const walletPath = path.resolve(config.walletPath);
  fs.mkdirSync(path.dirname(walletPath), { recursive: true });
  let wallet: Keypair;
  if (fs.existsSync(walletPath)) {
    wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8"))));
    console.log("[1] loaded service wallet:", wallet.publicKey.toBase58());
  } else {
    wallet = Keypair.generate();
    fs.writeFileSync(walletPath, JSON.stringify(Array.from(wallet.secretKey)));
    console.log("[1] generated service wallet:", wallet.publicKey.toBase58());
  }

  const connection = new Connection(config.rpcUrl, "confirmed");
  let balance = await connection.getBalance(wallet.publicKey);
  console.log(`    balance: ${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    try {
      const sig = await connection.requestAirdrop(wallet.publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
      balance = await connection.getBalance(wallet.publicKey);
      console.log(`    airdropped; balance now ${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
    } catch (e: any) {
      console.error(
        `    airdrop failed (${e.message?.slice(0, 80)}). Fund ${wallet.publicKey.toBase58()} via https://faucet.solana.com and re-run.`
      );
      process.exit(1);
    }
  }

  // 2. On-chain subscribe
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  const program = new anchor.Program(TxoracleIdl as anchor.Idl, provider);
  if (program.programId.toBase58() !== config.txoracleProgramId) {
    throw new Error(
      `IDL program ${program.programId.toBase58()} != expected ${config.txoracleProgramId} — network mixup`
    );
  }

  const txlTokenMint = new PublicKey(config.txlTokenMint);
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury_v2")],
    program.programId
  );
  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    txlTokenMint, tokenTreasuryPda, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    program.programId
  );
  const userTokenAccount = getAssociatedTokenAddressSync(
    txlTokenMint, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const ensureAta = createAssociatedTokenAccountIdempotentInstruction(
    wallet.publicKey, userTokenAccount, wallet.publicKey, txlTokenMint,
    TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const txSig = await (program.methods as any)
    .subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS)
    .accounts({
      user: wallet.publicKey,
      pricingMatrix: pricingMatrixPda,
      tokenMint: txlTokenMint,
      userTokenAccount,
      tokenTreasuryVault,
      tokenTreasuryPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([ensureAta])
    .rpc();
  console.log("[2] subscribed on-chain:", txSig);

  // 3. Activate
  const jwt = (await axios.post(config.jwtUrl)).data.token as string;
  const message = new TextEncoder().encode(`${txSig}:${SELECTED_LEAGUES.join(",")}:${jwt}`);
  const walletSignature = Buffer.from(nacl.sign.detached(message, wallet.secretKey)).toString("base64");
  const activation = await axios.post(
    `${config.apiBase}/token/activate`,
    { txSig, walletSignature, leagues: SELECTED_LEAGUES },
    { headers: { Authorization: `Bearer ${jwt}` } }
  );
  const apiToken: string = activation.data.token ?? activation.data;
  console.log("[3] activated. API token:", `${apiToken.slice(0, 12)}…`);

  // 4. Persist into cranker/.env and sanity-check
  const envPath = path.resolve(__dirname, "../.env");
  let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const setVar = (key: string, value: string) => {
    const line = `${key}=${value}`;
    env = env.match(new RegExp(`^${key}=`, "m"))
      ? env.replace(new RegExp(`^${key}=.*$`, "m"), line)
      : `${env.trimEnd()}\n${line}\n`;
  };
  setVar("TX_API_TOKEN", apiToken);
  setVar("TX_JWT", jwt);
  fs.writeFileSync(envPath, env);
  console.log("[4] wrote TX_API_TOKEN and TX_JWT to cranker/.env");

  const today = Math.floor(Date.now() / 86_400_000);
  const fixtures = await axios.get(
    `${config.apiBase}/fixtures/snapshot?startEpochDay=${today - 2}&competitionId=${config.competitionId}`,
    { headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken } }
  );
  console.log(`[5] sanity check: ${fixtures.data?.length ?? 0} World Cup fixtures visible`);
  console.log("\n=== ACTIVATION COMPLETE ===");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("ACTIVATION FAILED:", e.response?.data ?? e.message ?? e);
    process.exit(1);
  }
);
