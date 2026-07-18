import { config } from "@/lib/config";
import { jsonResponse } from "@/lib/json";
import { field, statOf, txline } from "@/lib/txline";

/**
 * Practice mode: replayed past events as cards. Free, unlimited, unstaked,
 * fully off-chain. The server walks a finished match's real TxLINE history,
 * fires the same kinds of cards the live cranker would, and pre-scores each
 * one against what actually happened next.
 */

interface PracticeCard {
  minute: number;
  trigger: string;
  question: string;
  oddsBps: number;
  outcome: boolean;
  reveal: string;
}

const MARGIN = 0.94;
const oddsFor = (p: number) => Math.round((MARGIN / Math.min(0.92, Math.max(0.05, p))) * 10_000);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  const fixtureId = Number((await params).fixtureId);
  let records: any[];
  try {
    records = ((await txline.scoresHistorical(fixtureId)) as any[])
      .filter((r) => typeof field(r, "seq") === "number")
      .sort((a, b) => field(a, "seq") - field(b, "seq"));
  } catch {
    return Response.json({ error: "No history for that match" }, { status: 404 });
  }
  if (!records.length) return Response.json({ error: "No history for that match" }, { status: 404 });

  // Team names from the fixtures snapshot of that day.
  let p1 = "Team 1";
  let p2 = "Team 2";
  try {
    const day = Math.floor((field(records[0], "ts") ?? Date.now()) / 86_400_000);
    const fixtures = await txline.fixturesSnapshot(day - 1, config.competitionId);
    const f = (fixtures as any[]).find((x) => field(x, "fixtureId") === fixtureId);
    if (f) {
      p1 = field(f, "participant1") ?? p1;
      p2 = field(f, "participant2") ?? p2;
    }
  } catch { /* cosmetic */ }
  const name = (t: number) => (t === 1 ? p1 : p2);

  const kickoff =
    field(records.find((r) => field(r, "statusId") === 2) ?? records[0], "ts") ?? 0;
  const minuteOf = (ts: number) => Math.max(0, Math.round((ts - kickoff) / 60_000));

  /** Did `statKey` exceed `threshold` within `windowMs` after `fromTs`? */
  const crossed = (i: number, statKey: number, threshold: number, windowMs: number) => {
    const fromTs = field(records[i], "ts") ?? 0;
    for (let j = i + 1; j < records.length; j++) {
      const ts = field(records[j], "ts") ?? 0;
      if (ts > fromTs + windowMs) break;
      const v = statOf(records[j], statKey);
      if (v !== undefined && v > threshold) return { yes: true, minute: minuteOf(ts) };
    }
    return { yes: false, minute: 0 };
  };

  const deck: PracticeCard[] = [];
  let lastCardTs = 0;
  const prevTotals: Record<string, number> = {};

  for (let i = 0; i < records.length && deck.length < 12; i++) {
    const rec = records[i];
    const ts = field(rec, "ts") ?? 0;
    const statusId = field(rec, "statusId");
    const curr: Record<string, number> = {};
    for (const [label, key] of Object.entries({ goals1: 1, goals2: 2, yellows1: 3, yellows2: 4, corners1: 7, corners2: 8 })) {
      const v = statOf(rec, key);
      curr[label] = v ?? prevTotals[label] ?? 0;
    }

    if ([2, 4].includes(statusId) && ts - lastCardTs > 6 * 60_000) {
      let made = false;
      for (const t of [1, 2]) {
        if (made) break;
        const cornerDelta = curr[`corners${t}`] > (prevTotals[`corners${t}`] ?? 0);
        const yellowDelta = curr[`yellows${t}`] > (prevTotals[`yellows${t}`] ?? 0);
        const shotOnTarget =
          (field(rec, "action") ?? "").toLowerCase() === "shot" &&
          field(field(rec, "data") ?? {}, "outcome") === "OnTarget" &&
          field(rec, "participant") === t;

        if (cornerDelta || shotOnTarget) {
          const windowMs = 10 * 60_000;
          const res = crossed(i, t, curr[`goals${t}`], windowMs);
          deck.push({
            minute: minuteOf(ts),
            trigger: cornerDelta ? `Corner to ${name(t)}` : `Shot on target — ${name(t)}`,
            question: `${minuteOf(ts)}' — ${name(t)} are pushing. Do they score in the next 10 minutes?`,
            oddsBps: oddsFor(0.26),
            outcome: res.yes,
            reveal: res.yes
              ? `They did — goal in the ${res.minute}th minute.`
              : `No goal came. The moment passed.`,
          });
          lastCardTs = ts;
          made = true;
        } else if (yellowDelta) {
          const windowMs = 20 * 60_000;
          const res = crossed(i, 2 + t, curr[`yellows${t}`], windowMs);
          deck.push({
            minute: minuteOf(ts),
            trigger: `Yellow card — ${name(t)}`,
            question: `${minuteOf(ts)}' — ${name(t)} booked. Another card for them within 20 minutes?`,
            oddsBps: oddsFor(0.38),
            outcome: res.yes,
            reveal: res.yes
              ? `Yes — another booking in the ${res.minute}th.`
              : `They kept it clean. No card.`,
          });
          lastCardTs = ts;
          made = true;
        }
      }
    }
    Object.assign(prevTotals, curr);
  }

  const final = {
    goals1: prevTotals.goals1 ?? 0,
    goals2: prevTotals.goals2 ?? 0,
  };

  return jsonResponse({
    fixture: { fixtureId, p1, p2, final },
    deck,
  });
}
