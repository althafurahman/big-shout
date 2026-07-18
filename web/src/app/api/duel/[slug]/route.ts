import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";
import { getSession } from "@/lib/session";

async function duelPayload(slug: string, sessionUserId?: string) {
  const duel = await prisma.duel.findUnique({
    where: { slug },
    include: { challenger: true, opponent: true },
  });
  if (!duel) return null;

  const cards = await prisma.card.findMany({
    where: { fixtureId: duel.fixtureId },
    orderBy: { createdTs: "asc" },
  });
  const fixture = await prisma.fixture.findUnique({ where: { fixtureId: duel.fixtureId } });

  const sideOf = async (walletPubkey?: string) => {
    if (!walletPubkey) return null;
    const positions = await prisma.position.findMany({
      where: { userPubkey: walletPubkey, marketId: { in: cards.map((c) => c.marketId) } },
    });
    const posBy = new Map(positions.map((p) => [p.marketId.toString(), p]));
    const settled = positions.filter((p) => p.claimed);
    return {
      calls: cards.map((c) => {
        const p = posBy.get(c.marketId.toString());
        return p
          ? { marketId: Number(c.marketId), side: p.side, oddsBps: p.oddsBps, won: p.won, claimed: p.claimed }
          : { marketId: Number(c.marketId), side: null };
      }),
      correct: settled.filter((p) => p.won).length,
      total: settled.length,
      staked: positions.reduce((a, p) => a + Number(p.amount), 0),
    };
  };

  return {
    slug,
    fixture: fixture
      ? {
          fixtureId: Number(fixture.fixtureId),
          p1: fixture.participant1,
          p2: fixture.participant2,
          simulated: fixture.simulated,
        }
      : null,
    cards: cards.map((c) => ({
      marketId: Number(c.marketId),
      question: c.question,
      status: c.status,
    })),
    challenger: {
      username: duel.challenger.username,
      ...(await sideOf(duel.challenger.walletPubkey)),
    },
    opponent: duel.opponent
      ? { username: duel.opponent.username, ...(await sideOf(duel.opponent.walletPubkey)) }
      : null,
    canJoin: !duel.opponentId && !!sessionUserId && sessionUserId !== duel.challengerId,
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const session = await getSession();
  const payload = await duelPayload(slug, session.userId);
  if (!payload) return Response.json({ error: "No such duel" }, { status: 404 });
  return jsonResponse(payload);
}

/** Second fan opens the link and takes the other chair. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const session = await getSession();
  if (!session.userId) return Response.json({ error: "Sign in first" }, { status: 401 });

  const duel = await prisma.duel.findUnique({ where: { slug } });
  if (!duel) return Response.json({ error: "No such duel" }, { status: 404 });
  if (!duel.opponentId && duel.challengerId !== session.userId) {
    await prisma.duel.update({
      where: { slug },
      data: { opponentId: session.userId },
    });
  }
  const payload = await duelPayload(slug, session.userId);
  return jsonResponse(payload);
}
