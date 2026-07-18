import { Chain } from "./chain";
import { config } from "./config";
import { Db } from "./db";
import { Engine } from "./engine";
import { OddsEngine } from "./odds";
import { field, recSeq, recTs } from "./scores";
import { TxLine } from "./txline";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The replay harness: pipes a finished fixture's historical records through
 * the SAME pipeline as live — same card triggers, same odds drift, same
 * Merkle proofs, same on-chain settlement. Only the feed source differs.
 * The fixture is flagged `simulated` so the UI labels it "simulated live".
 *
 * Historical proofs verify against that day's on-chain root, which persists
 * — so replay settlements are real oracle-verified devnet transactions, not
 * mocks. (One nuance, also in the README: on live data the program's
 * proof-ts-before-deadline guard binds; in replay the harness clock enforces
 * the window instead, since historical timestamps predate any deadline.)
 *
 * `speed` compresses both the record pacing and the card windows, so a
 * 10-minute question plays out in 10/speed minutes of wall clock.
 */
export async function runReplay(
  chain: Chain,
  tx: TxLine,
  db: Db,
  fixtureId: number,
  speed = 4
): Promise<void> {
  const engine = new Engine(chain, tx, db, new OddsEngine(), { simulated: true, speed });

  const records = (await tx.scoresHistorical(fixtureId))
    .filter((r) => recSeq(r) !== undefined)
    .sort((a, b) => (recSeq(a) ?? 0) - (recSeq(b) ?? 0));
  if (!records.length) throw new Error(`no historical records for fixture ${fixtureId}`);

  // Resolve team names from the fixtures snapshot for the record's day.
  let p1 = "Team 1";
  let p2 = "Team 2";
  const firstTs = recTs(records[0]) ?? Date.now();
  try {
    const day = Math.floor(firstTs / 86_400_000);
    const fixtures = await tx.fixturesSnapshot(day - 1, config.competitionId);
    const f = fixtures.find((x) => field(x, "fixtureId") === fixtureId);
    if (f) {
      p1 = field(f, "participant1") ?? p1;
      p2 = field(f, "participant2") ?? p2;
    }
  } catch {
    /* names are cosmetic; keep going */
  }

  await engine.registerFixture({ fixtureId, p1, p2, startTime: firstTs });
  console.log(`[replay] ${p1} vs ${p2} · ${records.length} records @ ${speed}x`);

  let lastHousekeep = 0;
  let lastIndex = 0;
  for (let i = 0; i < records.length; i++) {
    await engine.onRecord(records[i]);

    const now = Date.now();
    if (now - lastHousekeep > 10_000) {
      lastHousekeep = now;
      await engine.expiryTick();
      await engine.oddsTick();
    }
    if (now - lastIndex > 30_000) {
      lastIndex = now;
      await engine.indexTick();
    }

    if (i + 1 < records.length) {
      const dt = ((recTs(records[i + 1]) ?? 0) - (recTs(records[i]) ?? 0)) / speed;
      // Cap stalls (halftime!) so the demo never sits idle for 7 minutes.
      await sleep(Math.min(Math.max(dt, 0), 15_000));
    }
  }

  // Let the last open cards run out, then close the books.
  console.log(`[replay] records done; waiting for open markets to settle (${engine.openCount} open)`);
  const waitUntil = Date.now() + 8 * 60_000;
  while (engine.openCount > 0 && Date.now() < waitUntil) {
    await engine.expiryTick();
    await sleep(10_000);
  }
  await engine.indexTick();
  console.log(`[replay] complete`);
}

// CLI: npm run replay -- <fixtureId> [speed]
if (require.main === module) {
  (async () => {
    const fixtureId = Number(process.argv[2] ?? process.env.FIXTURE_ID);
    const speed = Number(process.argv[3] ?? process.env.SPEED ?? 4);
    if (!fixtureId) {
      console.error("usage: npm run replay -- <fixtureId> [speed]");
      process.exit(1);
    }
    const db = new Db();
    await db.ensureSchema();
    const chain = new Chain();
    const tx = new TxLine();
    await tx.renewJwt();
    await runReplay(chain, tx, db, fixtureId, speed);
    await db.close();
    process.exit(0);
  })().catch((e) => {
    console.error("REPLAY FAILED:", e);
    process.exit(1);
  });
}
