import { Trigger } from "./cards";

/**
 * Fixed-odds pricing. Cards are priced from a per-card-type prior (see
 * cards.ts), adjusted by which side StablePrice says is stronger, boosted by
 * live pressure events, and decayed as the card's window runs down — that
 * decay is what makes "was 4.2, now 2.8" visible on an open card.
 *
 * Honesty note (also in the README): the operator prices cards; the oracle
 * decides outcomes. Trusted market-maker, untrusted settler.
 */

const MARGIN = 0.06;
const MIN_BPS = 10_500; // 1.05x
const MAX_BPS = 200_000; // 20x

export interface PricedOdds {
  yesBps: number;
  noBps: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function toOdds(p: number): PricedOdds {
  const pc = clamp(p, 0.03, 0.92);
  const yes = ((1 - MARGIN / 2) / pc) * 10_000;
  const no = ((1 - MARGIN / 2) / (1 - pc)) * 10_000;
  return {
    yesBps: Math.round(clamp(yes, MIN_BPS, MAX_BPS)),
    noBps: Math.round(clamp(no, MIN_BPS, MAX_BPS)),
  };
}

interface Boost {
  team: number;
  factor: number;
  untilMs: number;
}

export class OddsEngine {
  /** Per fixture, per team: strength multiplier derived from StablePrice. */
  private favoriteAdj = new Map<number, [number, number]>();
  private boosts = new Map<number, Boost[]>();

  /**
   * Defensive parse of /api/odds/snapshot — market availability varies per
   * fixture, so we look for anything resembling a two-way/three-way result
   * price pair and derive a mild strength tilt from it. Unknown shapes are
   * logged once for the API feedback notes and otherwise ignored.
   */
  setFromOddsSnapshot(fixtureId: number, snapshot: any): void {
    try {
      const records: any[] = Array.isArray(snapshot) ? snapshot : snapshot ? [snapshot] : [];
      let home: number | undefined;
      let away: number | undefined;
      const visit = (o: any) => {
        if (!o || typeof o !== "object") return;
        for (const [k, v] of Object.entries(o)) {
          const key = k.toLowerCase();
          if (typeof v === "number" && v > 1 && v < 100) {
            if (home === undefined && (key.includes("home") || key === "p1" || key.includes("participant1"))) home = v;
            if (away === undefined && (key.includes("away") || key === "p2" || key.includes("participant2"))) away = v;
          } else if (typeof v === "object") {
            visit(v);
          }
        }
      };
      records.forEach(visit);
      if (home !== undefined && away !== undefined) {
        // Stronger side scores more: tilt goal-card priors toward it.
        const tilt = clamp(Math.sqrt(away / home), 0.75, 1.35);
        this.favoriteAdj.set(fixtureId, [tilt, clamp(1 / tilt, 0.75, 1.35)]);
      }
    } catch {
      /* shape unknown — priors stay neutral */
    }
  }

  /** Pressure events briefly shorten a team's goal-card odds. */
  noteTrigger(fixtureId: number, trig: Trigger, nowMs: number): void {
    if (!trig.team) return;
    const factor =
      trig.kind.startsWith("shot:OnTarget") || trig.kind === "shot:Woodwork" ? 1.3 :
      trig.kind === "corner" ? 1.2 :
      trig.kind.startsWith("freekick") ? 1.2 :
      trig.kind === "var" ? 1.25 : 0;
    if (!factor) return;
    const list = this.boosts.get(fixtureId) ?? [];
    list.push({ team: trig.team, factor, untilMs: nowMs + 120_000 });
    this.boosts.set(fixtureId, list.filter((b) => b.untilMs > nowMs).slice(-12));
  }

  private adj(fixtureId: number, team: number): number {
    const pair = this.favoriteAdj.get(fixtureId);
    return pair ? pair[team - 1] : 1;
  }

  private boost(fixtureId: number, team: number, nowMs: number): number {
    const list = this.boosts.get(fixtureId) ?? [];
    return list
      .filter((b) => b.team === team && b.untilMs > nowMs)
      .reduce((acc, b) => acc * b.factor, 1);
  }

  /** Opening price for a new card. */
  price(fixtureId: number, team: number, pYes: number, nowMs: number): PricedOdds {
    const p = pYes * this.adj(fixtureId, team) * clamp(this.boost(fixtureId, team, nowMs), 1, 1.6);
    return toOdds(p);
  }

  /**
   * Live price for an open card: the base prior decays linearly with the
   * remaining window (floored so YES never becomes free), then pressure
   * boosts pull it back in.
   */
  drift(
    fixtureId: number,
    team: number,
    pYes0: number,
    createdTs: number,
    deadlineTs: number,
    nowMs: number
  ): PricedOdds {
    const total = Math.max(1, deadlineTs - createdTs);
    const remaining = clamp((deadlineTs - nowMs / 1000) / total, 0, 1);
    const p =
      pYes0 * (0.15 + 0.85 * remaining) *
      this.adj(fixtureId, team) *
      clamp(this.boost(fixtureId, team, nowMs), 1, 1.6);
    return toOdds(p);
  }
}
