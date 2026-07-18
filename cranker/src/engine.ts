import { PublicKey } from "@solana/web3.js";
import { CardSpec, StatTotals, cardForTrigger, classify, idleCard } from "./cards";
import { Chain } from "./chain";
import { Db } from "./db";
import { OddsEngine } from "./odds";
import {
  isFinalPhase,
  recFixtureId,
  recSeq,
  recStatusId,
  recTs,
  stat,
  totals,
} from "./scores";
import { TxLine } from "./txline";

/** Phases with the ball in play — the only time cards fire. */
const IN_PLAY = new Set([2, 4, 7, 9, 12]);

/** Must exceed the program's EXPIRY_GRACE_SECS (180); the margin covers
 *  clock skew between this process and the cluster. */
const EXPIRY_GRACE_SECS = 195;

const CARD_COOLDOWN_MS = 90_000;
const IDLE_CARD_AFTER_MS = 4 * 60_000;

interface FixtureState {
  fixtureId: number;
  p1: string;
  p2: string;
  statusId: number;
  lastSeq: number;
  lastTotals: StatTotals;
  lastCardAtMs: number;
  /** market_id per open card family, so one family = one open card. */
  openByFamily: Map<string, bigint>;
}

interface OpenMarket {
  marketId: bigint;
  fixtureId: number;
  statKey: number;
  threshold: number;
  createdTs: number;
  deadlineTs: number;
  family: string;
  team: number;
  pYes0: number;
  /** Last odds sent on-chain, cached to avoid a fetch per drift tick. */
  lastYesBps: number;
  settling: boolean;
  settled: boolean;
}

export interface EngineOpts {
  /** Replay harness mode: fixtures are labelled "simulated live" and card
   *  windows are compressed by `speed`. Same proofs, same cranker path,
   *  same on-chain settlement — only the feed source differs. */
  simulated: boolean;
  speed: number;
}

export class Engine {
  private fixtures = new Map<number, FixtureState>();
  private open = new Map<string, OpenMarket>();
  private marketSeq = 0;

  constructor(
    readonly chain: Chain,
    readonly tx: TxLine,
    readonly db: Db,
    readonly odds: OddsEngine,
    readonly opts: EngineOpts
  ) {}

  teamName(fid: number, t: number): string {
    const f = this.fixtures.get(fid);
    return t === 1 ? f?.p1 ?? "Home" : f?.p2 ?? "Away";
  }

  async registerFixture(f: {
    fixtureId: number;
    p1: string;
    p2: string;
    startTime: number;
    competitionId?: number;
  }): Promise<void> {
    if (this.fixtures.has(f.fixtureId)) return;
    this.fixtures.set(f.fixtureId, {
      fixtureId: f.fixtureId,
      p1: f.p1,
      p2: f.p2,
      statusId: 1,
      lastSeq: 0,
      lastTotals: {},
      lastCardAtMs: 0,
      openByFamily: new Map(),
    });
    await this.db.upsertFixture({
      fixtureId: f.fixtureId,
      participant1: f.p1,
      participant2: f.p2,
      startTime: f.startTime,
      competitionId: f.competitionId,
      simulated: this.opts.simulated,
    });
    try {
      const snapshot = await this.tx.oddsSnapshot(f.fixtureId);
      this.odds.setFromOddsSnapshot(f.fixtureId, snapshot);
    } catch {
      /* odds coverage varies per fixture; priors stay neutral */
    }
  }

  /** Recover open markets after a restart — chain state is the source of truth. */
  async loadOpenMarkets(): Promise<void> {
    const markets = await this.chain.allMarkets();
    const cards = await this.db.openCards();
    const meta = new Map(cards.map((c: any) => [String(c.market_id), c]));
    for (const m of markets) {
      const status = Object.keys(m.account.status)[0];
      if (status !== "open") continue;
      const marketId = BigInt(m.account.marketId.toString());
      const card = meta.get(marketId.toString());
      const fixtureId = Number(m.account.fixtureId.toString());
      const om: OpenMarket = {
        marketId,
        fixtureId,
        statKey: m.account.statKey,
        threshold: m.account.threshold,
        createdTs: Number(m.account.createdTs.toString()),
        deadlineTs: Number(m.account.deadlineTs.toString()),
        family: card?.trigger_kind === "yellow" ? "booking" : card?.trigger_kind === "idle" ? "corner" : "goal",
        team: card?.team ?? 1,
        pYes0: 0.25,
        lastYesBps: m.account.yesOddsBps,
        settling: false,
        settled: false,
      };
      this.open.set(marketId.toString(), om);
      this.fixtures.get(fixtureId)?.openByFamily.set(om.family, marketId);
    }
    console.log(`[engine] recovered ${this.open.size} open markets from chain`);
  }

