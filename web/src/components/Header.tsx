"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, useMe } from "@/lib/client";

export default function Header() {
  const { me, loaded, refresh } = useMe();
  const path = usePathname();
  const router = useRouter();

  const nav = [
    { href: "/feed", label: "Matches", icon: "⚽" },
    { href: "/practice", label: "Practice", icon: "🎯" },
    { href: "/leaderboard", label: "Board", icon: "🏆" },
  ];

  async function signOut() {
    await api("/api/auth/logout", { method: "POST" });
    refresh();
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-5 px-4">
          <Link href="/" className="display text-xl leading-none">
            BIG<span className="text-brand">SHOUT</span>
          </Link>
          <nav className="hidden items-center gap-4 text-sm text-muted sm:flex">
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
          <div className="ml-auto flex items-center gap-2.5 text-sm">
            {me ? (
              <>
                <span className="rounded-full border border-line bg-surface px-3 py-1 font-semibold tabular-nums">
                  {me.points.toLocaleString()} <span className="text-muted">pts</span>
                </span>
                {me.streak > 1 && (
                  <span className="hidden rounded-full border border-line bg-surface px-2.5 py-1 tabular-nums sm:inline" title="Streak">
                    🔥 {me.streak}
                  </span>
                )}
                <Link
                  href={`/u/${me.username}`}
                  className="font-semibold text-brand hover:underline"
                >
                  @{me.username}
                </Link>
                <button
                  onClick={signOut}
                  title="Sign out"
                  className="rounded-full border border-line px-2.5 py-1 text-xs text-muted transition hover:border-no hover:text-no"
                >
                  Sign out
                </button>
              </>
            ) : loaded ? (
              <>
                <span className="hidden rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-muted sm:inline">
                  Guest mode
                </span>
                <Link
                  href={`/auth?next=${encodeURIComponent(path ?? "/feed")}`}
                  className="rounded-full bg-brand px-4 py-1.5 font-bold text-black transition hover:brightness-110"
                >
                  Sign up
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {/* App-style bottom navigation on phones */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 backdrop-blur sm:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4">
          {[...nav, me
            ? { href: `/u/${me.username}`, label: "You", icon: "📣" }
            : { href: "/auth", label: "Join", icon: "📣" }].map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${
                path?.startsWith(n.href) ? "text-brand" : "text-muted"
              }`}
            >
              <span className="text-base leading-none">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
