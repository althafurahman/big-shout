"use client";

import Link from "next/link";
import { useState } from "react";
import { api, usePoll } from "@/lib/client";

/**
 * The judge's control room. Matches end before judging begins, so this
 * replays a real finished match through the full live pipeline — same cards,
 * same odds engine, same Merkle proofs, same on-chain settlement.
 */
export default function ReplayPage() {
  const { data, refresh } = usePoll<any>("/api/replay", 5000);
  const [speed, setSpeed] = useState(8);
  const [msg, setMsg] = useState<string | null>(null);

  const active = data?.requests?.find((r: any) => ["pending", "running"].includes(r.status));

  async function start(fixtureId: number) {
    setMsg(null);
    const res = await api("/api/replay", {
      method: "POST",
      body: JSON.stringify({ fixtureId, speed }),
    });
    if (res.queued) {
      setMsg("Replay queued — the first cards land within a minute. Open the match from the feed.");
    } else {
      setMsg("A replay is already running — watch it from the matches page.");
    }
    refresh();
  }

  return (
    <div className="mx-auto max-w-2xl pt-8">
      <h1 className="display text-3xl">Demo replay</h1>
      <p className="mt-2 text-sm text-muted">
        No live match right now? Replay a real one. The feed source is TxLINE&apos;s recorded
        history; <strong className="text-ink">everything else is the live pipeline</strong> — cards
        fire off real events, odds drift, and settlement happens on devnet with real Merkle
        proofs against TxODDS&apos; on-chain daily roots. Matches replayed this way are labelled{" "}
        <span className="text-info">simulated live</span>.
      </p>

      {active && (
        <div className="mt-5 rounded-2xl border border-info/50 bg-surface p-4">
          <p className="font-bold text-info">
            {active.status === "running" ? "▶ Replay in progress" : "Replay queued"} — fixture{" "}
            {active.fixture_id ?? active.fixtureId}
          </p>
          <Link href="/feed" className="mt-1 inline-block text-sm font-bold text-brand hover:underline">
            Watch it live →
          </Link>
        </div>
      )}
      {msg && <p className="mt-4 rounded-xl border border-brand/40 bg-brand/10 p-3 text-sm">{msg}</p>}

      <div className="mt-6 flex items-center gap-3 text-sm">
        <span className="text-muted">Speed</span>
        {[4, 8, 16].map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={`rounded-full border px-3 py-1 font-bold ${
              speed === s ? "border-brand bg-brand text-black" : "border-line bg-surface"
            }`}
          >
            {s}×
          </button>
        ))}
        <span className="text-xs text-muted">8× ≈ a full match in ~12 minutes</span>
      </div>

      <h2 className="mt-6 text-xs font-bold uppercase tracking-widest text-muted">
        Pick a finished match
      </h2>
      {!data ? (
        <div className="mt-3 h-40 animate-pulse rounded-2xl border border-line bg-surface" />
      ) : (
        <div className="mt-3 space-y-2">
          {data.fixtures.map((f: any) => (
            <button
              key={f.fixtureId}
              onClick={() => start(f.fixtureId)}
              disabled={!!active}
              className="flex w-full items-center justify-between rounded-2xl border border-line bg-surface p-4 text-left transition hover:border-brand disabled:opacity-40"
            >
              <span className="display text-lg">
                {f.p1} <span className="text-muted">vs</span> {f.p2}
              </span>
              <span className="text-xs text-muted">
                {new Date(f.startTime).toLocaleDateString()} · ▶ replay
              </span>
            </button>
          ))}
          {data.fixtures.length === 0 && (
            <p className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-muted">
              Couldn&apos;t list finished fixtures right now — try again shortly.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
