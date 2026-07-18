"use client";

import Link from "next/link";
import { use } from "react";
import ReceiptCard from "@/components/ReceiptCard";
import { usePoll } from "@/lib/client";

/** A receipt someone shared into a group chat lands here. Public, no login. */
export default function ReceiptPage({ params }: { params: Promise<{ positionPda: string }> }) {
  const { positionPda } = use(params);
  const { data } = usePoll<any>(`/api/receipt/${positionPda}`, 8000);

  if (!data) {
    return <div className="mx-auto mt-10 h-72 max-w-lg animate-pulse rounded-2xl border border-line bg-surface" />;
  }
  if (data.error) return <p className="mt-10 text-center text-muted">{data.error}</p>;

  return (
    <div className="mx-auto max-w-lg pt-10">
      <ReceiptCard receipt={{ ...data, positionPda }} />
      <div className="mt-6 text-center text-sm text-muted">
        <p>
          Locked before the outcome. Settled by{" "}
          <span className="text-ink">TxODDS&apos; on-chain oracle</span>. Nobody — including us —
          could fake this.
        </p>
        <p className="mt-3">
          <Link href={`/u/${data.username}`} className="font-bold text-brand hover:underline">
            See @{data.username}&apos;s full record →
          </Link>
        </p>
        <p className="mt-4">
          <Link href="/" className="text-muted underline hover:text-ink">
            Think you&apos;d have called it? Prove it.
          </Link>
        </p>
      </div>
    </div>
  );
}
