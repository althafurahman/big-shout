import { prisma } from "@/lib/db";
import { explorerTx } from "@/lib/config";
import { jsonResponse } from "@/lib/json";

/** One receipt: public, shareable, built to be screenshotted. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ positionPda: string }> }
) {
  const { positionPda } = await params;
  const position = await prisma.position.findUnique({ where: { positionPda } });
  if (!position) return Response.json({ error: "No such receipt" }, { status: 404 });

  const [card, user] = await Promise.all([
    prisma.card.findUnique({ where: { marketId: position.marketId } }),
    prisma.user.findFirst({ where: { walletPubkey: position.userPubkey } }),
  ]);
  const fixture = card
    ? await prisma.fixture.findUnique({ where: { fixtureId: card.fixtureId } })
    : null;

  return jsonResponse({
    username: user?.username ?? "anon",
    question: card?.question ?? "",
    side: position.side,
    amount: Number(position.amount),
    oddsBps: position.oddsBps,
    lockedTs: Number(position.lockedTs),
    status: card?.status ?? "open",
    won: position.won,
    claimed: position.claimed,
    marketId: Number(position.marketId),
    fixture: fixture
      ? { p1: fixture.participant1, p2: fixture.participant2, simulated: fixture.simulated }
      : null,
    links: {
      lockTx: position.predictSig ? explorerTx(position.predictSig) : null,
      settleTx: card?.settleSig ? explorerTx(card.settleSig) : null,
      verify: card ? `/verify/${position.marketId}` : null,
    },
  });
}
