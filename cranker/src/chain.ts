import * as anchor from "@coral-xyz/anchor";
import { ComputeBudgetProgram, Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import * as fs from "fs";
import { config } from "./config";
import { buildPayload, epochDayOf } from "./proof";

import BigshoutIdl from "../../program/idls/bigshout.json";
import TxoracleIdl from "../../program/idls/txoracle.json";

export class Chain {
  readonly connection: Connection;
  readonly service: Keypair;
  readonly provider: anchor.AnchorProvider;
  readonly bigshout: anchor.Program;
  readonly txoracleId: PublicKey;

  constructor() {
    this.connection = new Connection(config.rpcUrl, "confirmed");
    const secret = Uint8Array.from(JSON.parse(fs.readFileSync(config.walletPath, "utf8")));
    this.service = Keypair.fromSecretKey(secret);
    this.provider = new anchor.AnchorProvider(
      this.connection,
      new anchor.Wallet(this.service),
      anchor.AnchorProvider.defaultOptions()
    );
    anchor.setProvider(this.provider);
    this.bigshout = new anchor.Program(BigshoutIdl as anchor.Idl, this.provider);
    this.txoracleId = new PublicKey((TxoracleIdl as any).address);
  }

  configPda(): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from("config")], this.bigshout.programId)[0];
  }

  marketPda(marketId: bigint): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("market"), new BN(marketId.toString()).toBuffer("le", 8)],
      this.bigshout.programId
    )[0];
  }

  positionPda(market: PublicKey, user: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("position"), market.toBuffer(), user.toBuffer()],
      this.bigshout.programId
    )[0];
  }

  playerPda(user: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("player"), user.toBuffer()],
      this.bigshout.programId
    )[0];
  }

  dailyScoresRootsPda(epochDay: number): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("daily_scores_roots"), new BN(epochDay).toBuffer("le", 2)],
      this.txoracleId
    )[0];
  }

  async initConfig(): Promise<string> {
    return this.bigshout.methods
      .initConfig()
      .accounts({
        admin: this.service.publicKey,
        config: this.configPda(),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  }

  async createMarket(
    marketId: bigint,
    fixtureId: number,
    statKey: number,
    threshold: number,
    deadlineTs: number,
    yesOddsBps: number,
    noOddsBps: number
  ): Promise<string> {
    return this.bigshout.methods
      .createMarket(
        new BN(marketId.toString()),
        new BN(fixtureId),
        statKey,
        threshold,
        new BN(deadlineTs),
        yesOddsBps,
        noOddsBps
      )
      .accounts({
        authority: this.service.publicKey,
        config: this.configPda(),
        market: this.marketPda(marketId),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  }

  async updateOdds(marketId: bigint, yesOddsBps: number, noOddsBps: number): Promise<string> {
    return this.bigshout.methods
      .updateOdds(yesOddsBps, noOddsBps)
      .accounts({
        authority: this.service.publicKey,
        config: this.configPda(),
        market: this.marketPda(marketId),
      })
      .rpc();
  }

  /**
   * Seal a call for a custodial user wallet. The user keypair signs as the
   * position owner; the service wallet pays rent and fees, so user wallets
   * never need SOL.
   */
  async predictAs(user: Keypair, marketId: bigint, side: boolean, amount: bigint): Promise<string> {
    const market = this.marketPda(marketId);
    return this.bigshout.methods
      .predict(side, new BN(amount.toString()))
      .accounts({
        user: user.publicKey,
        payer: this.service.publicKey,
        market,
        player: this.playerPda(user.publicKey),
        position: this.positionPda(market, user.publicKey),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user, this.service])
      .rpc();
  }

  /** Permissionless YES settlement with a TxLINE stat proof. */
  async settleProven(marketId: bigint, validationResponse: any): Promise<string> {
    const payload = buildPayload(validationResponse);
    const rootPda = this.dailyScoresRootsPda(epochDayOf(payload.ts.toNumber()));
    const cu = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
    return this.bigshout.methods
      .settleProven(payload)
      .accounts({
        settler: this.service.publicKey,
        market: this.marketPda(marketId),
        dailyScoresMerkleRoots: rootPda,
        txoracleProgram: this.txoracleId,
      })
      .preInstructions([cu])
      .rpc();
  }

  /** Permissionless NO settlement after deadline + on-chain grace period. */
  async settleExpired(marketId: bigint): Promise<string> {
    return this.bigshout.methods
      .settleExpired()
      .accounts({
        settler: this.service.publicKey,
        market: this.marketPda(marketId),
      })
      .rpc();
  }

  /** Permissionless claim crank: credits the position's own player. */
  async claim(marketId: bigint, positionPda: PublicKey, userPubkey: PublicKey): Promise<string> {
    return this.bigshout.methods
      .claim()
      .accounts({
        market: this.marketPda(marketId),
        position: positionPda,
        player: this.playerPda(userPubkey),
      })
      .rpc();
  }

  async fetchMarket(marketId: bigint): Promise<any | null> {
    try {
      return await (this.bigshout.account as any).market.fetch(this.marketPda(marketId));
    } catch {
      return null;
    }
  }

  async allMarkets(): Promise<{ publicKey: PublicKey; account: any }[]> {
    return (this.bigshout.account as any).market.all();
  }

  async positionsForMarket(market: PublicKey): Promise<{ publicKey: PublicKey; account: any }[]> {
    return (this.bigshout.account as any).position.all([
      { memcmp: { offset: 8, bytes: market.toBase58() } },
    ]);
  }

  async allPositions(): Promise<{ publicKey: PublicKey; account: any }[]> {
    return (this.bigshout.account as any).position.all();
  }

  async allPlayers(): Promise<{ publicKey: PublicKey; account: any }[]> {
    return (this.bigshout.account as any).player.all();
  }
}
