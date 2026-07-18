import { Pool } from "pg";
import { config } from "./config";

/**
 * Shared Postgres. The web app (Prisma) is the schema owner; this mirror of
 * the DDL exists so the cranker can boot on an empty database in dev. Both
 * definitions must stay in sync with web/prisma/schema.prisma.
 */
export class Db {
  readonly pool: Pool;

  constructor() {
    if (!config.databaseUrl) throw new Error("DATABASE_URL is not set");
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseUrl.includes("localhost") ? undefined : { rejectUnauthorized: false },
    });
  }

  async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS fixtures (
        fixture_id bigint PRIMARY KEY,
        participant1 text NOT NULL,
        participant2 text NOT NULL,
        start_time bigint NOT NULL,
        competition_id integer,
        status_id integer NOT NULL DEFAULT 1,
        simulated boolean NOT NULL DEFAULT false,
        updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS score_state (
        fixture_id bigint PRIMARY KEY,
        goals1 integer NOT NULL DEFAULT 0,
        goals2 integer NOT NULL DEFAULT 0,
        h1goals1 integer NOT NULL DEFAULT 0,
        h1goals2 integer NOT NULL DEFAULT 0,
        yellows1 integer NOT NULL DEFAULT 0,
        yellows2 integer NOT NULL DEFAULT 0,
        reds1 integer NOT NULL DEFAULT 0,
        reds2 integer NOT NULL DEFAULT 0,
        corners1 integer NOT NULL DEFAULT 0,
        corners2 integer NOT NULL DEFAULT 0,
        status_id integer NOT NULL DEFAULT 1,
        ts bigint NOT NULL DEFAULT 0,
        updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS ticker_events (
        id serial PRIMARY KEY,
        fixture_id bigint NOT NULL,
        seq integer NOT NULL,
        ts bigint NOT NULL,
        kind text NOT NULL,
        team integer,
        label text NOT NULL,
        weight double precision NOT NULL DEFAULT 0.3,
        created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ticker_events_dedupe
        ON ticker_events (fixture_id, seq, kind);
      CREATE TABLE IF NOT EXISTS cards (
        market_id bigint PRIMARY KEY,
        fixture_id bigint NOT NULL,
        market_pda text NOT NULL,
        stat_key integer NOT NULL,
        threshold integer NOT NULL,
        team integer,
        question text NOT NULL,
        trigger_kind text NOT NULL,
        trigger_label text NOT NULL,
        created_ts bigint NOT NULL,
        deadline_ts bigint NOT NULL,
        opening_yes_odds_bps integer NOT NULL,
        opening_no_odds_bps integer NOT NULL,
        yes_odds_bps integer NOT NULL,
        no_odds_bps integer NOT NULL,
        status text NOT NULL DEFAULT 'open',
        settled_proof_ts bigint,
        settle_seq integer,
        create_sig text,
        settle_sig text,
        yes_count integer NOT NULL DEFAULT 0,
        no_count integer NOT NULL DEFAULT 0,
        yes_staked bigint NOT NULL DEFAULT 0,
        no_staked bigint NOT NULL DEFAULT 0,
        updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS cards_fixture ON cards (fixture_id);
      CREATE TABLE IF NOT EXISTS positions (
        position_pda text PRIMARY KEY,
        market_id bigint NOT NULL,
        user_pubkey text NOT NULL,
        side boolean NOT NULL,
        amount bigint NOT NULL,
        odds_bps integer NOT NULL,
        locked_ts bigint NOT NULL,
        claimed boolean NOT NULL DEFAULT false,
        won boolean NOT NULL DEFAULT false,
        predict_sig text,
        updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS positions_market ON positions (market_id);
      CREATE INDEX IF NOT EXISTS positions_user ON positions (user_pubkey);
      CREATE TABLE IF NOT EXISTS players (
        user_pubkey text PRIMARY KEY,
        points bigint NOT NULL DEFAULT 0,
        streak integer NOT NULL DEFAULT 0,
        best_streak integer NOT NULL DEFAULT 0,
        correct integer NOT NULL DEFAULT 0,
        total integer NOT NULL DEFAULT 0,
        last_refill_ts bigint NOT NULL DEFAULT 0,
        updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS replay_requests (
        id serial PRIMARY KEY,
        fixture_id bigint NOT NULL,
        speed double precision NOT NULL DEFAULT 1,
        status text NOT NULL DEFAULT 'pending',
        error text,
        requested_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        started_at timestamp(3),
        finished_at timestamp(3)
      );
    `);
  }

  async upsertFixture(f: {
    fixtureId: number;
    participant1: string;
    participant2: string;
    startTime: number;
    competitionId?: number;
    simulated?: boolean;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO fixtures (fixture_id, participant1, participant2, start_time, competition_id, simulated)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (fixture_id) DO UPDATE SET
         participant1=EXCLUDED.participant1, participant2=EXCLUDED.participant2,
         start_time=EXCLUDED.start_time, competition_id=EXCLUDED.competition_id,
         simulated=EXCLUDED.simulated, updated_at=CURRENT_TIMESTAMP`,
      [f.fixtureId, f.participant1, f.participant2, f.startTime, f.competitionId ?? null, f.simulated ?? false]
    );
  }

  async updateFixtureStatus(fixtureId: number, statusId: number): Promise<void> {
    await this.pool.query(
      `UPDATE fixtures SET status_id=$2, updated_at=CURRENT_TIMESTAMP WHERE fixture_id=$1`,
      [fixtureId, statusId]
    );
  }

  async upsertScoreState(fixtureId: number, s: Record<string, number>): Promise<void> {
    await this.pool.query(
      `INSERT INTO score_state (fixture_id, goals1, goals2, h1goals1, h1goals2, yellows1, yellows2,
                                reds1, reds2, corners1, corners2, status_id, ts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (fixture_id) DO UPDATE SET
         goals1=EXCLUDED.goals1, goals2=EXCLUDED.goals2,
         h1goals1=EXCLUDED.h1goals1, h1goals2=EXCLUDED.h1goals2,
         yellows1=EXCLUDED.yellows1, yellows2=EXCLUDED.yellows2,
         reds1=EXCLUDED.reds1, reds2=EXCLUDED.reds2,
         corners1=EXCLUDED.corners1, corners2=EXCLUDED.corners2,
         status_id=EXCLUDED.status_id, ts=EXCLUDED.ts, updated_at=CURRENT_TIMESTAMP`,
      [
        fixtureId,
        s.goals1 ?? 0, s.goals2 ?? 0, s.h1goals1 ?? 0, s.h1goals2 ?? 0,
        s.yellows1 ?? 0, s.yellows2 ?? 0, s.reds1 ?? 0, s.reds2 ?? 0,
        s.corners1 ?? 0, s.corners2 ?? 0, s.statusId ?? 1, s.ts ?? 0,
      ]
    );
  }

  async insertTicker(e: {
    fixtureId: number;
    seq: number;
    ts: number;
    kind: string;
    team?: number;
    label: string;
    weight: number;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO ticker_events (fixture_id, seq, ts, kind, team, label, weight)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (fixture_id, seq, kind) DO NOTHING`,
      [e.fixtureId, e.seq, e.ts, e.kind, e.team ?? null, e.label, e.weight]
    );
  }

  async insertCard(c: {
    marketId: bigint;
    fixtureId: number;
    marketPda: string;
    statKey: number;
    threshold: number;
    team?: number;
    question: string;
    triggerKind: string;
    triggerLabel: string;
    createdTs: number;
    deadlineTs: number;
    yesOddsBps: number;
    noOddsBps: number;
    createSig: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO cards (market_id, fixture_id, market_pda, stat_key, threshold, team, question,
                          trigger_kind, trigger_label, created_ts, deadline_ts,
                          opening_yes_odds_bps, opening_no_odds_bps, yes_odds_bps, no_odds_bps, create_sig)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$12,$13,$14)
       ON CONFLICT (market_id) DO NOTHING`,
      [
        c.marketId.toString(), c.fixtureId, c.marketPda, c.statKey, c.threshold, c.team ?? null,
        c.question, c.triggerKind, c.triggerLabel, c.createdTs, c.deadlineTs,
        c.yesOddsBps, c.noOddsBps, c.createSig,
      ]
    );
  }

  async updateCardOdds(marketId: bigint, yes: number, no: number): Promise<void> {
    await this.pool.query(
      `UPDATE cards SET yes_odds_bps=$2, no_odds_bps=$3, updated_at=CURRENT_TIMESTAMP WHERE market_id=$1`,
      [marketId.toString(), yes, no]
    );
  }

  async settleCard(
    marketId: bigint,
    status: "yes_won" | "no_won",
    proofTs: number | null,
    sig: string,
    settleSeq: number | null = null
  ): Promise<void> {
    await this.pool.query(
      `UPDATE cards SET status=$2, settled_proof_ts=$3, settle_sig=$4, settle_seq=$5, updated_at=CURRENT_TIMESTAMP
       WHERE market_id=$1`,
      [marketId.toString(), status, proofTs, sig, settleSeq]
    );
  }

  async openCards(fixtureId?: number): Promise<any[]> {
    const r = fixtureId
      ? await this.pool.query(`SELECT * FROM cards WHERE status='open' AND fixture_id=$1`, [fixtureId])
      : await this.pool.query(`SELECT * FROM cards WHERE status='open'`);
    return r.rows;
  }

  async upsertPosition(p: {
    positionPda: string;
    marketId: bigint;
    userPubkey: string;
    side: boolean;
    amount: bigint;
    oddsBps: number;
    lockedTs: number;
    claimed: boolean;
    won: boolean;
    predictSig?: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO positions (position_pda, market_id, user_pubkey, side, amount, odds_bps, locked_ts, claimed, won, predict_sig)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (position_pda) DO UPDATE SET
         claimed=EXCLUDED.claimed, won=EXCLUDED.won,
         predict_sig=COALESCE(positions.predict_sig, EXCLUDED.predict_sig),
         updated_at=CURRENT_TIMESTAMP`,
      [
        p.positionPda, p.marketId.toString(), p.userPubkey, p.side,
        p.amount.toString(), p.oddsBps, p.lockedTs, p.claimed, p.won,
        p.predictSig ?? null,
      ]
    );
  }

  async upsertPlayer(p: {
    userPubkey: string;
    points: bigint;
    streak: number;
    bestStreak: number;
    correct: number;
    total: number;
    lastRefillTs: number;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO players (user_pubkey, points, streak, best_streak, correct, total, last_refill_ts)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_pubkey) DO UPDATE SET
         points=EXCLUDED.points, streak=EXCLUDED.streak, best_streak=EXCLUDED.best_streak,
         correct=EXCLUDED.correct, total=EXCLUDED.total, last_refill_ts=EXCLUDED.last_refill_ts,
         updated_at=CURRENT_TIMESTAMP`,
      [p.userPubkey, p.points.toString(), p.streak, p.bestStreak, p.correct, p.total, p.lastRefillTs]
    );
  }

  async nextReplayRequest(): Promise<any | null> {
    const r = await this.pool.query(
      `UPDATE replay_requests SET status='running', started_at=CURRENT_TIMESTAMP
       WHERE id = (SELECT id FROM replay_requests WHERE status='pending' ORDER BY id LIMIT 1)
       RETURNING *`
    );
    return r.rows[0] ?? null;
  }

  async finishReplayRequest(id: number, error?: string): Promise<void> {
    await this.pool.query(
      `UPDATE replay_requests SET status=$2, error=$3, finished_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [id, error ? "error" : "done", error ?? null]
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
