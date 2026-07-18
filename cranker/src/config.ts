import "dotenv/config";

const NETWORK = (process.env.TX_NETWORK ?? "devnet") as "devnet" | "mainnet";

// One config object per network — the docs name config mixing as the top
// cause of activation failure, so everything derives from NETWORK here.
const NETWORKS = {
  devnet: {
    apiOrigin: "https://txline-dev.txodds.com",
    rpcUrl: "https://api.devnet.solana.com",
    txoracleProgramId: "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
    txlTokenMint: "4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG",
  },
  mainnet: {
    apiOrigin: "https://txline.txodds.com",
    rpcUrl: "https://api.mainnet-beta.solana.com",
    txoracleProgramId: "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA",
    txlTokenMint: "Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL",
  },
} as const;

const net = NETWORKS[NETWORK];

export const config = {
  network: NETWORK,
  apiBase: `${net.apiOrigin}/api`,
  apiOrigin: net.apiOrigin,
  jwtUrl: `${net.apiOrigin}/auth/guest/start`,
  rpcUrl: process.env.RPC_URL ?? net.rpcUrl,
  txoracleProgramId: net.txoracleProgramId,
  txlTokenMint: net.txlTokenMint,
  walletPath: process.env.SERVICE_WALLET ?? "./_keys/service-wallet.json",
  txApiToken: process.env.TX_API_TOKEN ?? "",
  txJwt: process.env.TX_JWT ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  /** World Cup competition id per TxODDS examples. */
  competitionId: Number(process.env.COMPETITION_ID ?? 72),
};

/** TxLINE stat keys: `period_prefix + base_key`. Base 1/2 = P1/P2 goals,
 *  3/4 = yellows, 5/6 = reds, 7/8 = corners. Prefix 0 = whole match. */
export const BASE_KEYS = {
  goals: [1, 2],
  yellows: [3, 4],
  reds: [5, 6],
  corners: [7, 8],
} as const;

export const statKey = (base: number, periodPrefix = 0) => periodPrefix + base;
