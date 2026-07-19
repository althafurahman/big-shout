import crypto from "crypto";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";
import { getSession } from "@/lib/session";
import { isFinished } from "@/lib/meta";

/** Open a match room: same cards, live room leaderboard, invite by link. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session.userId) return Response.json({ error: "Sign in first" }, { status: 401 });

  const { fixtureId } = await req.json().catch(() => ({}));
  if (!fixtureId) return Response.json({ error: "fixtureId required" }, { status: 400 });

  // A room is for calling a match together — no rooms on finished matches.
  const score = await prisma.scoreState.findUnique({ where: { fixtureId: BigInt(fixtureId) } });
  const fixture = await prisma.fixture.findUnique({ where: { fixtureId: BigInt(fixtureId) } });
  const statusId = score?.statusId ?? fixture?.statusId ?? 1;
  if (isFinished(statusId)) {
    return Response.json({ error: "That match has finished — pick a live or upcoming one" }, { status: 400 });
  }

  const duel = await prisma.duel.create({
    data: {
      slug: crypto.randomBytes(5).toString("hex"),
      challengerId: session.userId,
      fixtureId: BigInt(fixtureId),
      members: { create: { userId: session.userId } },
    },
  });
  return jsonResponse({ slug: duel.slug });
}
