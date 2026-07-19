"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import SwipeCard from "@/components/SwipeCard";
import { api } from "@/lib/client";
import { flagFor } from "@/lib/meta";

type Outcome = "correct" | "wrong" | "skipped";

/** Bolder calls earn more — same logic as the real game. */
const gain = (oddsBps: number) => Math.max(10, Math.round((oddsBps / 10_000) * 10));

export default function PracticeSession({ params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = use(params);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<(Outcome | null)[]>([]);
  const [score, setScore] = useState(0);
  const [scoreTrail, setScoreTrail] = useState<number[]>([0]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [pop, setPop] = useState<{ amount: number; key: number } | null>(null);
  const [advanceKey, setAdvanceKey] = useState(0);

  useEffect(() => {
    api(`/api/practice/${fixtureId}`)
      .then((d) => {
        setData(d);
        setResults(new Array(d.deck.length).fill(null));
      })
      .catch((e) => setError(e.message));
  }, [fixtureId]);

  if (error) return <p className="mt-10 text-center text-muted">{error}</p>;
  if (!data) {
    return <div className="mt-8 h-64 animate-pulse rounded-2xl border border-line bg-surface" />;
  }

  const deck = data.deck;
  const card = deck[idx];
  const finished = idx >= deck.length;
  const answered = results.filter((r) => r === "correct" || r === "wrong");
  const correctCount = results.filter((r) => r === "correct").length;
  const accuracy = answered.length ? Math.round((correctCount / answered.length) * 100) : null;

  function record(outcome: Outcome, oddsBps?: number) {
    const delta = outcome === "correct" && oddsBps ? gain(oddsBps) : 0;
    setResults((r) => {
      const next = [...r];
      next[idx] = outcome;
      return next;
    });
    if (outcome === "correct") {
      setScore((v) => v + delta);
      setStreak((v) => {
        const nv = v + 1;
        setBestStreak((b) => Math.max(b, nv));
        return nv;
      });
      setPop({ amount: delta, key: Date.now() });
    } else if (outcome === "wrong") {
      setStreak(0);
    }
    setScoreTrail((t) => [...t, t[t.length - 1] + delta]);
    setTimeout(
      () => {
        setIdx((i) => i + 1);
        setAdvanceKey((k) => k + 1);
      },
      outcome === "skipped" ? 150 : 2600
    );
  }

  return (
    <div className="mx-auto max-w-xl pt-6">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="display flex min-w-0 items-center gap-2 text-2xl">
          <span>{flagFor(data.fixture.p1)}</span>
          <span className="truncate">
            {data.fixture.p1} <span className="text-muted">v</span> {data.fixture.p2}
          </span>
          <span>{flagFor(data.fixture.p2)}</span>
        </h1>
      </div>
      <p className="mt-1 text-xs font-bold uppercase tracking-widest text-info">
        Practice replay — it already happened, but you don&apos;t know that yet
      </p>

      {/* Session tracker: the game inside the game */}
      <div className="mt-4 rounded-2xl border border-line bg-surface px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="relative">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Score</p>
            <p className="display text-2xl tabular-nums">{score}</p>
            {pop && (
              <span
                key={pop.key}
                className="float-score absolute -right-8 top-0 text-sm font-black text-yes"
              >
                +{pop.amount}
              </span>
            )}
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Streak</p>
            <p className="display text-2xl tabular-nums">
              {streak > 1 ? `🔥${streak}` : streak}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Accuracy</p>
            <p className="display text-2xl tabular-nums">{accuracy === null ? "—" : `${accuracy}%`}</p>
          </div>
        </div>
        {/* Result trail */}
        <div className="mt-3 flex items-center gap-1.5">
          {deck.map((_: any, i: number) => (
            <span
              key={i}
              className={`h-2 flex-1 rounded-full transition-all ${
                results[i] === "correct"
                  ? "bg-yes"
                  : results[i] === "wrong"
                  ? "bg-no"
                  : results[i] === "skipped"
                  ? "bg-line"
                  : i === idx
                  ? "animate-pulse bg-brand"
                  : "bg-surface2"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="mt-5">
        {finished ? (
          <SessionSummary
            fixture={data.fixture}
            score={score}
            correct={correctCount}
            answered={answered.length}
            skipped={results.filter((r) => r === "skipped").length}
            bestStreak={bestStreak}
            trail={scoreTrail}
            results={results}
          />
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
              onSkip={() => record("skipped")}
              onDone={(locked) => {
                if (!locked) return;
                record(locked.practiceCorrect ? "correct" : "wrong", locked.oddsBps);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SessionSummary({
  fixture,
  score,
  correct,
  answered,
  skipped,
  bestStreak,
  trail,
  results,
}: {
  fixture: any;
  score: number;
  correct: number;
  answered: number;
  skipped: number;
  bestStreak: number;
  trail: number[];
  results: (Outcome | null)[];
}) {
  const W = 300;
  const H = 72;
  const max = Math.max(1, trail[trail.length - 1]);
  const x = (i: number) => (trail.length > 1 ? (i / (trail.length - 1)) * (W - 16) + 8 : W / 2);
  const y = (v: number) => H - 10 - (v / max) * (H - 22);
  const line = trail.map((v, i) => `${x(i)},${y(v)}`).join(" ");

  return (
    <div className="card-enter rounded-2xl border border-line bg-surface p-6 text-center">
      <p className="text-xs font-bold uppercase tracking-widest text-muted">Session over</p>
      <p className="display mt-2 text-5xl tabular-nums">{score}</p>
      <p className="text-xs uppercase tracking-wider text-muted">practice points</p>

      {/* How the session built up, call by call */}
      {trail.length > 1 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto mt-4 w-full max-w-xs">
          <polyline
            points={line}
            fill="none"
            stroke="var(--brand)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {trail.slice(1).map((v, i) => (
            <circle
              key={i}
              cx={x(i + 1)}
              cy={y(v)}
              r="3.5"
              fill={
                results[i] === "correct"
                  ? "var(--yes)"
                  : results[i] === "wrong"
                  ? "var(--no)"
                  : "var(--border)"
              }
            />
          ))}
        </svg>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          ["Right", `${correct}/${answered}`],
          ["Best streak", bestStreak > 1 ? `🔥 ${bestStreak}` : bestStreak],
          ["Skipped", skipped],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-xl bg-surface2 p-2.5">
            <p className="display text-xl">{value}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-sm text-muted">
        {answered === 0
          ? "All skipped — no shame, but no glory either."
          : correct === answered
          ? "Perfect read. The live game is waiting for you."
          : correct / answered >= 0.5
          ? "You read the game well. Now do it when it counts."
          : "Football is hard to call — that's the whole point of proving it."}
      </p>
      <p className="mt-1 text-xs text-muted">
        Full time: {fixture.p1} {fixture.final.goals1}–{fixture.final.goals2} {fixture.p2}
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
  );
}