  /** The shared pipeline: one score record in, everything else follows. */
  async onRecord(rec: any): Promise<void> {
    const fid = recFixtureId(rec);
    if (!fid) return;
    const f = this.fixtures.get(fid);
    if (!f) return;

    const seq = recSeq(rec) ?? 0;
    if (seq && seq <= f.lastSeq) return; // duplicate/out-of-order
    if (seq) f.lastSeq = seq;

    const prev = f.lastTotals;
    const t = totals(rec);
    // Records carry the full stat map; merge defensively in case one doesn't.
    const curr: StatTotals = {
      goals1: t.goals1 ?? prev.goals1,
      goals2: t.goals2 ?? prev.goals2,
      yellows1: t.yellows1 ?? prev.yellows1,
      yellows2: t.yellows2 ?? prev.yellows2,
      reds1: t.reds1 ?? prev.reds1,
      reds2: t.reds2 ?? prev.reds2,
      corners1: t.corners1 ?? prev.corners1,
      corners2: t.corners2 ?? prev.corners2,
    };
    const statusId = recStatusId(rec) ?? f.statusId;
    const ts = recTs(rec) ?? Date.now();
    const nowMs = Date.now();

    f.lastTotals = curr;
    f.statusId = statusId;

    await this.db.upsertScoreState(fid, {
      ...(curr as Record<string, number>),
      h1goals1: t.h1goals1 ?? 0,
      h1goals2: t.h1goals2 ?? 0,
      statusId,
      ts,
    });
    await this.db.updateFixtureStatus(fid, statusId);

    const triggers = classify(rec, prev, curr, (n) => this.teamName(fid, n));
    for (const trig of triggers) {
      await this.db.insertTicker({
        fixtureId: fid,
        seq,
        ts,
        kind: trig.kind,
        team: trig.team,
        label: trig.label,
        weight: trig.weight,
      });
      this.odds.noteTrigger(fid, trig, nowMs);
    }

    // Fire at most one card per record, in trigger order, respecting the
    // per-fixture cooldown and one-open-card-per-family.
    if (IN_PLAY.has(statusId) && nowMs - f.lastCardAtMs > CARD_COOLDOWN_MS) {
      for (const trig of triggers) {
        const spec = cardForTrigger(trig, curr, (n) => this.teamName(fid, n));
        if (!spec) continue;
        if (f.openByFamily.has(spec.family)) continue;
        await this.fireCard(fid, spec);
        break;
      }
    }

    // Settlement watch: a record showing the stat past the threshold inside
    // the window means YES is now provable — go get the proof.
    for (const m of this.open.values()) {
      if (m.fixtureId !== fid || m.settled || m.settling) continue;
      const v = stat(rec, m.statKey);
      if (v === undefined || v <= m.threshold) continue;
      if (ts > m.deadlineTs * 1000) continue; // crossed after the window
      void this.attemptYesSettle(m, seq);
    }
  }

