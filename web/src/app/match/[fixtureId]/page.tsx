"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import ActiveRooms from "@/components/ActiveRooms";
import GuestBanner from "@/components/GuestBanner";
import PressureMeter from "@/components/PressureMeter";
import SwipeCard from "@/components/SwipeCard";
import Ticker from "@/components/Ticker";
import { api, useMe, usePoll } from "@/lib/client";
import { flagFor, fmtOdds, isFinished, isLive, phaseLabel } from "@/lib/meta";

export default function MatchPage({ params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = use(params);
  const { me } = useMe();
  const router = useRouter();
  const { data } = usePoll<any>(`/api/match/${fixtureId}`, 3000);
  const [showAllSettled, setShowAllSettled] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [skipped, setSkipped] = useState<number[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(`bs-skip-${fixtureId}`) ?? "[]");
    } catch {
      return [];
    }
  });

  function skipCard(marketId: number) {
    setSkipped((prev) => {
      const next = [...prev, marketId];
      try {
        sessionStorage.setItem(`bs-skip-${fixtureId}`, JSON.stringify(next));
      } catch { /* private mode */ }
      return next;
    });
  }

  if (!data) {
    return <div className="mt-8 h-64 animate-pulse rounded-2xl border border-line bg-surface" />;
  }
  if (data.error) {
    return <p className="mt-10 text-center text-muted">{data.error}</p>;
  }

  const live = isLive(data.statusId);
  const done = isFinished(data.statusId);
  const openAll = data.cards.filter((c: any) => c.status === "open");
  const openCards = openAll.filter((c: any) => !skipped.includes(c.marketId));
  const skippedOpen = openAll.length - openCards.length;
  const settledAll = data.cards.filter((c: any) => c.status !== "open");
  const settled = showAllSettled ? settledAll : settledAll.slice(0, 3);
  const posBy = new Map<number, any>((data.positions ?? []).map((p: any) => [Number(p.marketId), p]));
  const s = data.score ?? {};
  const events = data.ticker.map((e: any) => ({ ...e, ts: Number(e.ts) }));

  async function createRoom() {
    if (!me) {
      router.push(`/auth?next=${encodeURIComponent(`/match/${fixtureId}`)}`);
      return;
    }
    setCreatingRoom(true);
    try {
      const res = await api("/api/duel", {
        method: "POST",
        body: JSON.stringify({ fixtureId: Number(fixtureId) }),
      });
      router.push(`/duel/${res.slug}`);
    } catch (e: any) {
      setCreatingRoom(false);
    }
  }

  return (
    <div className="space-y-4 pt-4">
      <GuestBanner />

      {/* The night pitch — score, phase, and the numbers calls settle on */}
      <div className="pitch-surface rounded-2xl px-4 py-6 sm:px-6">
        <div className="relative z-10">
          <div className="flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/70">
            {live && <span className="live-dot" />}
            <span>{phaseLabel(data.statusId)}</span>
            {data.fixture.simulated && (
              <span
                className="rounded border border-info/60 px-1.5 py-0.5 text-[10px] text-info"
                title="A finished match re-run through the live engine — cards and settlements are real"
              >
                Replay
              </span>
            )}
          </div>

          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
            <div className="flex min-w-0 flex-col items-center gap-1.5">
              <span className="text-4xl leading-none sm:text-5xl">{flagFor(data.fixture.p1)}</span>
              <span className="display w-full truncate text-center text-lg sm:text-2xl">
                {data.fixture.p1}
              </span>
            </div>
            <p className="display text-5xl tabular-nums sm:text-7xl">
              {s.goals1 ?? 0}
              <span className="mx-1.5 text-white/40 sm:mx-3">–</span>
              {s.goals2 ?? 0}
            </p>
            <div className="flex min-w-0 flex-col items-center gap-1.5">
              <span className="text-4xl leading-none sm:text-5xl">{flagFor(data.fixture.p2)}</span>
              <span className="display w-full truncate text-center text-lg sm:text-2xl">
                {data.fixture.p2}
              </span>
            </div>
          </div>

          {/* The stats cards settle on — corners, bookings — at a glance */}
          <div className="mx-auto mt-5 flex max-w-sm items-center justify-center gap-2 text-xs font-semibold text-white/80 sm:gap-3">
            {[
              ["🚩", s.corners1 ?? 0, s.corners2 ?? 0, "Corners"],
              ["🟨", s.yellows1 ?? 0, s.yellows2 ?? 0, "Yellow cards"],
              ["🟥", s.reds1 ?? 0, s.reds2 ?? 0, "Red cards"],
            ].map(([icon, a, b, label]) => (
              <span
                key={label as string}
                title={label as string}
                className="flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-1 tabular-nums"
              >
                <span>{icon}</span>
                {a}<span className="text-white/40">·</span>{b}
              </span>
            ))}
          </div>
        </div>
      </div>

      <PressureMeter
        p1={data.pressure.p1}
        p2={data.pressure.p2}
        name1={data.fixture.p1}
        name2={data.fixture.p2}
      />

      {/* Rooms are the social spine — front and center, but only while
          there's still a match to call. */}
      {!done && (
        <button
          onClick={createRoom}
          disabled={creatingRoom}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-brand/60 bg-brand/10 px-5 py-4 text-left transition hover:bg-brand/20 disabled:opacity-60"
        >
          <span>
            <span className="display text-lg">⚔️ Challenge your friends</span>
            <span className="mt-0.5 block text-sm text-muted">
              Open a match room — same cards, live room leaderboard.
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-brand px-4 py-1.5 text-sm font-bold text-black">
            {creatingRoom ? "Opening…" : me ? "Create room" : "Sign in"}
          </span>
        </button>
      )}

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
                windowSecs={Math.max(1, Number(c.deadlineTs) - Number(c.createdTs))}
                onSkip={() => skipCard(c.marketId)}
              />
            )
          )
        ) : (
          <div className="rounded-2xl border border-line bg-surface p-6 text-center text-muted">
            <p className="display text-xl text-ink">
              {done ? "Full time — the calls are in" : skippedOpen > 0 ? "Cards skipped" : "No card open right now"}
            </p>
            <p className="mt-1 text-sm">
              {done
                ? "Every settled call below is provable on-chain."
                : skippedOpen > 0
                ? "You passed on the open cards for now."
                : "Cards fire off real events — a corner, a shot, a booking. Stay close."}
            </p>
            {!done && skippedOpen > 0 && (
              <button
                onClick={() => {
                  setSkipped([]);
                  try { sessionStorage.removeItem(`bs-skip-${fixtureId}`); } catch { /* ok */ }
                }}
                className="mt-3 rounded-full border border-line px-4 py-1.5 text-sm font-bold text-ink transition hover:border-brand"
              >
                Bring back {skippedOpen} skipped card{skippedOpen > 1 ? "s" : ""}
              </button>
            )}
          </div>
        )}

        <ActiveRooms variant="panel" fixtureId={Number(fixtureId)} />

        {settledAll.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">
              Settled calls
            </h3>
            <div className="space-y-2">
              {settled.map((c: any) => {
                const p = posBy.get(c.marketId);
                const won = c.status === "yes_won";
                return (
                  <Link
                    key={c.marketId}
                    href={`/verify/${c.marketId}`}
                    className="block rounded-xl border border-line bg-surface px-4 py-3 text-sm transition hover:border-brand"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="flex-1">{c.question}</p>
                      <span className={`shrink-0 font-black ${won ? "text-yes" : "text-no"}`}>
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
                          : won
                          ? "Proven by the data — tap to check it"
                          : "Nothing happened in the window — tap to check it"}
                      </span>
                      <span className="font-semibold text-info">Check it →</span>
                    </div>
                  </Link>
                );
              })}
            </div>
            {settledAll.length > 3 && (
              <button
                onClick={() => setShowAllSettled(!showAllSettled)}
                className="mt-2 w-full rounded-xl border border-line py-2 text-sm font-semibold text-muted transition hover:border-brand hover:text-ink"
              >
                {showAllSettled ? "Show fewer" : `Show all ${settledAll.length} settled calls`}
              </button>
            )}
          </section>
        )}

        {events.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">
              Match events
            </h3>
            <Ticker events={showAllEvents ? events : events.slice(0, 3)} />
            {events.length > 3 && (
              <button
                onClick={() => setShowAllEvents(!showAllEvents)}
                className="mt-2 w-full rounded-xl border border-line py-2 text-sm font-semibold text-muted transition hover:border-brand hover:text-ink"
              >
                {showAllEvents ? "Collapse" : `Show all ${events.length} events`}
              </button>
            )}
          </section>
        )}
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
