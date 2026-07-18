"use client";

import { use } from "react";
import { usePoll } from "@/lib/client";

/**
 * Public, no login: one settlement, its Merkle proof, its transactions.
 * This page exists so "trust me" never has to be said.
 */
export default function VerifyPage({ params }: { params: Promise<{ marketId: string }> }) {
  const { marketId } = use(params);
  const { data } = usePoll<any>(`/api/verify/${marketId}`, 15_000);

  if (!data) {
    return <div className="mt-8 h-64 animate-pulse rounded-2xl border border-line bg-surface" />;
  }
  if (data.error) return <p className="mt-10 text-center text-muted">{data.error}</p>;

  const won = data.card.status === "yes_won";
  const open = data.card.status === "open";

  return (
    <div className="mx-auto max-w-2xl pt-8">
      <h1 className="display text-3xl">Verify it yourself</h1>
      <p className="mt-1 text-sm text-muted">
        Every step below is on public infrastructure. You don&apos;t need to trust BigShout —
        that&apos;s the point.
      </p>

      <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">The question</p>
        <p className="mt-1 text-lg font-bold">{data.card.question}</p>
        {data.fixture && (
          <p className="mt-1 text-sm text-muted">
            {data.fixture.p1} vs {data.fixture.p2}
            {data.fixture.simulated ? " · simulated live" : ""}
          </p>
        )}
        <p className={`mt-3 text-2xl font-black ${open ? "text-info" : won ? "text-yes" : "text-no"}`}>
          {open ? "STILL OPEN" : won ? "YES — PROVEN" : "NO — EXPIRED UNPROVEN"}
        </p>
        <p className="mt-2 text-sm text-muted">
          On-chain predicate: stat key <code className="text-ink">{data.card.statKey}</code> must
          exceed <code className="text-ink">{data.card.threshold}</code> in a record timestamped
          before {new Date(Number(data.card.deadlineTs) * 1000).toUTCString()}.
        </p>
      </div>

      {data.onChain && (
        <div className="mt-4 rounded-2xl border border-line bg-surface p-5">
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
        <div className="mt-4 rounded-2xl border border-yes/40 bg-surface p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-yes">
            The Merkle proof (re-fetched live from TxLINE)
          </p>
          <p className="mt-2 text-sm text-muted">
            The stat below is hashed into a leaf, proven up through the fixture&apos;s event tree
            into TxODDS&apos; daily batch root — which sits in an on-chain account TxODDS
            published <em>before</em> we settled. Our program CPI&apos;d into their oracle, which
            walked this exact chain.
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

      <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
        {data.links.settleTx && (
          <a href={data.links.settleTx} target="_blank" className="rounded-full bg-brand px-4 py-2 font-bold text-black">
            Settlement transaction ↗
          </a>
        )}
        {data.links.createTx && (
          <a href={data.links.createTx} target="_blank" className="rounded-full border border-line px-4 py-2 hover:border-brand">
            Market creation ↗
          </a>
        )}
        <a href={data.links.oracleProgram} target="_blank" className="rounded-full border border-line px-4 py-2 hover:border-brand">
          TxODDS oracle program ↗
        </a>
      </div>

      {!open && !won && (
        <p className="mt-4 text-xs text-muted">
          A Merkle proof can show a stat crossed a threshold — never that it didn&apos;t. NO wins
          settle by expiry: the window closed, a grace period passed, and no valid proof existed.
          Both paths are enforced by the program, not by us.
        </p>
      )}
    </div>
  );
}
