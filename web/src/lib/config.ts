const NETWORK = (process.env.TX_NETWORK ?? "devnet") as "devnet" | "mainnet";

const NETWORKS = {
  devnet: {
    apiOrigin: "https://txline-dev.txodds.com",
    rpcUrl: "https://api.devnet.solana.com",
    txoracleProgramId: "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
    explorerCluster: "devnet",
  },
  mainnet: {
    apiOrigin: "https://txline.txodds.com",
    rpcUrl: "https://api.mainnet-beta.solana.com",
    txoracleProgramId: "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA",
    explorerCluster: "mainnet-beta",
  },
} as const;

const net = NETWORKS[NETWORK];

export const config = {
  network: NETWORK,
  apiBase: `${net.apiOrigin}/api`,
  jwtUrl: `${net.apiOrigin}/auth/guest/start`,
  rpcUrl: process.env.RPC_URL ?? net.rpcUrl,
  txoracleProgramId: net.txoracleProgramId,
  explorerCluster: net.explorerCluster,
  txApiToken: process.env.TX_API_TOKEN ?? "",
  competitionId: Number(process.env.COMPETITION_ID ?? 72),
};

export const DAILY_ALLOWANCE = 1000;

export function explorerTx(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=${config.explorerCluster}`;
}

export function explorerAccount(addr: string): string {
  return `https://explorer.solana.com/address/${addr}?cluster=${config.explorerCluster}`;
}
