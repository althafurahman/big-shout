import { prisma } from "@/lib/db";
import { sendPredict } from "@/lib/chain";
import { jsonResponse } from "@/lib/json";
import { getSession } from "@/lib/session";
import { decryptSecret } from "@/lib/walletcrypto";

/**
 * The lock. Builds and sends the on-chain predict transaction: the user's
 * custodial wallet signs as owner, the service wallet pays fees. The call is
 * sealed with a timestamp and the odds taken, before the outcome is known.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session.userId) {
    return Response.json({ error: "Sign up to make it count" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const marketId = BigInt(body.marketId ?? 0);
  const side = Boolean(body.side);
  const stake = Math.floor(Number(body.stake ?? 0));
  if (!marketId || stake < 10 || stake > 1_000_000) {
    return Response.json({ error: "Stake must be at least 10 points" }, { status: 400 });
  }

  const card = await prisma.card.findUnique({ where: { marketId } });
  if (!card || card.status !== "open") {
    return Response.json({ error: "This card has already settled" }, { status: 409 });
  }
  const now = Math.floor(Date.now() / 1000);
  if (now >= Number(card.deadlineTs) - 2) {
    return Response.json({ error: "Too late — the window just closed" }, { status: 409 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return Response.json({ error: "Account not found" }, { status: 401 });

  const existing = await prisma.position.findFirst({
    where: { marketId, userPubkey: user.walletPubkey },
  });
  if (existing) {
    return Response.json({ error: "You already called this one" }, { status: 409 });
  }

  try {
    const { sig, positionPda } = await sendPredict(
      decryptSecret(user.walletSecretEnc),
      marketId,
      side,
      stake
    );

    const oddsBps = side ? card.yesOddsBps : card.noOddsBps;
    await prisma.position.upsert({
      where: { positionPda },
      create: {
        positionPda,
        marketId,
        userPubkey: user.walletPubkey,
        side,
        amount: BigInt(stake),
        oddsBps,
        lockedTs: BigInt(now),
        predictSig: sig,
      },
      update: { predictSig: sig },
    });
    const updated = await prisma.card.update({
      where: { marketId },
      data: side
        ? { yesCount: { increment: 1 }, yesStaked: { increment: stake } }
        : { noCount: { increment: 1 }, noStaked: { increment: stake } },
    });

    // The consensus reveal: what everyone else swiped, shown only after
    // your own call is locked.
    const total = updated.yesCount + updated.noCount;
    return jsonResponse({
      sig,
      positionPda,
      oddsBps,
      consensus: {
        yesCount: updated.yesCount,
        noCount: updated.noCount,
        yesPct: total ? Math.round((updated.yesCount / total) * 100) : side ? 100 : 0,
      },
    });
  } catch (e: any) {
    const msg: string = e.message ?? "transaction failed";
    if (msg.includes("InsufficientPoints")) {
      return Response.json({ error: "Not enough points — allowance refills tomorrow" }, { status: 400 });
    }
    if (msg.includes("PredictionsClosed") || msg.includes("MarketNotOpen")) {
      return Response.json({ error: "Too late — the window just closed" }, { status: 409 });
    }
    console.error("[predict]", msg);
    return Response.json({ error: "Couldn't lock your call — try again" }, { status: 500 });
  }
}
