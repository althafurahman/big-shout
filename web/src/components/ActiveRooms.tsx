"use client";

import Link from "next/link";
import { useState } from "react";
import { api, usePoll } from "@/lib/client";
import { flagFor, isLive } from "@/lib/meta";

interface Room {
  slug: string;
  fixtureId: number;
  p1: string;
  p2: string;
  statusId: number;
  goals1: number;
  goals2: number;
  members: number;
  active: boolean;
}

/**
 * The way back into an ongoing room session, from anywhere.
 * - banner: slim strip (feed) — "you have rooms running, hop back in".
 * - panel: room management on the match screen — switch between your rooms
 *   and check the session board without leaving the match.
 */
export default function ActiveRooms({
  variant,
  fixtureId,
}: {
  variant: "banner" | "panel";
  fixtureId?: number;
}) {
  const { data } = usePoll<{ rooms: Room[] }>("/api/rooms/mine", 20_000);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [board, setBoard] = useState<any>(null);

  const rooms = (data?.rooms ?? []).filter((r) => r.active);
  if (!rooms.length) return null;

  async function toggleBoard(slug: string) {
    if (openSlug === slug) {
      setOpenSlug(null);
      return;
    }
    setOpenSlug(slug);
    setBoard(null);
    try {
      setBoard(await api(`/api/duel/${slug}`));
    } catch {
      setBoard({ error: true });
    }
  }

  if (variant === "banner") {
    return (
      <div className="mt-4 flex items-center gap-2 overflow-x-auto rounded-xl border border-line bg-surface px-3 py-2.5">
        <span className="shrink-0 text-xs font-bold uppercase tracking-widest text-muted">
          ⚔️ Your rooms
        </span>
        {rooms.map((r) => (
          <Link
            key={r.slug}
            href={`/duel/${r.slug}`}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-brand/50 bg-brand/10 px-3 py-1 text-xs font-bold transition hover:bg-brand/20"
          >
            {isLive(r.statusId) && <span className="live-dot" />}
            {flagFor(r.p1)} {r.goals1}–{r.goals2} {flagFor(r.p2)}
            <span className="text-muted">· {r.members} in</span>
          </Link>
        ))}
      </div>
    );
  }

  // panel — only this match's rooms; the feed banner covers the rest
  const here = rooms.filter((r) => r.fixtureId === fixtureId);
  if (!here.length) return null;

  return (
    <section>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">
        Your rooms
      </h3>
      <div className="space-y-2">
        {here.map((r) => (
          <div key={r.slug} className="rounded-xl border border-line bg-surface">
            <button
              onClick={() => toggleBoard(r.slug)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm"
            >
              <span className="flex items-center gap-2 font-semibold">
                {isLive(r.statusId) && <span className="live-dot" />}
                {flagFor(r.p1)} {r.p1} {r.goals1}–{r.goals2} {r.p2} {flagFor(r.p2)}
              </span>
              <span className="shrink-0 text-xs font-bold text-brand">
                {openSlug === r.slug ? "Hide board" : "Session board"}
              </span>
            </button>
            {openSlug === r.slug && (
              <div className="border-t border-line px-4 py-3">
                {!board ? (
                  <div className="h-16 animate-pulse rounded-lg bg-surface2" />
                ) : board.error ? (
                  <p className="text-sm text-muted">Couldn&apos;t load this room right now.</p>
                ) : (
                  <>
                    <div className="space-y-1">
                      {board.board.slice(0, 5).map((m: any, i: number) => (
                        <div
                          key={m.username}
                          className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${
                            m.isYou ? "bg-brand/10 font-bold" : ""
                          }`}
                        >
                          <span className="w-5 tabular-nums text-muted">
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                          </span>
                          <span className="flex-1 truncate">
                            {m.username} {m.isYou && <span className="text-xs text-brand">· you</span>}
                          </span>
                          <span className="tabular-nums">
                            {m.correct}/{m.settled}
                          </span>
                          <span className="tabular-nums text-xs text-muted">+{m.pointsWon}</span>
                        </div>
                      ))}
                    </div>
                    <Link
                      href={`/duel/${r.slug}`}
                      className="mt-2 inline-block text-xs font-bold text-brand hover:underline"
                    >
                      Open the full room →
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
