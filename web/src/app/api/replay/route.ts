import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";
import { field, txline } from "@/lib/txline";

/**
 * Judge-facing demo control. POST queues a replay; the cranker picks it up
 * within ~10s and pipes the fixture's history through the live pipeline —
 * real proofs, real on-chain settlement, labelled "simulated live".
 */

export async function GET() {
  // Fixtures whose history TxLINE hasn't published yet (a failed attempt is
  // recorded) shouldn't be offered to judges at all.
  const unavailable = new Set(
    (
      await prisma.replayRequest.findMany({
        where: { status: "error", error: { contains: "no historical records" } },
        select: { fixtureId: true },
      })
    ).map((r) => Number(r.fixtureId))
  );

  const [requests, finished] = await Promise.all([
    prisma.replayRequest.findMany({ orderBy: { id: "desc" }, take: 5 }),
    (async () => {
      try {
        const today = Math.floor(Date.now() / 86_400_000);
        const fixtures = await txline.fixturesSnapshot(today - 12, config.competitionId);
        return (fixtures as any[])
          .filter((f) => (field(f, "startTime") ?? 0) < Date.now() - 3 * 3600_000)
          .filter((f) => !unavailable.has(field(f, "fixtureId")))
          .map((f) => ({
            fixtureId: field(f, "fixtureId"),
            p1: field(f, "participant1"),
            p2: field(f, "participant2"),
            startTime: field(f, "startTime"),
          }))
          .sort((a, b) => b.startTime - a.startTime)
          .slice(0, 12);
      } catch {
        return [];
      }
    })(),
  ]);

  return jsonResponse({ requests, fixtures: finished });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const fixtureId = Number(body.fixtureId ?? 0);
  const speed = Math.min(16, Math.max(1, Number(body.speed ?? 8)));
  if (!fixtureId) return Response.json({ error: "fixtureId required" }, { status: 400 });

  const active = await prisma.replayRequest.findFirst({
    where: { status: { in: ["pending", "running"] } },
  });
  if (active) {
    return jsonResponse({ queued: false, active });
  }

  const request = await prisma.replayRequest.create({
    data: { fixtureId: BigInt(fixtureId), speed },
  });
  return jsonResponse({ queued: true, request });
}
