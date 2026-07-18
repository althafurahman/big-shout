"use client";

/** The emotional payoff after the lock: what everyone else swiped. */
export default function ConsensusBar({
  yesPct,
  yourSide,
  totalCalls,
}: {
  yesPct: number;
  yourSide: boolean;
  totalCalls: number;
}) {
  const withYou = yourSide ? yesPct : 100 - yesPct;
  const line =
    totalCalls <= 1
      ? "You're first in. The crowd hasn't spoken yet."
      : withYou >= 50
      ? `${withYou}% of fans are with you.`
      : `You said ${yourSide ? "YES" : "NO"} — ${100 - withYou}% of fans disagree.`;

  return (
    <div className="card-enter">
      <div className="mb-1.5 flex justify-between text-xs font-semibold">
        <span className="text-yes">YES {yesPct}%</span>
        <span className="text-no">{100 - yesPct}% NO</span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-surface2">
        <div className="bg-yes transition-all duration-700" style={{ width: `${yesPct}%` }} />
        <div className="bg-no transition-all duration-700" style={{ width: `${100 - yesPct}%` }} />
      </div>
      <p className="mt-2 text-sm text-muted">{line}</p>
    </div>
  );
}
