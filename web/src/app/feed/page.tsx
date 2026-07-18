"use client";

import Link from "next/link";
import { usePoll } from "@/lib/client";
import { isFinished, isLive, phaseLabel } from "@/lib/meta";

export default function FeedPage() {
  const { data } = usePoll<any>("/api/feed", 5000);
  const fixtures = data?.fixtures ?? [];

  return (
    <div className="pt-8">
      <div className="flex items-baseline justify-between">
        <h1 className="display text-3xl">Matches</h1>
        <Link href="/replay" className="text-sm font-bold text-brand hover:underline">
          ▶ Run demo replay
        </Link>
      </div>

      {!data ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl border border-line bg-surface" />
          ))}
        </div>
      ) : fixtures.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-8 text-center text-muted">
          <p>No matches tracked yet — the cranker discovers fixtures every 15 minutes.</p>
          <p className="mt-2">
            Or <Link href="/replay" className="font-bold text-brand hover:underline">start a replay</Link> to
            watch a finished match play out live.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {fixtures.map((f: any) => (
            <Link
              key={f.fixtureId}
              href={`/match/${f.fixtureId}`}
              className="block rounded-2xl border border-line bg-surface p-4 transition hover:border-brand"
            >
              <div className="flex items-center gap-4">
                <div className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">
                  <span className="flex items-center gap-1.5">
                    {isLive(f.statusId) && <span className="live-dot" />}
                    {phaseLabel(f.statusId)}
                  </span>
                  {f.simulated && <span className="text-info">simulated</span>}
                </div>
                <div className="flex flex-1 items-center justify-center gap-3">
                  <span className="display flex-1 truncate text-right text-lg">{f.p1}</span>
                  <span className="display text-2xl tabular-nums">
                    {isLive(f.statusId) || isFinished(f.statusId) ? `${f.goals1}–${f.goals2}` : "vs"}
                  </span>
                  <span className="display flex-1 truncate text-lg">{f.p2}</span>
                </div>
                <div className="w-24 shrink-0 text-right text-xs">
                  {f.openCards > 0 ? (
                    <span className="rounded-full bg-brand px-2.5 py-1 font-bold text-black">
                      {f.openCards} live card{f.openCards > 1 ? "s" : ""}
                    </span>
                  ) : !isLive(f.statusId) && !isFinished(f.statusId) ? (
                    <span className="text-muted">
                      {new Date(f.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  ) : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-8 rounded-2xl border border-line bg-surface p-5">
        <p className="display text-lg">Between matches?</p>
        <p className="mt-1 text-sm text-muted">
          Practice on real moments from finished games — free, unlimited, nothing at stake.
        </p>
        <Link href="/practice" className="mt-2 inline-block text-sm font-bold text-brand hover:underline">
          Open practice mode →
        </Link>
      </div>
    </div>
  );
}
