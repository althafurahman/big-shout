"use client";

import Link from "next/link";
import { use } from "react";
import { api, useMe, usePoll } from "@/lib/client";
import { fmtOdds } from "@/lib/meta";

/** Two fans, one match, side by side. One question: who knows football. */
export default function DuelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { me } = useMe();
  const { data, refresh } = usePoll<any>(`/api/duel/${slug}`, 5000);

  if (!data) {
    return <div className="mt-8 h-64 animate-pulse rounded-2xl border border-line bg-surface" />;
  }
  if (data.error) return <p className="mt-10 text-center text-muted">{data.error}</p>;

  async function join() {
    await api(`/api/duel/${slug}`, { method: "POST" });
    refresh();
  }

  const sides = [data.challenger, data.opponent].filter(Boolean);
  const leader =
    sides.length === 2 && sides[0].correct !== sides[1].correct
      ? sides[0].correct > sides[1].correct
        ? sides[0].username
        : sides[1].username
      : null;

  return (
    <div className="mx-auto max-w-2xl pt-8">
      <h1 className="display text-center text-3xl">The Duel</h1>
      {data.fixture && (
        <p className="mt-1 text-center text-sm text-muted">
          {data.fixture.p1} vs {data.fixture.p2}
          {data.fixture.simulated ? " · simulated live" : ""}
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4">
        {[data.challenger, data.opponent].map((side: any, i: number) =>
          side ? (
            <div
              key={i}
              className={`rounded-2xl border p-4 text-center ${
                leader === side.username ? "border-brand bg-brand/5" : "border-line bg-surface"
              }`}
            >
              <Link href={`/u/${side.username}`} className="display text-xl hover:text-brand">
                @{side.username}
              </Link>
              <p className="display mt-2 text-4xl">
                {side.correct}
                <span className="text-lg text-muted">/{side.total}</span>
              </p>
              <p className="text-xs uppercase tracking-wider text-muted">settled calls right</p>
              {leader === side.username && (
                <p className="mt-2 text-xs font-black text-brand">KNOWS FOOTBALL</p>
              )}
            </div>
          ) : (
            <div key={i} className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line p-4 text-center">
              <p className="text-sm text-muted">Empty chair</p>
              {data.canJoin ? (
                <button
                  onClick={join}
                  className="mt-2 rounded-full bg-brand px-4 py-1.5 text-sm font-bold text-black"
                >
                  Take the seat
                </button>
              ) : !me ? (
                <Link href="/auth" className="mt-2 text-sm font-bold text-brand hover:underline">
                  Sign in to accept
                </Link>
              ) : null}
            </div>
          )
        )}
      </div>

      <h2 className="mt-8 text-xs font-bold uppercase tracking-widest text-muted">
        Card by card
      </h2>
      <div className="mt-2 space-y-2">
        {data.cards.map((c: any) => {
          const pick = (side: any) =>
            side?.calls?.find((x: any) => x.marketId === c.marketId);
          const a = pick(data.challenger);
          const b = pick(data.opponent);
          const chip = (p: any) =>
            !p || p.side === null ? (
              <span className="text-xs text-muted">—</span>
            ) : (
              <span
                className={`text-xs font-black ${
                  p.claimed ? (p.won ? "text-yes" : "text-no") : "text-info"
                }`}
              >
                {p.side ? "YES" : "NO"} @ {fmtOdds(p.oddsBps)}
                {p.claimed ? (p.won ? " ✓" : " ✗") : ""}
              </span>
            );
          return (
            <div key={c.marketId} className="rounded-xl border border-line bg-surface px-4 py-3">
              <p className="text-sm">{c.question}</p>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <div>{chip(a)}</div>
                <div className="text-right">{chip(b)}</div>
              </div>
            </div>
          );
        })}
        {data.cards.length === 0 && (
          <p className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-muted">
            No cards on this match yet — they fire as the game plays.
          </p>
        )}
      </div>

      {data.fixture && (
        <p className="mt-6 text-center">
          <Link
            href={`/match/${data.fixture.fixtureId}`}
            className="font-bold text-brand hover:underline"
          >
            Open the match and make your calls →
          </Link>
        </p>
      )}
    </div>
  );
}
