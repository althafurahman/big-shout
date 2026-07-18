import { Chain } from "./chain";
import { config } from "./config";
import { Db } from "./db";
import { Engine } from "./engine";
import { OddsEngine } from "./odds";
import { runReplay } from "./replay";
import { field } from "./scores";
import { TxLine } from "./txline";

/**
 * Autonomous live cranker. No per-match configuration:
 *  - discovers World Cup fixtures from TxLINE (re-discovers every 15 min);
 *  - follows ONE unfiltered scores SSE stream and routes records by fixture;
 *  - fires cards off real events, drifts odds while cards are open,
 *    settles YES by Merkle proof / NO by expiry, sweeps claims;
 *  - mirrors chain accounts into the shared Postgres read-models;
 *  - picks up judge-triggered replay requests from the DB and runs the
 *    replay harness through this same pipeline.
 */

// The public devnet RPC 429s under load and web3.js can surface that as an
// unhandled rejection from its retry callbacks — log and keep running.
process.on("unhandledRejection", (e: any) => {
  console.error("[rpc] hiccup:", e?.message?.slice(0, 120) ?? e);
});

async function main() {
  const db = new Db();
  await db.ensureSchema();
  const chain = new Chain();
  const tx = new TxLine();
  await tx.renewJwt();
  const engine = new Engine(chain, tx, db, new OddsEngine(), { simulated: false, speed: 1 });

  console.log(
    `[cranker] live mode · network=${config.network} · service=${chain.service.publicKey.toBase58()}`
  );

  const discover = async () => {
    const today = Math.floor(Date.now() / 86_400_000);
    let fixtures: any[] = [];
    try {
      fixtures = await tx.fixturesSnapshot(today - 2, config.competitionId);
    } catch (e: any) {
      console.error("[discover] fixtures fetch failed:", e.message);
      return;
    }
    for (const f of fixtures) {
      const fid = field(f, "fixtureId");
      if (!fid) continue;
      await engine.registerFixture({
        fixtureId: fid,
        p1: field(f, "participant1") ?? "Home",
        p2: field(f, "participant2") ?? "Away",
        startTime: field(f, "startTime") ?? 0,
        competitionId: config.competitionId,
      });
    }
    console.log(`[discover] tracking ${fixtures.length} fixtures`);
  };

  await discover();
  setInterval(() => discover().catch(() => {}), 15 * 60_000);

  await engine.loadOpenMarkets();

  await tx.streamScores(
    undefined,
    (rec) => void engine.onRecord(rec).catch((e) => console.error("[stream]", e.message)),
    (e: any) => console.error("[stream] error (auto-reconnects):", e?.message ?? e)
  );

  // Odds stream: availability varies on devnet; used to refresh strength
  // priors when a recognizable fixture price shows up.
  tx.streamOdds(
    (rec) => {
      const fid = field(rec, "fixtureId");
      if (fid) engine.odds.setFromOddsSnapshot(fid, rec);
    },
    () => {}
  ).catch(() => console.log("[odds-stream] unavailable; priors from snapshots only"));

  setInterval(() => void engine.expiryTick(), 30_000);
  setInterval(() => void engine.oddsTick(), 45_000);
  setInterval(() => void engine.idleTick(), 60_000);
  setInterval(() => void engine.indexTick(), 45_000);

  // Judge-triggered replays, queued by the web app.
  let replayBusy = false;
  setInterval(async () => {
    if (replayBusy) return;
    const req = await db.nextReplayRequest().catch(() => null);
    if (!req) return;
    replayBusy = true;
    console.log(`[replay] request #${req.id}: fixture ${req.fixture_id} @ ${req.speed}x`);
    try {
      await runReplay(chain, tx, db, Number(req.fixture_id), Number(req.speed));
      await db.finishReplayRequest(req.id);
    } catch (e: any) {
      console.error(`[replay] failed:`, e.message);
      await db.finishReplayRequest(req.id, e.message?.slice(0, 300));
    } finally {
      replayBusy = false;
    }
  }, 10_000);

  console.log(`[cranker] streaming all fixtures`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
