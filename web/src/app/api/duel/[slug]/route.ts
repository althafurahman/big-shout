import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";
import { getSession } from "@/lib/session";

/**
 * A match room: friends around one match, every settled call scored into a
 * room leaderboard. Rooms are read-models too — a member's row derives
 * entirely from their on-chain positions on this fixture's markets.
 */
async function roomPayload(slug: string, sessionUserId?: string) {
  const duel = await prisma.duel.findUnique({
    where: { slug },
    include: {
      challenger: true,
      opponent: true,
      members: { include: { user: true }, orderBy: { joinedAt: "asc" } },
    },
  });
  if (!duel) return null;

  // Legacy two-seat duels: treat challenger/opponent as members.
  const memberUsers = new Map<string, { id: string; username: string; walletPubkey: string }>();
  for (const m of duel.members) memberUsers.set(m.user.id, m.user);
  memberUsers.set(duel.challenger.id, duel.challenger);
  if (duel.opponent) memberUsers.set(duel.opponent.id, duel.opponent);

  const [cards, fixture, score] = await Promise.all([
    prisma.card.findMany({ where: { fixtureId: duel.fixtureId }, orderBy: { createdTs: "desc" } }),
    prisma.fixture.findUnique({ where: { fixtureId: duel.fixtureId } }),
    prisma.scoreState.findUnique({ where: { fixtureId: duel.fixtureId } }),
  ]);

  const wallets = [...memberUsers.values()].map((u) => u.walletPubkey);
  const positions = cards.length
    ? await prisma.position.findMany({
        where: {
          userPubkey: { in: wallets },
          marketId: { in: cards.map((c) => c.marketId) },
        },
      })
    : [];
  const byWallet = new Map<string, typeof positions>();
  for (const p of positions) {
    const list = byWallet.get(p.userPubkey) ?? [];
    list.push(p);
    byWallet.set(p.userPubkey, list);
  }

  const board = [...memberUsers.values()]
    .map((u) => {
      const mine = byWallet.get(u.walletPubkey) ?? [];
      const settledMine = mine.filter((p) => p.claimed);
      const pointsWon = settledMine
        .filter((p) => p.won)
        .reduce((acc, p) => acc + Math.floor((Number(p.amount) * p.oddsBps) / 10_000), 0);
      return {
        username: u.username,
        isYou: u.id === sessionUserId,
        calls: mine.length,
        correct: settledMine.filter((p) => p.won).length,
        settled: settledMine.length,
        pointsWon,
        staked: mine.reduce((acc, p) => acc + Number(p.amount), 0),
      };
    })
    .sort((a, b) => b.correct - a.correct || b.pointsWon - a.pointsWon || b.calls - a.calls);

  const posOf = (wallet: string, marketId: bigint) =>
    (byWallet.get(wallet) ?? []).find((p) => p.marketId === marketId);

  return {
    slug,
    fixture: fixture
      ? {
          fixtureId: Number(fixture.fixtureId),
          p1: fixture.participant1,
          p2: fixture.participant2,
          simulated: fixture.simulated,
          statusId: score?.statusId ?? fixture.statusId,
          goals1: score?.goals1 ?? 0,
          goals2: score?.goals2 ?? 0,
        }
      : null,
    board,
    cards: cards.slice(0, 12).map((c) => ({
      marketId: Number(c.marketId),
      question: c.question,
      status: c.status,
      picks: [...memberUsers.values()]
        .map((u) => {
          const p = posOf(u.walletPubkey, c.marketId);
          return p
            ? { username: u.username, side: p.side, won: p.won, claimed: p.claimed }
            : null;
        })
        .filter(Boolean),
    })),
    isMember: !!sessionUserId && memberUsers.has(sessionUserId),
    canJoin: !!sessionUserId && !memberUsers.has(sessionUserId),
    isOwner: !!sessionUserId && duel.challengerId === sessionUserId,
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const session = await getSession();
  const payload = await roomPayload(slug, session.userId);
  if (!payload) return Response.json({ error: "No such room" }, { status: 404 });
  return jsonResponse(payload);
}

/** The owner can close their room; everyone's calls stay on-chain. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const session = await getSession();
  if (!session.userId) return Response.json({ error: "Sign in first" }, { status: 401 });

  const duel = await prisma.duel.findUnique({ where: { slug } });
  if (!duel) return Response.json({ error: "No such room" }, { status: 404 });
  if (duel.challengerId !== session.userId) {
    return Response.json({ error: "Only the room owner can delete it" }, { status: 403 });
  }

  await prisma.duelMember.deleteMany({ where: { duelId: duel.id } });
  await prisma.duel.delete({ where: { id: duel.id } });
  return Response.json({ deleted: true });
}

/** Take a seat in the room. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const session = await getSession();
  if (!session.userId) return Response.json({ error: "Sign in first" }, { status: 401 });

  const duel = await prisma.duel.findUnique({ where: { slug } });
  if (!duel) return Response.json({ error: "No such room" }, { status: 404 });

  await prisma.duelMember.upsert({
    where: { duelId_userId: { duelId: duel.id, userId: session.userId } },
    create: { duelId: duel.id, userId: session.userId },
    update: {},
  });
  const payload = await roomPayload(slug, session.userId);
  return jsonResponse(payload);
}
