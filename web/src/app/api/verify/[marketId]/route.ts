import { fetchMarketAccount, marketPda } from "@/lib/chain";
import { config, explorerAccount, explorerTx } from "@/lib/config";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json";
import { txline } from "@/lib/txline";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

/**
 * Public verification, no login. Reads the market account live from the
 * chain, and — for YES settlements — re-fetches the exact Merkle proof from
 * TxLINE at the settled seq, so anyone can see the chain of custody:
 * stat leaf -> fixture sub-tree -> daily batch root -> on-chain root PDA.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ marketId: string }> }
) {
  const marketId = BigInt((await params).marketId);
  const card = await prisma.card.findUnique({ where: { marketId } });
  if (!card) return Response.json({ error: "Unknown market" }, { status: 404 });

  const fixture = await prisma.fixture.findUnique({ where: { fixtureId: card.fixtureId } });
  const account = await fetchMarketAccount(marketId);

  let proof: any = null;
  if (card.settleSeq && card.status === "yes_won") {
    try {
      const val = await txline.statValidation(
        Number(card.fixtureId),
        card.settleSeq,
        [card.statKey]
      );
      const ts = val.summary.updateStats.minTimestamp as number;
      const epochDay = Math.floor(ts / 86_400_000);
      const rootPda = PublicKey.findProgramAddressSync(
        [Buffer.from("daily_scores_roots"), new BN(epochDay).toBuffer("le", 2)],
        new PublicKey(config.txoracleProgramId)
      )[0];
      proof = {
        seq: card.settleSeq,
        recordTs: ts,
        epochDay,
        stat: val.statsToProve?.[0] ?? null,
        statProofLen: val.statProofs?.[0]?.length ?? 0,
        fixtureProofLen: val.subTreeProof?.length ?? 0,
        mainTreeProofLen: val.mainTreeProof?.length ?? 0,
        eventStatRoot: Buffer.from(val.eventStatRoot ?? []).toString("hex"),
        rootAccount: rootPda.toBase58(),
        rootAccountUrl: explorerAccount(rootPda.toBase58()),
      };
    } catch {
      proof = { error: "proof re-fetch unavailable" };
    }
  }

  return jsonResponse({
    card: {
      marketId: Number(marketId),
      question: card.question,
      statKey: card.statKey,
      threshold: card.threshold,
      status: card.status,
      deadlineTs: Number(card.deadlineTs),
      createdTs: Number(card.createdTs),
      settledProofTs: card.settledProofTs ? Number(card.settledProofTs) : null,
    },
    fixture: fixture
      ? { p1: fixture.participant1, p2: fixture.participant2, simulated: fixture.simulated }
      : null,
    onChain: account
      ? {
          address: marketPda(marketId).toBase58(),
          addressUrl: explorerAccount(marketPda(marketId).toBase58()),
          status: Object.keys(account.status)[0],
          yesCount: account.yesCount,
          noCount: account.noCount,
          yesStaked: Number(account.yesStaked),
          noStaked: Number(account.noStaked),
          settledProofTs: Number(account.settledProofTs),
        }
      : null,
    links: {
      createTx: card.createSig ? explorerTx(card.createSig) : null,
      settleTx: card.settleSig ? explorerTx(card.settleSig) : null,
      oracleProgram: explorerAccount(config.txoracleProgramId),
    },
    proof,
  });
}
