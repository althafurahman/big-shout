import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";
import { isFinished } from "@/lib/meta";
import { getSession } from "@/lib/session";

/** Every room this fan sits in — active matches first, so an ongoing
 *  session is always one tap away from anywhere. */
export async function GET() {
  const session = await getSession();
  if (!session.userId) return jsonResponse({ rooms: [] });

  const duels = await prisma.duel.findMany({
    where: {
      OR: [
        { members: { some: { userId: session.userId } } },
        { challengerId: session.userId },
        { opponentId: session.userId },
      ],
    },
    include: { members: true },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  if (!duels.length) return jsonResponse({ rooms: [] });

  const fixtureIds = [...new Set(duels.map((d) => d.fixtureId))];
  const [fixtures, scores] = await Promise.all([
    prisma.fixture.findMany({ where: { fixtureId: { in: fixtureIds } } }),
    prisma.scoreState.findMany({ where: { fixtureId: { in: fixtureIds } } }),
  ]);
  const fixtureBy = new Map(fixtures.map((f) => [f.fixtureId.toString(), f]));
  const scoreBy = new Map(scores.map((s) => [s.fixtureId.toString(), s]));

  const rooms = duels
    .map((d) => {
      const f = fixtureBy.get(d.fixtureId.toString());
      const s = scoreBy.get(d.fixtureId.toString());
      const statusId = s?.statusId ?? f?.statusId ?? 1;
      return {
        slug: d.slug,
        fixtureId: Number(d.fixtureId),
        p1: f?.participant1 ?? "—",
        p2: f?.participant2 ?? "—",
        statusId,
        goals1: s?.goals1 ?? 0,
        goals2: s?.goals2 ?? 0,
        members: Math.max(d.members.length, d.opponentId ? 2 : 1),
        active: !isFinished(statusId),
      };
    })
    .sort((a, b) => Number(b.active) - Number(a.active));

  return jsonResponse({ rooms });
}
