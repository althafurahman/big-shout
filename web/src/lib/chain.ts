import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { config } from "./config";

import BigshoutIdl from "./idl/bigshout.json";

/**
 * Server-side chain access for the web app. Holds the operator service
 * wallet (fee payer) and signs predict transactions together with the
 * user's custodial keypair. All heavier lifecycle work lives in the cranker.
 */

/** anchor's ESM entry doesn't export Wallet (NodeWallet) — a keypair wallet
 *  is four lines, so we carry our own. */
class KeypairWallet {
  constructor(readonly payer: Keypair) {}
  get publicKey() {
    return this.payer.publicKey;
  }
  async signTransaction<T extends { partialSign?: (kp: Keypair) => void; sign?: (kps: Keypair[]) => void }>(tx: T): Promise<T> {
    if (typeof tx.partialSign === "function") tx.partialSign(this.payer);
    else if (typeof tx.sign === "function") tx.sign([this.payer]);
    return tx;
  }
  async signAllTransactions<T extends { partialSign?: (kp: Keypair) => void; sign?: (kps: Keypair[]) => void }>(txs: T[]): Promise<T[]> {
    return Promise.all(txs.map((t) => this.signTransaction(t)));
  }
}

let cached: {
  connection: Connection;
  service: Keypair;
  program: anchor.Program;
} | null = null;

export function chain() {
  if (cached) return cached;
  const connection = new Connection(config.rpcUrl, "confirmed");
  const service = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.SERVICE_WALLET_JSON ?? "[]"))
  );
  const provider = new anchor.AnchorProvider(
    connection,
    new KeypairWallet(service) as anchor.Wallet,
    anchor.AnchorProvider.defaultOptions()
  );
  const program = new anchor.Program(BigshoutIdl as anchor.Idl, provider);
  cached = { connection, service, program };
  return cached;
}

export const programId = () => chain().program.programId;

export function marketPda(marketId: bigint | number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), new BN(marketId.toString()).toBuffer("le", 8)],
    programId()
  )[0];
}

export function positionPda(market: PublicKey, user: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), market.toBuffer(), user.toBuffer()],
    programId()
  )[0];
}

export function playerPda(user: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("player"), user.toBuffer()],
    programId()
  )[0];
}

/** Seal a call: custodial user signs as owner, service wallet pays. */
export async function sendPredict(
  userSecret: Uint8Array,
  marketId: bigint | number,
  side: boolean,
  amount: number
): Promise<{ sig: string; positionPda: string }> {
  const { program, service } = chain();
  const user = Keypair.fromSecretKey(userSecret);
  const market = marketPda(marketId);
  const position = positionPda(market, user.publicKey);
  const sig = await program.methods
    .predict(side, new BN(amount))
    .accounts({
      user: user.publicKey,
      payer: service.publicKey,
      market,
      player: playerPda(user.publicKey),
      position,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([user, service])
    .rpc();
  return { sig, positionPda: position.toBase58() };
}

export async function fetchMarketAccount(marketId: bigint | number): Promise<any | null> {
  try {
    return await (chain().program.account as any).market.fetch(marketPda(marketId));
  } catch {
    return null;
  }
}

export async function fetchPlayerAccount(userPubkey: string): Promise<any | null> {
  try {
    return await (chain().program.account as any).player.fetch(
      playerPda(new PublicKey(userPubkey))
    );
  } catch {
    return null;
  }
}
