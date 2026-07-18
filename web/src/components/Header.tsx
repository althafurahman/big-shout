"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/client";

export default function Header() {
  const { me, loaded } = useMe();
  const path = usePathname();

  const nav = [
    { href: "/feed", label: "Matches" },
    { href: "/practice", label: "Practice" },
    { href: "/leaderboard", label: "Leaderboard" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-5 px-4">
        <Link href="/" className="display text-xl leading-none">
          BIG<span className="text-brand">SHOUT</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`transition hover:text-ink ${path?.startsWith(n.href) ? "text-ink" : ""}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {me ? (
            <>
              <span className="rounded-full border border-line bg-surface px-3 py-1 font-semibold tabular-nums">
                {me.points.toLocaleString()} <span className="text-muted">pts</span>
              </span>
              {me.streak > 1 && (
                <span className="rounded-full border border-line bg-surface px-2.5 py-1 tabular-nums" title="Streak">
                  🔥 {me.streak}
                </span>
              )}
              <Link
                href={`/u/${me.username}`}
                className="font-semibold text-brand hover:underline"
              >
                @{me.username}
              </Link>
            </>
          ) : loaded ? (
            <Link
              href="/auth"
              className="rounded-full bg-brand px-4 py-1.5 font-bold text-black transition hover:brightness-110"
            >
              Sign up
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
