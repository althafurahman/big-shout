"use client";

import Link from "next/link";
import ActiveRooms from "@/components/ActiveRooms";
import GuestBanner from "@/components/GuestBanner";
import { usePoll } from "@/lib/client";
import { flagFor, isFinished, isLive, phaseLabel } from "@/lib/meta";

type Row = {
  fixtureId: number;
  p1: string;
  p2: string;
  startTime: number;
  statusId: number;
  simulated: boolean;
  goals1: number;
  goals2: number;
  openCards: number;
};

function MatchRow({ f }: { f: Row }) {
  const live = isLive(f.statusId);
  const done = isFinished(f.statusId);
  return (
    <Link
      href={`/match/${f.fixtureId}`}
      className="block rounded-2xl border border-line bg-surface p-4 transition hover:border-brand"
    >
      <div className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wider text-muted">
        <span className="flex items-center gap-1.5">
          {live && <span className="live-dot" />}
          <span className={live ? "text-ink" : ""}>{phaseLabel(f.statusId)}</span>
          {f.simulated && (
            <span
              className="rounded border border-info/50 px-1.5 py-0.5 text-[10px] text-info"
              title="A finished match re-run through the live engine — cards and settlements are real"
            >
              Replay
            </span>
          )}
        </span>
        {f.openCards > 0 ? (
          <span className="rounded-full bg-brand px-2.5 py-0.5 font-bold normal-case tracking-normal text-black">
            {f.openCards} live card{f.openCards > 1 ? "s" : ""}
          </span>
        ) : !live && !done ? (
          <span className="tabular-nums normal-case tracking-normal">
            {new Date(f.startTime).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        ) : null}
      </div>
      <div className="mt-2.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <span className="flex min-w-0 items-center justify-end gap-2">
          <span className="display truncate text-lg sm:text-xl">{f.p1}</span>
          <span className="text-2xl leading-none">{flagFor(f.p1)}</span>
        </span>
        <span className="display px-1 text-2xl tabular-nums sm:text-3xl">
          {live || done ? (
            <>
              {f.goals1}
              <span className="mx-0.5 text-muted">–</span>
              {f.goals2}
            </>
          ) : (
            <span className="text-muted">vs</span>
          )}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-2xl leading-none">{flagFor(f.p2)}</span>
          <span className="display truncate text-lg sm:text-xl">{f.p2}</span>
        </span>
      </div>
    </Link>
  );
}

function Section({ title, dot, rows }: { title: string; dot?: boolean; rows: Row[] }) {
  if (!rows.length) return null;
  return (
    <section className="mt-7">
      <h2 className="mb-2.5 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
        {dot && <span className="live-dot" />}
        {title}
      </h2>
      <div className="space-y-3">
        {rows.map((f) => (
          <MatchRow key={f.fixtureId} f={f} />
        ))}
      </div>
    </section>
  );
}

export default function FeedPage() {
  const { data } = usePoll<any>("/api/feed", 5000);
  const fixtures: Row[] = data?.fixtures ?? [];

  const liveNow = fixtures.filter((f) => isLive(f.statusId));
  const upNext = fixtures
    .filter((f) => !isLive(f.statusId) && !isFinished(f.statusId))
    .sort((a, b) => a.startTime - b.startTime);
  const finished = fixtures
    .filter((f) => isFinished(f.statusId))
    .sort((a, b) => b.startTime - a.startTime);

  return (
    <div className="pt-6">
      <GuestBanner />
      <ActiveRooms variant="banner" />

      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <p className="wc-eyebrow text-[11px] font-bold uppercase">
            🏆 World Cup 2026 · The finals
          </p>
          <h1 className="display mt-1 text-4xl">Matches</h1>
        </div>
        <Link
          href="/replay"
          className="shrink-0 rounded-full border border-line px-4 py-1.5 text-sm font-bold transition hover:border-brand"
        >
          ▶ Demo replay
        </Link>
      </div>

      {!data ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-line bg-surface" />
          ))}
        </div>
      ) : fixtures.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-8 text-center text-muted">
          <p>No matches tracked yet — new fixtures appear automatically.</p>
          <p className="mt-2">
            Or <Link href="/replay" className="font-bold text-brand hover:underline">start a replay</Link>{" "}
            to watch a finished match play out live.
          </p>
        </div>
      ) : (
        <>
          <Section title="Live now" dot rows={liveNow} />
          <Section title="Up next" rows={upNext} />
          <Section title="Finished" rows={finished} />
        </>
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
