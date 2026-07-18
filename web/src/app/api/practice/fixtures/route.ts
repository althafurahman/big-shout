import { config } from "@/lib/config";
import { jsonResponse } from "@/lib/json";
import { field, txline } from "@/lib/txline";

/** Finished fixtures a fan can practice on between live matches. */
export async function GET() {
  try {
    const today = Math.floor(Date.now() / 86_400_000);
    const fixtures = await txline.fixturesSnapshot(today - 12, config.competitionId);
    const finished = (fixtures as any[])
      .filter((f) => (field(f, "startTime") ?? 0) < Date.now() - 3 * 3600_000)
      .map((f) => ({
        fixtureId: field(f, "fixtureId"),
        p1: field(f, "participant1"),
        p2: field(f, "participant2"),
        startTime: field(f, "startTime"),
      }))
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, 12);
    return jsonResponse({ fixtures: finished });
  } catch {
    return jsonResponse({ fixtures: [] });
  }
}
