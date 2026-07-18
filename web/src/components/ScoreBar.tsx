"use client";

import { isLive, phaseLabel } from "@/lib/meta";

export default function ScoreBar({
  p1,
  p2,
  goals1,
  goals2,
  statusId,
  simulated,
}: {
  p1: string;
  p2: string;
  goals1: number;
  goals2: number;
  statusId: number;
  simulated?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-5 py-4">
      <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted">
        {isLive(statusId) && <span className="live-dot" />}
        <span>{phaseLabel(statusId)}</span>
        {simulated && (
          <span className="rounded border border-info/50 px-1.5 py-0.5 text-[10px] text-info">
            Simulated live
          </span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <p className="display truncate text-right text-xl sm:text-2xl">{p1}</p>
        <p className="display text-4xl tabular-nums sm:text-5xl">
          {goals1}
          <span className="mx-1 text-muted">–</span>
          {goals2}
        </p>
        <p className="display truncate text-xl sm:text-2xl">{p2}</p>
      </div>
    </div>
  );
}
