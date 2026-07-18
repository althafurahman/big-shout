"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import SwipeCard, { CardData } from "@/components/SwipeCard";
import { api, useMe } from "@/lib/client";

/**
 * Land and swipe within five seconds. No account, no wall — the first card
 * is already waiting. Guest calls are local; signup makes them count.
 */
export default function Landing() {
  const { me } = useMe();
  const [card, setCard] = useState<CardData | null>(null);
  const [context, setContext] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Prefer a real open card from a live (or simulated-live) match.
        const feed = await api("/api/feed");
        const withCards = feed.fixtures.find((f: any) => f.openCards > 0);
        if (withCards) {
          const match = await api(`/api/match/${withCards.fixtureId}`);
          const open = match.cards.find((c: any) => c.status === "open");
          if (open) {
            setCard({
              marketId: open.marketId,
              question: open.question,
              triggerLabel: open.triggerLabel,
              yesOddsBps: open.yesOddsBps,
              noOddsBps: open.noOddsBps,
              openingYesOddsBps: open.openingYesOddsBps,
              timeLeft: open.timeLeft,
              yesCount: open.yesCount,
              noCount: open.noCount,
            });
            setContext(`Live now: ${match.fixture.p1} vs ${match.fixture.p2}${match.fixture.simulated ? " · simulated" : ""}`);
            return;
          }
        }
        // Otherwise: a warm-up card from a recent real match.
        const past = await api("/api/practice/fixtures");
        if (past.fixtures.length) {
          const deck = await api(`/api/practice/${past.fixtures[0].fixtureId}`);
          if (deck.deck.length) {
            const c = deck.deck[0];
            setCard({
              question: c.question,
              triggerLabel: c.trigger,
              yesOddsBps: c.oddsBps,
              noOddsBps: 11000,
              practiceOutcome: c.outcome,
              practiceReveal: c.reveal,
            });
            setContext(`Warm-up from ${deck.fixture.p1} vs ${deck.fixture.p2}`);
          }
        }
      } catch {
        /* empty state below */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="mx-auto max-w-2xl">
      <section className="pt-10 text-center sm:pt-16">
        <h1 className="display text-5xl leading-[0.95] sm:text-7xl">
          Every fan says
          <br />
          <span className="text-brand">&ldquo;I called it.&rdquo;</span>
          <br />
          Prove it.
        </h1>
        <p className="mx-auto mt-5 max-w-md text-muted">
          Swipe on live World Cup moments. Your call locks with a timestamp and
          the odds you took — <em>before</em> the outcome — and settles on-chain
          from the sport&apos;s own data. Free to play. Impossible to fake.
        </p>
      </section>

      <section className="mt-10">
        {loading ? (
          <div className="h-56 animate-pulse rounded-2xl border border-line bg-surface" />
        ) : card ? (
          <>
            <p className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-info">
              {context}
            </p>
            <SwipeCard
              card={card}
              mode={card.practiceOutcome !== undefined ? "practice" : me ? "live" : "guest"}
              maxStake={me?.points}
            />
          </>
        ) : (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center text-muted">
            <p>No live cards right now.</p>
            <Link href="/replay" className="mt-2 inline-block font-bold text-brand hover:underline">
              Run the demo replay →
            </Link>
          </div>
        )}
      </section>

      <section className="mt-14 grid gap-4 sm:grid-cols-3">
        {[
          ["Swipe", "A moment happens on the pitch. A card fires. YES or NO — the odds are live and moving."],
          ["Locked", "Your call is sealed on Solana with the time and price you took. No edits, no delete."],
          ["Proven", "TxODDS' own oracle settles it with a Merkle proof, seconds after the stat lands."],
        ].map(([t, d], i) => (
          <div key={t} className="rounded-xl border border-line bg-surface p-4">
            <p className="display text-lg text-brand">{i + 1}. {t}</p>
            <p className="mt-1 text-sm text-muted">{d}</p>
          </div>
        ))}
      </section>

      <div className="mt-10 flex justify-center gap-4">
        <Link
          href="/feed"
          className="rounded-full bg-brand px-6 py-2.5 font-bold text-black transition hover:brightness-110"
        >
          See today&apos;s matches
        </Link>
        <Link
          href="/replay"
          className="rounded-full border border-line px-6 py-2.5 font-bold transition hover:border-brand"
        >
          ▶ Demo replay
        </Link>
      </div>
    </div>
  );
}
