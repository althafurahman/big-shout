import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";
import { isFinished, isLive } from "@/lib/meta";

export async function GET() {
  const [fixtures, scores, openCards] = await Promise.all([
    prisma.fixture.findMany({ orderBy: { startTime: "asc" } }),
    prisma.scoreState.findMany(),
    prisma.card.groupBy({
      by: ["fixtureId"],
      where: { status: "open" },
      _count: true,
    }),
  ]);

  const scoreBy = new Map(scores.map((s) => [s.fixtureId.toString(), s]));
  const cardsBy = new Map(openCards.map((c) => [c.fixtureId.toString(), c._count]));

  const rows = fixtures.map((f) => {
    const s = scoreBy.get(f.fixtureId.toString());
    return {
      fixtureId: Number(f.fixtureId),
      p1: f.participant1,
      p2: f.participant2,
      startTime: Number(f.startTime),
      statusId: s?.statusId ?? f.statusId,
      simulated: f.simulated,
      goals1: s?.goals1 ?? 0,
      goals2: s?.goals2 ?? 0,
      openCards: cardsBy.get(f.fixtureId.toString()) ?? 0,
    };
  });

  const rank = (r: (typeof rows)[number]) =>
    isLive(r.statusId) ? 0 : !isFinished(r.statusId) ? 1 : 2;
  rows.sort((a, b) => rank(a) - rank(b) || a.startTime - b.startTime);

  return jsonResponse({ fixtures: rows });
}
