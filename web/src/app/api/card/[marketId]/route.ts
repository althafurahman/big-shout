import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";

/** Polled by an open card for live odds drift and the countdown. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ marketId: string }> }
) {
  const marketId = BigInt((await params).marketId);
  const card = await prisma.card.findUnique({ where: { marketId } });
  if (!card) return Response.json({ error: "Unknown card" }, { status: 404 });
  const now = Math.floor(Date.now() / 1000);
  return jsonResponse({
    status: card.status,
    yesOddsBps: card.yesOddsBps,
    noOddsBps: card.noOddsBps,
    openingYesOddsBps: card.openingYesOddsBps,
    openingNoOddsBps: card.openingNoOddsBps,
    yesCount: card.yesCount,
    noCount: card.noCount,
    timeLeft: card.status === "open" ? Math.max(0, Number(card.deadlineTs) - now) : 0,
    settleSig: card.settleSig,
  });
}
