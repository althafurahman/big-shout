# Team setup

Fresh-machine setup per component. Everything is **devnet** — no real funds anywhere.

## 0. Clone & secrets

```bash
git clone git@github.com:althafurahman/big-shout.git && cd big-shout
```

| Secret | Used by | Notes |
|---|---|---|
| `cranker/_keys/service-wallet.json` | cranker, web (as env) | created by `npm run activate`; ask a teammate for the live one |
| `TX_API_TOKEN` / `TX_JWT` | cranker, web | written into `cranker/.env` by `npm run activate` |
| `WALLET_KEY` | web | 32-byte base64 (`openssl rand -base64 32`); encrypts custodial user wallets |
| `SESSION_SECRET` | web | any long random string |
| `DATABASE_URL` | cranker, web | local: `postgresql://postgres:bigshout@localhost:5434/bigshout` |
| `SERVICE_WALLET_JSON` | web | the service wallet secret key JSON array, as one env line |

## 1. Postgres (Docker)

```bash
docker run -d --name bigshout-pg -e POSTGRES_PASSWORD=bigshout -e POSTGRES_DB=bigshout \
  -p 5434:5432 postgres:16-alpine
cd web && npx prisma db push    # creates/updates the schema
```

## 2. Web (Node 20+)

```bash
cd web && npm i
# .env: DATABASE_URL, SESSION_SECRET, WALLET_KEY, SERVICE_WALLET_JSON, TX_NETWORK=devnet,
#       TX_API_TOKEN, TX_JWT
npm run dev   # http://localhost:3000
```

## 3. Cranker (Node 20+)

```bash
cd cranker && npm i && cp .env.example .env
npm run activate      # only on a fresh wallet; otherwise copy .env + _keys from a teammate
npm run init-config   # once per deployed program
npm start             # live mode
npm run replay -- 18241006 8   # replay England-Argentina at 8x
npm run bots          # seeded fans play open cards (needs cranker/_keys/bots.json)
```

## 4. Program (only if changing Rust)

Prereqs: Rust 1.89, Solana CLI 3.x, Anchor CLI 1.1.2.

```bash
cd program
anchor build
solana program dump 6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J \
  programs/bigshout/tests/fixtures/txoracle_devnet.so --url devnet
cargo test --manifest-path programs/bigshout/Cargo.toml
anchor deploy --provider.cluster devnet   # needs the upgrade-authority wallet
```

If the IDL changes, refresh the tracked copies consumers use:

```bash
cp target/idl/bigshout.json idls/bigshout.json
cp target/idl/bigshout.json ../web/src/lib/idl/bigshout.json
```

## Gotchas (learned the hard way)

- Devnet RPC reads lag writes by a few seconds — check at `finalized` before declaring a bug.
- TxLINE seqs start at 1; `/scores/stat-validation` 404s on records not yet in a committed
  proof batch — settlers must probe backwards through recent seqs.
- The SSE stream needs an explicit `Accept-Encoding: deflate` header or it stalls silently.
- The devnet oracle program id is `6pW64…yP2J` (baked into `program/idls/txoracle.json`).
  Never mix devnet/mainnet hosts, program ids, or RPC — one config object, one network.
- Airdrops on devnet rate-limit aggressively; https://faucet.solana.com with GitHub login
  gives 5 SOL/day when the CLI faucet refuses.