  async fireCard(fid: number, spec: CardSpec): Promise<void> {
    const f = this.fixtures.get(fid);
    if (!f) return;
    const nowMs = Date.now();
    const marketId = BigInt(nowMs) * 1000n + BigInt(this.marketSeq++ % 1000);
    const deadlineTs = Math.floor(nowMs / 1000) + Math.max(60, Math.round(spec.windowSecs / this.opts.speed));
    const { yesBps, noBps } = this.odds.price(fid, spec.team, spec.pYes, nowMs);
    try {
      const sig = await this.chain.createMarket(
        marketId, fid, spec.statKey, spec.threshold, deadlineTs, yesBps, noBps
      );
      await this.db.insertCard({
        marketId,
        fixtureId: fid,
        marketPda: this.chain.marketPda(marketId).toBase58(),
        statKey: spec.statKey,
        threshold: spec.threshold,
        team: spec.team,
        question: spec.question,
        triggerKind: spec.triggerKind,
        triggerLabel: spec.triggerLabel,
        createdTs: Math.floor(nowMs / 1000),
        deadlineTs,
        yesOddsBps: yesBps,
        noOddsBps: noBps,
        createSig: sig,
      });
      this.open.set(marketId.toString(), {
        marketId,
        fixtureId: fid,
        statKey: spec.statKey,
        threshold: spec.threshold,
        createdTs: Math.floor(nowMs / 1000),
        deadlineTs,
        family: spec.family,
        team: spec.team,
        pYes0: spec.pYes,
        lastYesBps: yesBps,
        settling: false,
        settled: false,
      });
      f.openByFamily.set(spec.family, marketId);
      f.lastCardAtMs = nowMs;
      console.log(`[card] ${this.teamName(fid, spec.team)} · "${spec.question}" · yes=${(yesBps / 10000).toFixed(2)}x market=${marketId}`);
    } catch (e: any) {
      console.error(`[card] createMarket failed:`, e.message?.slice(0, 160));
    }
  }

  /**
   * TxLINE's validation pipeline batches records, so the newest seq usually
   * isn't provable yet — step back through recent seqs until one is. The
   * proven value must already exceed the threshold at that seq, and the
   * record must sit inside the window (the program re-checks both).
   */
  async attemptYesSettle(m: OpenMarket, headSeq: number): Promise<void> {
    if (m.settled || m.settling) return;
    m.settling = true;
    const candidates = [headSeq, headSeq - 10, headSeq - 25, headSeq - 50, headSeq - 90].filter((s) => s >= 1);
    try {
      for (const s of candidates) {
        let val;
        try {
          val = await this.tx.statValidation(m.fixtureId, s, [m.statKey]);
        } catch {
          continue; // not in a committed batch yet — try an older seq
        }
        const proven = val.statsToProve?.[0];
        if (!proven || proven.key !== m.statKey) continue;
        if ((proven.value ?? 0) <= m.threshold) continue; // lagged seq predates the event
        if (val.summary?.updateStats?.minTimestamp > m.deadlineTs * 1000) continue;
        const sig = await this.chain.settleProven(m.marketId, val);
        console.log(`[settle] market ${m.marketId} -> YES at seq ${s}: ${sig}`);
        m.settled = true;
        await this.db.settleCard(m.marketId, "yes_won", val.summary.updateStats.minTimestamp, sig, s);
        this.release(m);
        await this.sweepClaims(m.marketId);
        return;
      }
      console.log(`[settle] market ${m.marketId}: no provable seq yet (head=${headSeq}); will retry`);
    } catch (e: any) {
      console.error(`[settle] market ${m.marketId} failed:`, e.message?.slice(0, 200) ?? e);
    } finally {
      m.settling = false;
    }
  }

  /** Runs on an interval: expire markets whose window closed unproven. */
  async expiryTick(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    for (const m of this.open.values()) {
      if (m.settled || m.settling) continue;
      if (now < m.deadlineTs + EXPIRY_GRACE_SECS) continue;
      m.settling = true;
      try {
        const sig = await this.chain.settleExpired(m.marketId);
        console.log(`[settle] market ${m.marketId} -> NO (expired): ${sig}`);
        m.settled = true;
        await this.db.settleCard(m.marketId, "no_won", null, sig);
        this.release(m);
        await this.sweepClaims(m.marketId);
      } catch (e: any) {
        console.error(`[expire] market ${m.marketId} failed:`, e.message?.slice(0, 160));
      } finally {
        m.settling = false;
      }
    }
  }

  /** Runs on an interval: drift odds on open cards so the price is alive. */
  async oddsTick(): Promise<void> {
    const nowMs = Date.now();
    for (const m of this.open.values()) {
      if (m.settled || m.settling) continue;
      if (nowMs / 1000 > m.deadlineTs) continue;
      const { yesBps, noBps } = this.odds.drift(
        m.fixtureId, m.team, m.pYes0, m.createdTs, m.deadlineTs, nowMs
      );
      try {
        const dy = Math.abs(m.lastYesBps - yesBps) / m.lastYesBps;
        if (dy < 0.02) continue; // don't spam txs for sub-2% moves
        await this.chain.updateOdds(m.marketId, yesBps, noBps);
        await this.db.updateCardOdds(m.marketId, yesBps, noBps);
        m.lastYesBps = yesBps;
      } catch (e: any) {
        console.error(`[odds] market ${m.marketId}:`, e.message?.slice(0, 120));
      }
    }
  }

