/** Shared display metadata: stat families, rarity tiers, phase labels. */

export type StatFamily = "goals" | "corners" | "bookings";

/** stat_key = period_prefix + base_key; base 1/2 goals, 3/4 yellows,
 *  5/6 reds, 7/8 corners. */
export function statFamily(statKey: number): StatFamily {
  const base = statKey % 1000;
  if (base <= 2) return "goals";
  if (base <= 6) return "bookings";
  return "corners";
}

export function statTeam(statKey: number): 1 | 2 {
  return (statKey % 1000) % 2 === 1 ? 1 : 2;
}

export interface Rarity {
  tier: "common" | "solid" | "bold" | "big" | "legendary";
  label: string;
}

/** Long shots render visibly rarer than favourites — a 6.0 call should flex
 *  harder than a 1.2. Tiered by the DECIMAL ODDS TAKEN, locked at predict. */
export function rarity(oddsBps: number): Rarity {
  const x = oddsBps / 10_000;
  if (x < 1.6) return { tier: "common", label: "Safe call" };
  if (x < 2.5) return { tier: "solid", label: "Solid call" };
  if (x < 4.5) return { tier: "bold", label: "Bold call" };
  if (x < 8) return { tier: "big", label: "BIG SHOUT" };
  return { tier: "legendary", label: "LEGENDARY SHOUT" };
}

export const PHASE_LABELS: Record<number, string> = {
  1: "Kickoff soon",
  2: "1st half",
  3: "Half-time",
  4: "2nd half",
  5: "Full time",
  6: "Waiting for ET",
  7: "ET 1st half",
  8: "ET half-time",
  9: "ET 2nd half",
  10: "Finished (AET)",
  11: "Penalties soon",
  12: "Penalty shootout",
  13: "Finished (pens)",
  14: "Interrupted",
  15: "Abandoned",
  16: "Cancelled",
  19: "Postponed",
  100: "Full time",
};

export function phaseLabel(statusId: number): string {
  return PHASE_LABELS[statusId] ?? "—";
}

export function isLive(statusId: number): boolean {
  return [2, 3, 4, 6, 7, 8, 9, 11, 12].includes(statusId);
}

export function isFinished(statusId: number): boolean {
  return [5, 10, 13, 100].includes(statusId);
}

export function fmtOdds(bps: number): string {
  return `${(bps / 10_000).toFixed(2)}x`;
}

/** National-team flags — at a World Cup, the flag IS the crest. */
const FLAGS: Record<string, string> = {
  argentina: "🇦🇷", australia: "🇦🇺", austria: "🇦🇹", algeria: "🇩🇿", belgium: "🇧🇪",
  brazil: "🇧🇷", cameroon: "🇨🇲", canada: "🇨🇦", chile: "🇨🇱", colombia: "🇨🇴",
  "costa rica": "🇨🇷", croatia: "🇭🇷", czechia: "🇨🇿", "czech republic": "🇨🇿",
  denmark: "🇩🇰", ecuador: "🇪🇨", egypt: "🇪🇬", england: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", france: "🇫🇷",
  germany: "🇩🇪", ghana: "🇬🇭", greece: "🇬🇷", honduras: "🇭🇳", hungary: "🇭🇺",
  iran: "🇮🇷", iraq: "🇮🇶", ireland: "🇮🇪", italy: "🇮🇹", "ivory coast": "🇨🇮",
  jamaica: "🇯🇲", japan: "🇯🇵", jordan: "🇯🇴", mali: "🇲🇱", mexico: "🇲🇽",
  morocco: "🇲🇦", netherlands: "🇳🇱", "new zealand": "🇳🇿", nigeria: "🇳🇬",
  norway: "🇳🇴", panama: "🇵🇦", paraguay: "🇵🇾", peru: "🇵🇪", poland: "🇵🇱",
  portugal: "🇵🇹", qatar: "🇶🇦", romania: "🇷🇴", "saudi arabia": "🇸🇦",
  scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", senegal: "🇸🇳", serbia: "🇷🇸", slovakia: "🇸🇰",
  slovenia: "🇸🇮", "south africa": "🇿🇦", "south korea": "🇰🇷", korea: "🇰🇷",
  spain: "🇪🇸", sweden: "🇸🇪", switzerland: "🇨🇭", tunisia: "🇹🇳", turkey: "🇹🇷",
  ukraine: "🇺🇦", "united states": "🇺🇸", usa: "🇺🇸", uruguay: "🇺🇾",
  uzbekistan: "🇺🇿", wales: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
};

export function flagFor(teamName: string): string {
  return FLAGS[teamName.trim().toLowerCase()] ?? "⚽";
}
