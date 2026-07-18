import crypto from "crypto";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";
import { getSession } from "@/lib/session";

/** Create a duel link: same cards, same match, scored side by side. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session.userId) return Response.json({ error: "Sign in first" }, { status: 401 });

  const { fixtureId } = await req.json().catch(() => ({}));
  if (!fixtureId) return Response.json({ error: "fixtureId required" }, { status: 400 });

  const duel = await prisma.duel.create({
    data: {
      slug: crypto.randomBytes(5).toString("hex"),
      challengerId: session.userId,
      fixtureId: BigInt(fixtureId),
    },
  });
  return jsonResponse({ slug: duel.slug });
}
