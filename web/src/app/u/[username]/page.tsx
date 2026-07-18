"use client";

import Link from "next/link";
import { use } from "react";
import ReceiptCard from "@/components/ReceiptCard";
import { usePoll } from "@/lib/client";
import { fmtOdds, rarity } from "@/lib/meta";

const FAMILY_LABELS: Record<string, string> = {
  goals: "Goals",
  corners: "Corners",
  bookings: "Cards",
};

/** Public. Every number on this page derives from settled on-chain records. */
export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const { data } = usePoll<any>(`/api/profile/${username}`, 15_000);

  if (!data) {
    return <div className="mt-8 h-64 animate-pulse rounded-2xl border border-line bg-surface" />;
  }
  if (data.error) return <p className="mt-10 text-center text-muted">{data.error}</p>;

  const acc = data.stats.total ? Math.round((data.stats.correct / data.stats.total) * 100) : null;

  return (
    <div className="mx-auto max-w-2xl pt-8">
      <div className="rounded-2xl border border-line bg-surface p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="display text-3xl">@{data.username}</h1>
          <p className="text-xs text-muted">every call on this page is provable on-chain</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Accuracy", acc !== null ? `${acc}%` : "—"],
            ["Calls", `${data.stats.correct}/${data.stats.total}`],
            ["Best streak", data.stats.bestStreak > 0 ? `🔥 ${data.stats.bestStreak}` : "—"],
            ["Points", data.stats.points.toLocaleString()],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-xl bg-surface2 p-3 text-center">
              <p className="display text-2xl">{value}</p>
              <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
            </div>
          ))}
        </div>

        {data.reputation.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-widest text-muted">
              What kind of fan is this?
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {data.reputation.map((r: any) => (
                <span
                  key={r.family}
                  className="rounded-full border border-line bg-surface2 px-3 py-1 text-sm"
                >
                  <strong className={r.pct >= 50 ? "text-yes" : "text-no"}>{r.pct}%</strong>{" "}
                  on {FAMILY_LABELS[r.family] ?? r.family}{" "}
                  <span className="text-muted">({r.correct}/{r.total})</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {data.bestCall && (
        <div className="mt-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">
            Best call — {rarity(data.bestCall.oddsBps).label} at {fmtOdds(data.bestCall.oddsBps)}
          </h2>
          <ReceiptCard
            receipt={{
              username: data.username,
              question: data.bestCall.question,
              side: data.bestCall.side,
              amount: data.bestCall.amount,
              oddsBps: data.bestCall.oddsBps,
              lockedTs: data.bestCall.lockedTs,
              status: data.bestCall.status,
              won: data.bestCall.won,
              claimed: data.bestCall.claimed,
              fixture: data.bestCall.fixture,
              positionPda: data.bestCall.positionPda,
              links: { verify: null },
            }}
          />
        </div>
      )}

      <h2 className="mt-8 text-xs font-bold uppercase tracking-widest text-muted">
        The record
      </h2>
      <div className="mt-2 space-y-2">
        {data.receipts.map((r: any) => {
          const rr = rarity(r.oddsBps);
          return (
            <Link
              key={r.positionPda}
              href={`/r/${r.positionPda}`}
              className="block rounded-xl border border-line bg-surface px-4 py-3 text-sm transition hover:border-brand"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="flex-1 truncate">{r.question}</p>
                <span className={`shrink-0 font-black ${
                  !r.settled || !r.claimed ? "text-info" : r.won ? "text-yes" : "text-no"
                }`}>
                  {!r.settled || !r.claimed ? "SEALED" : r.won ? "✓" : "✗"}
                </span>
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted">
                <span>
                  {r.side ? "YES" : "NO"} @ {fmtOdds(r.oddsBps)} ·{" "}
                  <span style={{ color: `var(--rarity-${rr.tier})` }}>{rr.label}</span>
                </span>
                <span>{r.fixture ? `${r.fixture.p1} v ${r.fixture.p2}` : ""}</span>
              </div>
            </Link>
          );
        })}
        {data.receipts.length === 0 && (
          <p className="rounded-xl border border-line bg-surface p-6 text-center text-muted">
            No calls yet. The record starts with the first swipe.
          </p>
        )}
      </div>
    </div>
  );
}
