"use client";

import Link from "next/link";
import { use, useState } from "react";
import { api, useMe, usePoll } from "@/lib/client";
import { flagFor, isFinished, isLive, phaseLabel } from "@/lib/meta";

/** The match room: your crew around one match, scored live. */
export default function RoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { me } = useMe();
  const { data, refresh } = usePoll<any>(`/api/duel/${slug}`, 5000);
  const [copied, setCopied] = useState(false);
  const [joining, setJoining] = useState(false);

  if (!data) {
    return <div className="mt-8 h-64 animate-pulse rounded-2xl border border-line bg-surface" />;
  }
  if (data.error) return <p className="mt-10 text-center text-muted">{data.error}</p>;

  const f = data.fixture;
  const live = f && isLive(f.statusId);
  const done = f && isFinished(f.statusId);
  const board: any[] = data.board ?? [];
  const podium = board.slice(0, 3);
  const rest = board.slice(3);

  async function join() {
    setJoining(true);
    try {
      await api(`/api/duel/${slug}`, { method: "POST" });
      refresh();
    } finally {
      setJoining(false);
    }
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(`${location.origin}/duel/${slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mx-auto max-w-2xl pt-6">
      <p className="wc-eyebrow text-center text-[11px] font-bold uppercase">⚔️ Match room</p>

      {f && (
        <Link
          href={`/match/${f.fixtureId}`}
          className="mt-3 block rounded-2xl border border-line bg-surface p-4 transition hover:border-brand"
        >
          <div className="flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted">
            {live && <span className="live-dot" />}
            {phaseLabel(f.statusId)}
            {f.simulated && (
              <span className="rounded border border-info/50 px-1.5 py-0.5 text-[10px] text-info">Replay</span>
            )}
          </div>
          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <span className="flex min-w-0 items-center justify-end gap-2">
              <span className="display truncate text-lg">{f.p1}</span>
              <span className="text-2xl">{flagFor(f.p1)}</span>
            </span>
            <span className="display text-2xl tabular-nums">
              {live || done ? `${f.goals1}–${f.goals2}` : "vs"}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-2xl">{flagFor(f.p2)}</span>
              <span className="display truncate text-lg">{f.p2}</span>
            </span>
          </div>
          {!done && (
            <p className="mt-2 text-center text-xs font-bold text-brand">
              Open the match to make your calls →
            </p>
          )}
        </Link>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={copyInvite}
          className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-bold text-black transition hover:brightness-110"
        >
          {copied ? "Invite link copied ✓" : "Copy invite link"}
        </button>
        {data.canJoin && (
          <button
            onClick={join}
            disabled={joining}
            className="flex-1 rounded-xl border border-brand py-2.5 text-sm font-bold text-brand transition hover:bg-brand/10 disabled:opacity-50"
          >
            {joining ? "Joining…" : "Take a seat"}
          </button>
        )}
        {!me && (
          <Link
            href={`/auth?next=${encodeURIComponent(`/duel/${slug}`)}`}
            className="flex flex-1 items-center justify-center rounded-xl border border-brand py-2.5 text-sm font-bold text-brand transition hover:bg-brand/10"
          >
            Sign in to join
          </Link>
        )}
      </div>

      {/* Room leaderboard */}
      <h2 className="mt-7 text-xs font-bold uppercase tracking-widest text-muted">
        Room leaderboard
      </h2>
      {board.length === 0 ? (
        <p className="mt-2 rounded-xl border border-line bg-surface p-5 text-center text-sm text-muted">
          Nobody in the room yet — copy the invite link and get your crew in.
        </p>
      ) : (
        <>
          {podium.length > 1 ? (
            <div className="mt-3 grid grid-cols-3 items-end gap-2">
              {[podium[1], podium[0], podium[2]].map((m, i) =>
                m ? (
                  <div
                    key={m.username}
                    className={`rounded-2xl border p-3 text-center ${
                      i === 1 ? "border-brand bg-brand/10 pb-6" : "border-line bg-surface"
                    }`}
                  >
                    <p className="text-lg">{i === 1 ? "🥇" : i === 0 ? "🥈" : "🥉"}</p>
                    <Link
                      href={`/u/${m.username}`}
                      className="display block truncate text-base hover:text-brand"
                    >
                      {m.username}
                    </Link>
                    <p className="display mt-1 text-3xl">
                      {m.correct}
                      <span className="text-sm text-muted">/{m.settled}</span>
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-muted">right</p>
                    {m.isYou && <p className="mt-1 text-[10px] font-black text-brand">YOU</p>}
                  </div>
                ) : (
                  <div key={i} />
                )
              )}
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-line bg-surface p-4 text-center">
              <p className="display text-lg">{podium[0]?.username}</p>
              <p className="text-sm text-muted">is waiting for challengers…</p>
            </div>
          )}
          {rest.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {rest.map((m, i) => (
                <div
                  key={m.username}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm ${
                    m.isYou ? "border-brand/60 bg-brand/10" : "border-line bg-surface"
                  }`}
                >
                  <span className="w-6 font-black tabular-nums text-muted">{i + 4}</span>
                  <Link href={`/u/${m.username}`} className="flex-1 font-semibold hover:text-brand">
                    @{m.username} {m.isYou && <span className="text-xs text-brand">· you</span>}
                  </Link>
                  <span className="tabular-nums">
                    {m.correct}/{m.settled} <span className="text-muted">right</span>
                  </span>
                  <span className="tabular-nums text-muted">+{m.pointsWon}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Card-by-card picks */}
      {data.cards.length > 0 && (
        <>
          <h2 className="mt-7 text-xs font-bold uppercase tracking-widest text-muted">
            Card by card
          </h2>
          <div className="mt-2 space-y-2">
            {data.cards.map((c: any) => (
              <div key={c.marketId} className="rounded-xl border border-line bg-surface px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm">{c.question}</p>
                  {c.status !== "open" && (
                    <span className={`shrink-0 text-xs font-black ${c.status === "yes_won" ? "text-yes" : "text-no"}`}>
                      {c.status === "yes_won" ? "YES ✓" : "NO ✗"}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.picks.length === 0 ? (
                    <span className="text-xs text-muted">No one in the room called this one</span>
                  ) : (
                    c.picks.map((p: any) => (
                      <span
                        key={p.username}
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                          p.claimed
                            ? p.won
                              ? "border-yes/60 text-yes"
                              : "border-no/60 text-no"
                            : "border-info/50 text-info"
                        }`}
                      >
                        {p.username}: {p.side ? "YES" : "NO"}
                        {p.claimed ? (p.won ? " ✓" : " ✗") : ""}
                      </span>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
