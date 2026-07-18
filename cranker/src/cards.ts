import { field, recAction, recData, recParticipant } from "./scores";

/**
 * Triggers ≠ settlements. The stream's rich events (shots, VAR, penalties,
 * free kicks, substitutions) fire cards, drive the ticker, and feed the
 * pressure meter — but every settlement must resolve to a provable stat key
 * (base 1-8 + period prefix). "Will this corner become a goal?" is
 * triggered by the corner and settled as `team goals > current`.
 */

export interface Trigger {
  kind: string;
  team?: number; // 1 | 2
  label: string;
  /** Pressure-meter weight, 0..1. */
  weight: number;
}

export interface CardSpec {
  /** Card family for cooldown bucketing: goal | corner | booking. */
  family: "goal" | "corner" | "booking";
  statKey: number;
  /** YES wins when the proven stat value exceeds this. */
  threshold: number;
  team: number;
  question: string;
  windowSecs: number;
  /** Prior probability of YES, before favorite adjustment and margin. */
  pYes: number;
  triggerKind: string;
  triggerLabel: string;
}

export interface StatTotals {
  goals1?: number;
  goals2?: number;
  yellows1?: number;
  yellows2?: number;
  reds1?: number;
  reds2?: number;
  corners1?: number;
  corners2?: number;
}

const delta = (curr?: number, prev?: number) =>
  curr !== undefined && prev !== undefined && curr > prev ? curr - prev : 0;

/** Tolerant numeric getter for `goals1`-style dynamic keys. */
const g = (o: StatTotals, key: string): number => ((o as any)[key] as number | undefined) ?? 0;

/** Classify a score record into ticker/pressure triggers using both the
 *  action vocabulary and stat deltas against the previous record. */
export function classify(rec: any, prev: StatTotals, curr: StatTotals, teamName: (t: number) => string): Trigger[] {
  const out: Trigger[] = [];
  const action = (recAction(rec) ?? "").toLowerCase();
  const data = recData(rec);
  const team = recParticipant(rec);

  for (const t of [1, 2] as const) {
    if (delta(g(curr, `goals${t}`), g(prev, `goals${t}`)))
      out.push({ kind: "goal", team: t, label: `GOAL! ${teamName(t)} score`, weight: 1.0 });
    if (delta(g(curr, `corners${t}`), g(prev, `corners${t}`)))
      out.push({ kind: "corner", team: t, label: `Corner to ${teamName(t)}`, weight: 0.4 });
    if (delta(g(curr, `yellows${t}`), g(prev, `yellows${t}`)))
      out.push({ kind: "yellow", team: t, label: `Yellow card — ${teamName(t)}`, weight: 0.35 });
    if (delta(g(curr, `reds${t}`), g(prev, `reds${t}`)))
      out.push({ kind: "red", team: t, label: `RED CARD — ${teamName(t)}`, weight: 0.9 });
  }

  if (action === "shot") {
    const outcome = field(data, "outcome") ?? "";
    const w = outcome === "OnTarget" ? 0.55 : outcome === "Woodwork" ? 0.7 : 0.3;
    const desc =
      outcome === "OnTarget" ? "Shot on target" :
      outcome === "Woodwork" ? "Off the woodwork!" :
      outcome === "Blocked" ? "Shot blocked" : "Shot off target";
    out.push({ kind: `shot:${outcome || "unknown"}`, team, label: team ? `${desc} — ${teamName(team)}` : desc, weight: w });
  } else if (action === "free_kick") {
    const fk = field(data, "freeKickType") ?? "";
    if (fk === "Offside") {
      out.push({ kind: "offside", team, label: team ? `Offside — ${teamName(team)}` : "Offside", weight: 0.2 });
    } else if (fk === "Danger" || fk === "HighDanger") {
      out.push({
        kind: `freekick:${fk}`, team,
        label: team ? `Dangerous free kick — ${teamName(team)}` : "Dangerous free kick",
        weight: fk === "HighDanger" ? 0.6 : 0.45,
      });
    }
  } else if (action === "var") {
    const type = field(data, "type") ?? "check";
    out.push({ kind: "var", team, label: `VAR check — ${type}`, weight: 0.8 });
  } else if (action === "var_end") {
    const outcome = field(data, "outcome") ?? "";
    out.push({ kind: "var_end", team, label: `VAR: ${outcome === "Overturned" ? "overturned!" : "decision stands"}`, weight: 0.6 });
  } else if (action === "penalty") {
    const outcome = field(data, "outcome") ?? "";
    out.push({ kind: `penalty:${outcome}`, team, label: team ? `Penalty ${outcome} — ${teamName(team)}` : `Penalty ${outcome}`, weight: 0.9 });
  } else if (action === "substitution") {
    out.push({ kind: "sub", team, label: team ? `Substitution — ${teamName(team)}` : "Substitution", weight: 0.15 });
  }

  return out;
}