  /** Runs on an interval: keep every live fixture swipeable. */
  async idleTick(): Promise<void> {
    const nowMs = Date.now();
    for (const f of this.fixtures.values()) {
      if (!IN_PLAY.has(f.statusId)) continue;
      if (nowMs - f.lastCardAtMs < IDLE_CARD_AFTER_MS) continue;
      if (f.openByFamily.size > 0) continue;
      const favored = (f.lastTotals.corners1 ?? 0) >= (f.lastTotals.corners2 ?? 0) ? 1 : 2;
      await this.fireCard(f.fixtureId, idleCard(f.lastTotals, favored, (n) => this.teamName(f.fixtureId, n)));
    }
  }

  /** Anyone may claim; our cranker sweeps so results land with zero user action. */
  async sweepClaims(marketId: bigint): Promise<void> {
    try {
      const marketPda = this.chain.marketPda(marketId);
      const positions = await this.chain.positionsForMarket(marketPda);
      for (const p of positions) {
        if (p.account.claimed) continue;
        try {
          await this.chain.claim(marketId, p.publicKey, new PublicKey(p.account.user));
        } catch (e: any) {
          console.error(`[claim] ${p.publicKey.toBase58()}:`, e.message?.slice(0, 120));
        }
      }
    } catch (e: any) {
      console.error(`[claim] sweep for ${marketId}:`, e.message?.slice(0, 120));
    }
  }

  /** Runs on an interval: mirror chain accounts into the read-model tables.
   *  Consensus, reputation, leaderboard, profiles and receipts are all views
   *  over Positions and Players — no extra on-chain state. */
  async indexTick(): Promise<void> {
    try {
      const markets = await this.chain.allMarkets();
      for (const m of markets) {
        const status = Object.keys(m.account.status)[0];
        const marketId = BigInt(m.account.marketId.toString());
        await this.db.pool.query(
          `UPDATE cards SET status=$2, yes_count=$3, no_count=$4, yes_staked=$5, no_staked=$6,
                            yes_odds_bps=$7, no_odds_bps=$8, updated_at=CURRENT_TIMESTAMP
           WHERE market_id=$1`,
          [
            marketId.toString(),
            status === "yesWon" ? "yes_won" : status === "noWon" ? "no_won" : "open",
            m.account.yesCount, m.account.noCount,
            m.account.yesStaked.toString(), m.account.noStaked.toString(),
            m.account.yesOddsBps, m.account.noOddsBps,
          ]
        );
      }
      const marketIdByPda = new Map(
        markets.map((m) => [this.chain.marketPda(BigInt(m.account.marketId.toString())).toBase58(), BigInt(m.account.marketId.toString())])
      );
      const positions = await this.chain.allPositions();
      for (const p of positions) {
        const marketId = marketIdByPda.get(p.account.market.toBase58());
        if (marketId === undefined) continue;
        await this.db.upsertPosition({
          positionPda: p.publicKey.toBase58(),
          marketId,
          userPubkey: p.account.user.toBase58(),
          side: p.account.side,
          amount: BigInt(p.account.amount.toString()),
          oddsBps: p.account.oddsBps,
          lockedTs: Number(p.account.lockedTs.toString()),
          claimed: p.account.claimed,
          won: p.account.won,
        });
      }
      const players = await this.chain.allPlayers();
      for (const pl of players) {
        await this.db.upsertPlayer({
          userPubkey: pl.account.authority.toBase58(),
          points: BigInt(pl.account.points.toString()),
          streak: pl.account.streak,
          bestStreak: pl.account.bestStreak,
          correct: pl.account.correct,
          total: pl.account.total,
          lastRefillTs: Number(pl.account.lastRefillTs.toString()),
        });
      }
    } catch (e: any) {
      console.error(`[index] sweep failed:`, e.message?.slice(0, 160));
    }
  }

  private release(m: OpenMarket): void {
    this.open.delete(m.marketId.toString());
    const f = this.fixtures.get(m.fixtureId);
    if (f && f.openByFamily.get(m.family) === m.marketId) f.openByFamily.delete(m.family);
  }

  get openCount(): number {
    return this.open.size;
  }
}
