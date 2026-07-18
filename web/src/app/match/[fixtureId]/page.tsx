"use client";

import Link from "next/link";
import { use, useState } from "react";
import PressureMeter from "@/components/PressureMeter";
import ScoreBar from "@/components/ScoreBar";
import SwipeCard from "@/components/SwipeCard";
import Ticker from "@/components/Ticker";
import { api, useMe, usePoll } from "@/lib/client";
import { fmtOdds } from "@/lib/meta";

export default function MatchPage({ params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = use(params);
  const { me } = useMe();
  const { data } = usePoll<any>(`/api/match/${fixtureId}`, 3000);
  const [duelLink, setDuelLink] = useState<string | null>(null);

  if (!data) {
    return <div className="mt-8 h-64 animate-pulse rounded-2xl border border-line bg-surface" />;
  }
  if (data.error) {
    return <p className="mt-10 text-center text-muted">{data.error}</p>;
  }

  const openCards = data.cards.filter((c: any) => c.status === "open");
  const settled = data.cards.filter((c: any) => c.status !== "open").slice(0, 8);
  const posBy = new Map<number, any>((data.positions ?? []).map((p: any) => [Number(p.marketId), p]));

  async function challenge() {
    try {
      const res = await api("/api/duel", {
        method: "POST",
        body: JSON.stringify({ fixtureId: Number(fixtureId) }),
      });
      const url = `${location.origin}/duel/${res.slug}`;
      await navigator.clipboard.writeText(url);
      setDuelLink(url);
    } catch (e: any) {
      if (e.message.includes("Sign in")) location.href = "/auth";
    }
  }

  return (
    <div className="space-y-4 pt-6">
      <ScoreBar
        p1={data.fixture.p1}
        p2={data.fixture.p2}
        goals1={data.score?.goals1 ?? 0}
        goals2={data.score?.goals2 ?? 0}
        statusId={data.statusId}
        simulated={data.fixture.simulated}
      />
      <PressureMeter
        p1={data.pressure.p1}
        p2={data.pressure.p2}
        name1={data.fixture.p1}
        name2={data.fixture.p2}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {openCards.length ? (
            openCards.map((c: any) =>
              posBy.has(c.marketId) ? (
                <LockedSummary key={c.marketId} card={c} position={posBy.get(c.marketId)} />
              ) : (
                <SwipeCard
                  key={c.marketId}
                  card={{
                    marketId: c.marketId,
                    question: c.question,
                    triggerLabel: c.triggerLabel,
                    yesOddsBps: c.yesOddsBps,
                    noOddsBps: c.noOddsBps,
                    openingYesOddsBps: c.openingYesOddsBps,
                    timeLeft: c.timeLeft,
                    yesCount: c.yesCount,
                    noCount: c.noCount,
                  }}
                  mode={me ? "live" : "guest"}
                  maxStake={me?.points}
                />
              )
            )
          ) : (
            <div className="rounded-2xl border border-line bg-surface p-8 text-center text-muted">
              <p className="display text-xl text-ink">No card open right now</p>
              <p className="mt-1 text-sm">
                Cards fire off real events — a corner, a shot, a booking. Stay close.
              </p>
            </div>
          )}

          {settled.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">
                Recently settled
              </h3>
              <div className="space-y-2">
                {settled.map((c: any) => {
                  const p = posBy.get(c.marketId);
                  const won = c.status === "yes_won";
                  return (
                    <div key={c.marketId} className="rounded-xl border border-line bg-surface px-4 py-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <p className="flex-1">{c.question}</p>
                        <span className={`font-black ${won ? "text-yes" : "text-no"}`}>
                          {won ? "YES ✓" : "NO ✗"}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-muted">
                        <span>
                          {p
                            ? p.won
                              ? `You called it — paid ${fmtOdds(p.oddsBps)}`
                              : p.claimed
                              ? "You got this one wrong"
                              : `You said ${p.side ? "YES" : "NO"} — settling…`
                            : c.status === "yes_won"
                            ? "Proven on-chain by Merkle proof"
                            : "Expired unproven — NO paid"}
                        </span>
                        <Link href={`/verify/${c.marketId}`} className="font-semibold text-info hover:underline">
                          Verify →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted">Live ticker</h3>
              <button
                onClick={challenge}
                className="rounded-full border border-line px-3 py-1 text-xs font-bold transition hover:border-brand"
              >
                ⚔ Challenge a friend
              </button>
            </div>
            {duelLink && (
              <p className="mb-2 rounded-lg border border-brand/40 bg-brand/10 p-2 text-xs">
                Duel link copied — send it. Same cards, same match, side by side.
              </p>
            )}
            <Ticker events={data.ticker.map((e: any) => ({ ...e, ts: Number(e.ts) }))} />
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Your open call on this card, waiting for the pitch to decide. */
function LockedSummary({ card, position }: { card: any; position: any }) {
  return (
    <div className="rounded-2xl border border-info/40 bg-surface p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-info">Your call is locked</p>
      <p className="mt-2 font-bold">{card.question}</p>
      <p className="mt-2 text-xl font-black">
        <span className={position.side ? "text-yes" : "text-no"}>
          {position.side ? "YES" : "NO"}
        </span>{" "}
        @ {fmtOdds(position.oddsBps)}
        <span className="ml-2 text-sm font-semibold text-muted">
          {Number(position.amount)} pts
        </span>
      </p>
      <ConsensusInline card={card} side={position.side} />
      <Link
        href={`/r/${position.positionPda}`}
        className="mt-3 inline-block text-sm font-bold text-brand hover:underline"
      >
        View receipt →
      </Link>
    </div>
  );
}

function ConsensusInline({ card, side }: { card: any; side: boolean }) {
  const total = card.yesCount + card.noCount;
  if (!total) return null;
  const yesPct = Math.round((card.yesCount / total) * 100);
  const withYou = side ? yesPct : 100 - yesPct;
  return (
    <p className="mt-2 text-sm text-muted">
      {withYou >= 50
        ? `${withYou}% of fans are with you.`
        : `${100 - withYou}% of fans disagree with you.`}
    </p>
  );
}
