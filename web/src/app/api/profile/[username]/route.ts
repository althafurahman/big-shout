import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";
import { statFamily } from "@/lib/meta";

/**
 * A public profile is a URL with someone's whole provable history: every
 * receipt derives from a settled on-chain Position, so every brag on this
 * page can be checked by anyone.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return Response.json({ error: "No such fan" }, { status: 404 });

  const [player, positions] = await Promise.all([
    prisma.player.findUnique({ where: { userPubkey: user.walletPubkey } }),
    prisma.position.findMany({
      where: { userPubkey: user.walletPubkey },
      orderBy: { lockedTs: "desc" },
      take: 60,
    }),
  ]);

  const cards = await prisma.card.findMany({
    where: { marketId: { in: positions.map((p) => p.marketId) } },
  });
  const fixtures = await prisma.fixture.findMany({
    where: { fixtureId: { in: cards.map((c) => c.fixtureId) } },
  });
  const cardBy = new Map(cards.map((c) => [c.marketId.toString(), c]));
  const fixtureBy = new Map(fixtures.map((f) => [f.fixtureId.toString(), f]));

  // Positions whose card metadata isn't in this database (e.g. cleared test
  // rounds re-mirrored from chain) have nothing to display — skip them.
  const receipts = positions.filter((p) => cardBy.has(p.marketId.toString())).map((p) => {
    const card = cardBy.get(p.marketId.toString());
    const fixture = card ? fixtureBy.get(card.fixtureId.toString()) : null;
    return {
      positionPda: p.positionPda,
      side: p.side,
      amount: Number(p.amount),
      oddsBps: p.oddsBps,
      lockedTs: Number(p.lockedTs),
      claimed: p.claimed,
      won: p.won,
      settled: card ? card.status !== "open" : false,
      question: card?.question ?? "",
      status: card?.status ?? "open",
      fixture: fixture
        ? { p1: fixture.participant1, p2: fixture.participant2, simulated: fixture.simulated }
        : null,
    };
  });

  // Reputation by stat type: what kind of fan are you?
  const rep: Record<string, { correct: number; total: number }> = {};
  for (const p of positions) {
    const card = cardBy.get(p.marketId.toString());
    if (!card || card.status === "open" || !p.claimed) continue;
    const fam = statFamily(card.statKey);
    rep[fam] = rep[fam] ?? { correct: 0, total: 0 };
    rep[fam].total += 1;
    if (p.won) rep[fam].correct += 1;
  }

  const bestCall = receipts
    .filter((r) => r.won)
    .sort((a, b) => b.oddsBps - a.oddsBps)[0] ?? null;

  return jsonResponse({
    username,
    stats: {
      points: Number(player?.points ?? 0),
      streak: player?.streak ?? 0,
      bestStreak: player?.bestStreak ?? 0,
      correct: player?.correct ?? 0,
      total: player?.total ?? 0,
    },
    reputation: Object.entries(rep).map(([family, r]) => ({
      family,
      correct: r.correct,
      total: r.total,
      pct: Math.round((r.correct / r.total) * 100),
    })),
    bestCall,
    receipts,
  });
}
