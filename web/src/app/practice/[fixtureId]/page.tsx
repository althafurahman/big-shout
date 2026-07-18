"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import SwipeCard from "@/components/SwipeCard";
import { api } from "@/lib/client";

export default function PracticeSession({ params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = use(params);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState({ right: 0, done: 0 });
  const [advanceKey, setAdvanceKey] = useState(0);

  useEffect(() => {
    api(`/api/practice/${fixtureId}`).then(setData).catch((e) => setError(e.message));
  }, [fixtureId]);

  if (error) return <p className="mt-10 text-center text-muted">{error}</p>;
  if (!data) {
    return <div className="mt-8 h-64 animate-pulse rounded-2xl border border-line bg-surface" />;
  }

  const card = data.deck[idx];
  const finished = idx >= data.deck.length;

  return (
    <div className="mx-auto max-w-xl pt-8">
      <div className="flex items-baseline justify-between">
        <h1 className="display text-2xl">
          {data.fixture.p1} <span className="text-muted">vs</span> {data.fixture.p2}
        </h1>
        <span className="text-sm tabular-nums text-muted">
          {Math.min(idx + 1, data.deck.length)}/{data.deck.length} · {score.right} called
        </span>
      </div>
      <p className="mt-1 text-xs font-bold uppercase tracking-widest text-info">
        Practice replay — it already happened, but you don&apos;t know that yet
      </p>

      <div className="mt-6">
        {finished ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center">
            <p className="display text-4xl">
              {score.right}/{score.done}
            </p>
            <p className="mt-2 text-muted">
              {score.right === score.done && score.done > 0
                ? "Perfect read. The live game is waiting for you."
                : score.right / Math.max(1, score.done) >= 0.5
                ? "You read the game well. Now do it when it counts."
                : "Football is hard to call — that's the whole point of proving it."}
            </p>
            <p className="mt-1 text-xs text-muted">
              Full time: {data.fixture.p1} {data.fixture.final.goals1}–{data.fixture.final.goals2} {data.fixture.p2}
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <Link href="/feed" className="rounded-full bg-brand px-5 py-2 font-bold text-black">
                Play it live
              </Link>
              <Link href="/practice" className="rounded-full border border-line px-5 py-2 font-bold">
                Another match
              </Link>
            </div>
          </div>
        ) : (
          <div key={advanceKey}>
            <SwipeCard
              card={{
                question: card.question,
                triggerLabel: card.trigger,
                yesOddsBps: card.oddsBps,
                noOddsBps: 11000,
                practiceOutcome: card.outcome,
                practiceReveal: card.reveal,
              }}
              mode="practice"
              onDone={(locked) => {
                if (!locked) return;
                setScore((s) => ({
                  right: s.right + (locked.practiceCorrect ? 1 : 0),
                  done: s.done + 1,
                }));
                setTimeout(() => {
                  setIdx((i) => i + 1);
                  setAdvanceKey((k) => k + 1);
                }, 2600);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
