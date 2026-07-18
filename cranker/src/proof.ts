import BN from "bn.js";

interface ApiProofNode {
  hash: number[] | Uint8Array;
  isRightSibling: boolean;
}

const mapProof = (arr: ApiProofNode[]) =>
  (arr ?? []).map((n) => ({ hash: Array.from(n.hash), isRightSibling: n.isRightSibling }));

/**
 * Convert a /scores/stat-validation response into the Anchor
 * StatValidationInput payload shape shared by the TxLINE oracle program and
 * bigshout's `settle_proven` instruction.
 */
export function buildPayload(val: any) {
  return {
    ts: new BN(val.summary.updateStats.minTimestamp),
    fixtureSummary: {
      fixtureId: new BN(val.summary.fixtureId),
      updateStats: {
        updateCount: val.summary.updateStats.updateCount,
        minTimestamp: new BN(val.summary.updateStats.minTimestamp),
        maxTimestamp: new BN(val.summary.updateStats.maxTimestamp),
      },
      eventsSubTreeRoot: Array.from(val.summary.eventStatsSubTreeRoot),
    },
    fixtureProof: mapProof(val.subTreeProof),
    mainTreeProof: mapProof(val.mainTreeProof),
    eventStatRoot: Array.from(val.eventStatRoot),
    stats: (val.statsToProve ?? []).map((statObj: any, i: number) => ({
      stat: statObj,
      statProof: mapProof(val.statProofs[i]),
    })),
  };
}

/** Epoch day (u16) for the daily_scores_roots PDA, from a ms timestamp. */
export function epochDayOf(tsMs: number): number {
  return Math.floor(tsMs / 86_400_000);
}
