"use client";

import { use, useState } from "react";
import { usePoll } from "@/lib/client";

/**
 * Public, no login: one settled call, explained so a football fan gets it
 * in ten seconds — with every technical receipt one tap deeper.
 */
export default function VerifyPage({ params }: { params: Promise<{ marketId: string }> }) {
  const { marketId } = use(params);
  const { data } = usePoll<any>(`/api/verify/${marketId}`, 15_000);
  const [showTech, setShowTech] = useState(false);

  if (!data) {
    return <div className="mt-8 h-64 animate-pulse rounded-2xl border border-line bg-surface" />;
  }
  if (data.error) return <p className="mt-10 text-center text-muted">{data.error}</p>;

  const won = data.card.status === "yes_won";
  const open = data.card.status === "open";

  const steps = [
    {
      icon: "🔒",
      title: "The call was locked first",
      body: "Every answer to this question was sealed on a public blockchain with a timestamp — before the outcome existed. No edits, no backdating.",
      link: data.links.createTx ? { href: data.links.createTx, label: "See the lock" } : null,
    },
    {
      icon: "📡",
      title: "The sport's own data decided",
      body: "TxODDS — the company whose data settles real sportsbooks — publishes every match stat with a cryptographic fingerprint. That fingerprint, not an admin, is the referee.",
      link: null,
    },
    won
      ? {
          icon: "✅",
          title: "The payout followed the proof",
          body: "A program checked the fingerprint against the published result and paid YES automatically. Nobody — including BigShout — could change the answer.",
          link: data.links.settleTx ? { href: data.links.settleTx, label: "See the settlement" } : null,
        }
      : {
          icon: "⏱️",
          title: "The window closed with nothing proven",
          body: "No proof of the event existed by the deadline (plus a safety margin), so NO paid automatically. The same rule applies to everyone, every time.",
          link: data.links.settleTx ? { href: data.links.settleTx, label: "See the settlement" } : null,
        },
  ];

  return (
    <div className="mx-auto max-w-2xl pt-6">
      {/* The verdict, front and center */}
      <div className="rounded-2xl border border-line bg-surface p-6 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">Settled call</p>
        <p className="mt-2 text-lg font-bold leading-snug">{data.card.question}</p>
        {data.fixture && (
          <p className="mt-1 text-sm text-muted">
            {data.fixture.p1} vs {data.fixture.p2}
            {data.fixture.simulated ? " · replay" : ""}
          </p>
        )}
        <p className={`display mt-4 text-4xl ${open ? "text-info" : won ? "text-yes" : "text-no"}`}>
          {open ? "STILL OPEN" : won ? "YES — IT HAPPENED" : "NO — IT DIDN'T"}
        </p>
        {!open && (
          <p className="mt-2 text-sm text-muted">
            {won
              ? "Proven by the match data, settled automatically."
              : "Nothing to prove by the deadline, settled automatically."}
          </p>
        )}
      </div>

      {/* Why you can trust it — three steps, no jargon */}
      {!open && (
        <div className="mt-4 space-y-2">
          {steps.map((s, i) => (
            <div key={i} className="flex gap-4 rounded-2xl border border-line bg-surface p-4">
              <span className="text-2xl leading-none">{s.icon}</span>
              <div className="min-w-0">
                <p className="font-bold">{s.title}</p>
                <p className="mt-0.5 text-sm text-muted">{s.body}</p>
                {s.link && (
                  <a
                    href={s.link.href}
                    target="_blank"
                    className="mt-1.5 inline-block text-sm font-bold text-info hover:underline"
                  >
                    {s.link.label} — on the public blockchain ↗
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* The receipts, for whoever wants to go all the way down */}
      <button
        onClick={() => setShowTech(!showTech)}
        className="mt-4 w-full rounded-xl border border-line py-2.5 text-sm font-semibold text-muted transition hover:border-brand hover:text-ink"
      >
        {showTech ? "Hide technical details" : "Technical details — for the skeptics"}
      </button>

      {showTech && (
        <div className="mt-3 space-y-3">
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-muted">The predicate</p>
            <p className="mt-2 text-sm text-muted">
              On-chain rule: stat key <code className="text-ink">{data.card.statKey}</code> must
              exceed <code className="text-ink">{data.card.threshold}</code> in a record
              timestamped before {new Date(Number(data.card.deadlineTs) * 1000).toUTCString()}.
            </p>
          </div>

          {data.onChain && (
            <div className="rounded-2xl border border-line bg-surface p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-muted">
                The market account (read live from devnet)
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted">Status</dt>
                <dd className="text-right font-semibold">{data.onChain.status}</dd>
                <dt className="text-muted">Calls</dt>
                <dd className="text-right tabular-nums">
                  {data.onChain.yesCount} YES / {data.onChain.noCount} NO
                </dd>
                <dt className="text-muted">Address</dt>
                <dd className="truncate text-right">
                  <a href={data.onChain.addressUrl} target="_blank" className="text-info hover:underline">
                    {data.onChain.address.slice(0, 8)}…{data.onChain.address.slice(-6)} ↗
                  </a>
                </dd>
              </dl>
            </div>
          )}

          {data.proof && !data.proof.error && (
            <div className="rounded-2xl border border-yes/40 bg-surface p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-yes">
                The Merkle proof (re-fetched live from TxLINE)
              </p>
              <p className="mt-2 text-sm text-muted">
                The stat is hashed into a leaf, proven up through the fixture&apos;s event tree
                into TxODDS&apos; daily batch root — published on-chain <em>before</em> settlement.
                Our program CPI&apos;d into their oracle, which walked this exact chain.
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted">Proven stat</dt>
                <dd className="text-right">
                  key {data.proof.stat?.key} = <strong>{data.proof.stat?.value}</strong> (period {data.proof.stat?.period})
                </dd>
                <dt className="text-muted">Record</dt>
                <dd className="text-right tabular-nums">
                  seq {data.proof.seq} · {new Date(data.proof.recordTs).toUTCString()}
                </dd>
                <dt className="text-muted">Proof path</dt>
                <dd className="text-right tabular-nums">
                  {data.proof.statProofLen} + {data.proof.fixtureProofLen} + {data.proof.mainTreeProofLen} hashes
                </dd>
                <dt className="text-muted">Daily root account</dt>
                <dd className="truncate text-right">
                  <a href={data.proof.rootAccountUrl} target="_blank" className="text-info hover:underline">
                    {data.proof.rootAccount.slice(0, 8)}… ↗
                  </a>
                </dd>
              </dl>
            </div>
          )}

          <div className="flex flex-wrap gap-3 text-sm font-semibold">
            <a href={data.links.oracleProgram} target="_blank" className="rounded-full border border-line px-4 py-2 hover:border-brand">
              TxODDS oracle program ↗
            </a>
          </div>

          {!open && !won && (
            <p className="text-xs text-muted">
              A Merkle proof can show a stat crossed a threshold — never that it didn&apos;t. NO
              settles by expiry: the window closed, a grace period passed, and no valid proof
              existed. Both paths are enforced by the program, not by us.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
