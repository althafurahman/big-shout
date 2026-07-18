/**
 * Adapters over TxLINE score records. The feed encodes stats as
 * `period_prefix + base_key` (0=total, 1000=H1, 3000=H2; base 1/2=goals,
 * 3/4=yellows, 5/6=reds, 7/8=corners per participant). Records observed
 * from different endpoints vary in casing, so all lookups are tolerant of
 * camelCase/PascalCase and of stats shaped as either a key->value map or an
 * array of {key, value} entries.
 */

export function field(rec: any, ...names: string[]): any {
  for (const n of names) {
    if (rec?.[n] !== undefined) return rec[n];
    const pascal = n[0].toUpperCase() + n.slice(1);
    if (rec?.[pascal] !== undefined) return rec[pascal];
  }
  return undefined;
}

export function recSeq(rec: any): number | undefined {
  const s = field(rec, "seq");
  return typeof s === "number" ? s : undefined;
}

export function recFixtureId(rec: any): number | undefined {
  return field(rec, "fixtureId");
}

export function recAction(rec: any): string | undefined {
  return field(rec, "action");
}

export function recTs(rec: any): number | undefined {
  return field(rec, "ts", "timestamp");
}

export function recStatusId(rec: any): number | undefined {
  const s = field(rec, "statusId");
  return typeof s === "number" ? s : undefined;
}

/** Team the action belongs to: 1, 2, or undefined. */
export function recParticipant(rec: any): number | undefined {
  const p = field(rec, "participant", "participantId", "team");
  if (p === 1 || p === 2) return p;
  if (p === "1" || p === "2") return Number(p);
  return undefined;
}

export function recData(rec: any): any {
  return field(rec, "data") ?? {};
}

/** Match minute if present (varies by feed shape; best effort). */
export function recMinute(rec: any): number | undefined {
  const m = field(rec, "minute", "matchMinute", "gameMinute");
  return typeof m === "number" ? m : undefined;
}

/** Look up a stat value by numeric key, or undefined if absent. */
export function stat(rec: any, key: number): number | undefined {
  const stats = field(rec, "stats", "statistics");
  if (!stats) return undefined;
  if (Array.isArray(stats)) {
    const hit = stats.find((s) => field(s, "key") === key);
    return hit ? field(hit, "value") : undefined;
  }
  if (typeof stats === "object") {
    const v = stats[key] ?? stats[String(key)];
    return typeof v === "number" ? v : undefined;
  }
  return undefined;
}

/** All 8 whole-match base stats, or undefined where absent. */
export function totals(rec: any) {
  return {
    goals1: stat(rec, 1),
    goals2: stat(rec, 2),
    yellows1: stat(rec, 3),
    yellows2: stat(rec, 4),
    reds1: stat(rec, 5),
    reds2: stat(rec, 6),
    corners1: stat(rec, 7),
    corners2: stat(rec, 8),
    h1goals1: stat(rec, 1001),
    h1goals2: stat(rec, 1002),
  };
}

/** Game phases in which the ball is (or may again be) in play. */
const LIVE_PHASES = new Set([2, 3, 4, 6, 7, 8, 9, 11, 12]);
export function isLivePhase(statusId: number | undefined): boolean {
  return statusId !== undefined && LIVE_PHASES.has(statusId);
}

/** Terminal phases: match over or coverage gone. */
const FINAL_PHASES = new Set([5, 10, 13, 15, 16, 17, 19]);
export function isFinalPhase(statusId: number | undefined): boolean {
  return statusId !== undefined && FINAL_PHASES.has(statusId);
}

export function isFinalised(rec: any): boolean {
  const a = (recAction(rec) ?? "").toLowerCase();
  return a === "game_finalised" || a === "game_finalized";
}
