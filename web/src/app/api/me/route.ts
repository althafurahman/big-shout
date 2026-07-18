import { prisma } from "@/lib/db";
import { DAILY_ALLOWANCE } from "@/lib/config";
import { jsonResponse } from "@/lib/json";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session.userId) return Response.json({ user: null });

  const player = await prisma.player.findUnique({
    where: { userPubkey: session.walletPubkey! },
  });

  // The on-chain allowance tops up on the first prediction of a new UTC
  // day; mirror that here so the header shows what's actually stakeable.
  const day = (t: number) => Math.floor(t / 86_400);
  const now = Math.floor(Date.now() / 1000);
  const points = Number(player?.points ?? 0);
  const refilled =
    !player || day(now) > day(Number(player.lastRefillTs))
      ? Math.max(points, DAILY_ALLOWANCE)
      : points;

  return jsonResponse({
    user: {
      username: session.username,
      points: refilled,
      streak: player?.streak ?? 0,
      bestStreak: player?.bestStreak ?? 0,
      correct: player?.correct ?? 0,
      total: player?.total ?? 0,
    },
  });
}