/** Map a trigger to the card it should fire, if any. All cards settle to a
 *  provable whole-match stat key with a GreaterThan threshold. */
export function cardForTrigger(
  trig: Trigger,
  curr: StatTotals,
  teamName: (t: number) => string
): CardSpec | null {
  const t = trig.team;
  if (!t) return null;
  const opp = t === 1 ? 2 : 1;
  const name = teamName(t);

  switch (true) {
    case trig.kind === "corner":
      return {
        family: "goal",
        statKey: t, // base 1/2: team total goals
        threshold: g(curr, `goals${t}`),
        team: t,
        question: `Corner to ${name} — do they score in the next 10 minutes?`,
        windowSecs: 600,
        pYes: 0.24,
        triggerKind: "corner",
        triggerLabel: trig.label,
      };
    case trig.kind === "shot:OnTarget" || trig.kind === "shot:Woodwork":
      return {
        family: "goal",
        statKey: t,
        threshold: g(curr, `goals${t}`),
        team: t,
        question: `${name} are knocking — goal in the next 8 minutes?`,
        windowSecs: 480,
        pYes: 0.28,
        triggerKind: trig.kind,
        triggerLabel: trig.label,
      };
    case trig.kind === "freekick:Danger" || trig.kind === "freekick:HighDanger":
      return {
        family: "goal",
        statKey: t,
        threshold: g(curr, `goals${t}`),
        team: t,
        question: `Free kick in a dangerous spot — ${name} to score in the next 6 minutes?`,
        windowSecs: 360,
        pYes: trig.kind.endsWith("HighDanger") ? 0.26 : 0.21,
        triggerKind: trig.kind,
        triggerLabel: trig.label,
      };
    case trig.kind === "var": {
      return {
        family: "goal",
        statKey: t,
        threshold: g(curr, `goals${t}`),
        team: t,
        question: `VAR is looking at it — ${name} goal on the board within 5 minutes?`,
        windowSecs: 300,
        pYes: 0.55,
        triggerKind: "var",
        triggerLabel: trig.label,
      };
    }
    case trig.kind === "yellow":
      return {
        family: "booking",
        statKey: 2 + t, // base 3/4: team total yellows
        threshold: g(curr, `yellows${t}`),
        team: t,
        question: `${name} are getting rattled — another booking for them in the next 20 minutes?`,
        windowSecs: 1200,
        pYes: 0.38,
        triggerKind: "yellow",
        triggerLabel: trig.label,
      };
    case trig.kind === "goal":
      // Momentum flips to the conceding side chasing the game.
      return {
        family: "goal",
        statKey: opp,
        threshold: g(curr, `goals${opp}`),
        team: opp,
        question: `${teamName(opp)} concede — do they hit straight back within 15 minutes?`,
        windowSecs: 900,
        pYes: 0.26,
        triggerKind: "goal",
        triggerLabel: trig.label,
      };
    default:
      return null;
  }
}

/** Quiet-spell fallback so a match always has something swipeable. */
export function idleCard(curr: StatTotals, favored: number, teamName: (t: number) => string): CardSpec {
  return {
    family: "corner",
    statKey: 6 + favored, // base 7/8: team total corners
    threshold: g(curr, `corners${favored}`),
    team: favored,
    question: `${teamName(favored)} to win another corner in the next 8 minutes?`,
    windowSecs: 480,
    pYes: 0.48,
    triggerKind: "idle",
    triggerLabel: "Quiet spell",
  };
}
