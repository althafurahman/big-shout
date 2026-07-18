import { Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import { Chain } from "./chain";
import { Db } from "./db";

/**
 * Bot runner: seeded fans play open cards through the real predict
 * instruction — same program path as humans, service wallet paying fees.
 * Accuracy differences on the leaderboard come from genuine on-chain
 * settlements of genuinely varied calls, not invented stats.
 *
 * Run alongside a replay: npm run bots
 */

interface Bot {
  username: string;
  keypair: Keypair;
  /** How YES-happy this fan is, 0..1 — variety makes consensus interesting. */
  yesBias: number;
  /** Chance to play any given card at all. */
  activity: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const raw = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../_keys/bots.json"), "utf8")
  ) as { username: string; secret: number[] }[];
  // Deterministic per-bot personality from the username hash.
  const bots: Bot[] = raw.map((b, i) => ({
    username: b.username,
    keypair: Keypair.fromSecretKey(Uint8Array.from(b.secret)),
    yesBias: 0.25 + ((i * 37) % 100) / 200, // 0.25..0.74
    activity: 0.35 + ((i * 53) % 100) / 250, // 0.35..0.74
  }));

  const chain = new Chain();
  const db = new Db();
  const played = new Set<string>();
  console.log(`[bots] ${bots.length} fans in the stands`);

  for (;;) {
    const cards = await db.openCards();
    const now = Math.floor(Date.now() / 1000);
    for (const card of cards) {
      const marketId = BigInt(card.market_id);
      const deadline = Number(card.deadline_ts);
      if (deadline - now < 20) continue; // too late to pile in
      for (const bot of bots) {
        const key = `${card.market_id}:${bot.username}`;
        if (played.has(key)) continue;
        played.add(key);
        if (Math.random() > bot.activity) continue;
        const side = Math.random() < bot.yesBias;
        const stake = [25, 50, 50, 100, 100, 250][Math.floor(Math.random() * 6)];
        try {
          await chain.predictAs(bot.keypair, marketId, side, BigInt(stake));
          console.log(`[bots] ${bot.username}: ${side ? "YES" : "NO"} ${stake} on ${card.market_id}`);
        } catch (e: any) {
          console.error(`[bots] ${bot.username} failed:`, e.message?.slice(0, 100));
        }
        await sleep(400); // spread the crowd out
      }
    }
    await sleep(5000);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
