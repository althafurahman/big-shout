import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";
import { getSession } from "@/lib/session";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  const fixtureId = BigInt((await params).fixtureId);
  const session = await getSession();

  const [fixture, score, ticker, cards] = await Promise.all([
    prisma.fixture.findUnique({ where: { fixtureId } }),
    prisma.scoreState.findUnique({ where: { fixtureId } }),
    prisma.tickerEvent.findMany({
      where: { fixtureId },
      orderBy: { id: "desc" },
      take: 30,
    }),
    prisma.card.findMany({
      where: { fixtureId },
      orderBy: { createdTs: "desc" },
      take: 20,
    }),
  ]);
  if (!fixture) return Response.json({ error: "Unknown match" }, { status: 404 });

  // Pressure meter: decayed event-weight density over the last 5 minutes of
  // wall clock (works for both live and replay, which both write in real
  // time). 0..1 per team.
  const cutoff = new Date(Date.now() - 5 * 60_000);
  const recent = await prisma.tickerEvent.findMany({
    where: { fixtureId, createdAt: { gt: cutoff } },
  });
  const decayed = (team: number) =>
    recent
      .filter((e) => e.team === team)
      .reduce((acc, e) => {
        const age = (Date.now() - e.createdAt.getTime()) / 300_000;
        return acc + e.weight * (1 - age);
      }, 0);
  const pressure = {
    p1: Math.min(1, decayed(1) / 2.5),
    p2: Math.min(1, decayed(2) / 2.5),
  };

  let positions: any[] = [];
  if (session.walletPubkey && cards.length) {
    positions = await prisma.position.findMany({
      where: {
        userPubkey: session.walletPubkey,
        marketId: { in: cards.map((c) => c.marketId) },
      },
    });
  }

  const now = Math.floor(Date.now() / 1000);
  return jsonResponse({
    fixture: {
      fixtureId: Number(fixture.fixtureId),
      p1: fixture.participant1,
      p2: fixture.participant2,
      startTime: Number(fixture.startTime),
      simulated: fixture.simulated,
    },
    score: score ?? null,
    statusId: score?.statusId ?? fixture.statusId,
    ticker,
    pressure,
    cards: cards.map((c) => ({
      ...c,
      timeLeft: c.status === "open" ? Math.max(0, Number(c.deadlineTs) - now) : 0,
    })),
    positions,
    serverNow: now,
  });
}
