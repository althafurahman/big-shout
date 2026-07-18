"use client";

import Link from "next/link";
import { usePoll } from "@/lib/client";

export default function LeaderboardPage() {
  const { data } = usePoll<any>("/api/leaderboard", 10_000);

  return (
    <div className="mx-auto max-w-2xl pt-8">
      <h1 className="display text-3xl">Leaderboard</h1>
      <p className="mt-1 text-sm text-muted">
        Points are the flex. <strong className="text-ink">Rank is accuracy</strong> over at least{" "}
        {data?.minVolume ?? 5} settled calls — so a hundred throwaway accounts buy you nothing.
      </p>

      {!data ? (
        <div className="mt-6 h-64 animate-pulse rounded-2xl border border-line bg-surface" />
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface2 text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-2.5">#</th>
                <th className="px-2 py-2.5">Fan</th>
                <th className="px-2 py-2.5 text-right">Accuracy</th>
                <th className="px-2 py-2.5 text-right">Calls</th>
                <th className="px-2 py-2.5 text-right">Best streak</th>
                <th className="px-4 py-2.5 text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {data.leaderboard.map((r: any) => (
                <tr
                  key={r.username}
                  className={`border-t border-line ${
                    r.username === data.me ? "bg-brand/10" : "bg-surface"
                  }`}
                >
                  <td className="px-4 py-2.5 font-black tabular-nums">
                    {r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : r.rank}
                  </td>
                  <td className="px-2 py-2.5">
                    <Link href={`/u/${r.username}`} className="font-semibold hover:text-brand">
                      @{r.username}
                    </Link>
                    {!r.qualified && (
                      <span className="ml-2 text-[10px] uppercase text-muted">warming up</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right font-bold tabular-nums">
                    {r.total ? `${r.accuracy}%` : "—"}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-muted">
                    {r.correct}/{r.total}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-muted">
                    {r.bestStreak > 1 ? `🔥 ${r.bestStreak}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                    {r.points.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.leaderboard.length === 0 && (
            <p className="bg-surface p-8 text-center text-muted">
              Nobody on the board yet. Be the first shout.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
