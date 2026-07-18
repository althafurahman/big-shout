"use client";

import Link from "next/link";
import { usePoll } from "@/lib/client";

export default function PracticeIndex() {
  const { data } = usePoll<any>("/api/practice/fixtures", 60_000);

  return (
    <div className="mx-auto max-w-2xl pt-8">
      <h1 className="display text-3xl">Practice</h1>
      <p className="mt-1 text-sm text-muted">
        Real moments from finished matches, replayed as cards. Free, unlimited,
        nothing at stake — learn how the game reads before you play it live.
      </p>

      {!data ? (
        <div className="mt-6 h-40 animate-pulse rounded-2xl border border-line bg-surface" />
      ) : data.fixtures.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-line bg-surface p-6 text-center text-muted">
          No finished matches available yet.
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {data.fixtures.map((f: any) => (
            <Link
              key={f.fixtureId}
              href={`/practice/${f.fixtureId}`}
              className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4 transition hover:border-brand"
            >
              <span className="display text-lg">
                {f.p1} <span className="text-muted">vs</span> {f.p2}
              </span>
              <span className="text-xs text-muted">
                {new Date(f.startTime).toLocaleDateString()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
