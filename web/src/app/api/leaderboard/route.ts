import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";
import { getSession } from "@/lib/session";

const MIN_VOLUME = 5;

/**
 * Points are the visible flex; PRIZE RANK IS ACCURACY over a minimum
 * volume. Splitting a bankroll across Sybil accounts doesn't improve
 * accuracy, so farming accounts buys nothing — this ordering is the
 * anti-abuse mechanism, not just a display choice.
 */
export async function GET() {
  const session = await getSession();
  const [players, users] = await Promise.all([
    prisma.player.findMany(),
    prisma.user.findMany({ select: { username: true, walletPubkey: true } }),
  ]);
  const nameBy = new Map(users.map((u) => [u.walletPubkey, u.username]));

  const rows = players
    .filter((p) => nameBy.has(p.userPubkey))
    .map((p) => ({
      username: nameBy.get(p.userPubkey)!,
      points: Number(p.points),
      correct: p.correct,
      total: p.total,
      streak: p.streak,
      bestStreak: p.bestStreak,
      accuracy: p.total ? p.correct / p.total : 0,
      qualified: p.total >= MIN_VOLUME,
    }))
    .sort(
      (a, b) =>
        Number(b.qualified) - Number(a.qualified) ||
        b.accuracy - a.accuracy ||
        b.points - a.points
    )
    .slice(0, 100)
    .map((r, i) => ({ rank: i + 1, ...r, accuracy: Math.round(r.accuracy * 100) }));

  return jsonResponse({
    leaderboard: rows,
    minVolume: MIN_VOLUME,
    me: session.username ?? null,
  });
}
