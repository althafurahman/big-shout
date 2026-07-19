# 📣 BigShout

**Big calls, on the record. Sealed before the whistle, settled by the sport's own data, provable forever.**

**🌐 Live: [big-shout.vercel.app](https://big-shout.vercel.app)** · Built for the TxODDS × Solana World Cup Hackathon — **Consumer & Fan Experiences** track · devnet

Judges: open the app and swipe — no account needed. No live match on? Hit **[▶ Demo replay](https://big-shout.vercel.app/replay)** and a real finished World Cup match plays through the full live pipeline, settling on devnet with real Merkle proofs. Example receipts already on-chain: an [oracle-proven YES settlement](https://big-shout.vercel.app/verify/1784419170821003) and a [head-to-head duel](https://big-shout.vercel.app/duel/showdown).

Every fan says *"I called it."* Nobody can prove it — group chats are full of retroactive
geniuses. BigShout makes football takes **unfakeable**: swipe to predict live in-play moments,
your call locks on-chain with a timestamp and the odds you took, and TxODDS' own oracle settles
it with a Merkle proof seconds after the stat lands. *"I called it"* becomes something anyone
can check.

No wallet. No seed phrase. No gas. No deposit, no KYC, no crypto vocabulary anywhere in the UI.
Free daily points, and the blockchain does the only job a fan actually needs it for:
**making the receipts real.**

## The loop

1. **Land & swipe** — a live card is already waiting on the landing page. No account wall.
2. **A moment happens** — a corner, a shot on target, a VAR check. A card fires off the live
   TxLINE score stream: *"Corner to France — do they score in the next 10 minutes?"*
3. **Odds drift while you decide** — priced from a live model, updated on-chain as the window
   runs down and pressure builds. Was 4.2, now 2.8.
4. **The lock** — pick a stake, swipe. Your call is sealed in a Solana account with the
   timestamp and the exact odds you took — *before the outcome is known*.
5. **The crowd reveals** — *"You said YES. 71% of fans disagree."*
6. **Proof settles it** — the stat lands in TxLINE's feed → our cranker fetches the Merkle
   proof → our program CPIs into TxODDS' `validate_stat_v2`, which verifies the proof against
   the daily root TxODDS already published on-chain. YES pays at your locked odds. If the
   window expires unproven, NO pays.
7. **The receipt** — a shareable card with your call, the lock time, the odds, the outcome and
   a public verify link. Long shots render visibly rarer. Built to be screenshotted into the
   group chat that doubted you.

## Why this isn't just another prediction game

- **Not repackaging a feed.** The product isn't the data — it's *provable settlement*. Our
  program implements no Merkle logic at all: it CPIs into TxODDS' on-chain oracle primitive
  and acts on the boolean. We built **on** their oracle rather than around it.
- **A new fan interaction model: unfakeable bragging rights.** The receipt, the lock
  timestamp, the public profile, and the head-to-head duel make a fan's opinions permanent and
  checkable — something no sports app offers today, because none of them can.
- **Honest trust split.** We are a *trusted market-maker* (the operator prices cards) and an
  *untrusted settler* (anyone with a valid proof can settle; the operator cannot decide
  outcomes, delay a payout, or fake a result). The `/verify` page exists so we never have to
  say "trust us."

## Architecture

```
                   ┌─────────────────────────────────┐
   TxLINE API      │ cranker (autonomous)            │        Solana devnet
  ┌─────────────┐  │ · discovers fixtures            │  ┌───────────────────────┐
  │ fixtures    │─▶│ · one SSE scores stream         │─▶│ bigshout program      │
  │ scores SSE  │─▶│ · fires cards off real events   │  │ Config·Market·        │
  │ odds        │─▶│ · drifts odds on open cards     │  │ Position·Player       │
  │ proofs      │─▶│ · settles: proof YES/expiry NO  │  │        │ CPI          │
  └─────────────┘  │ · sweeps claims, indexes chain  │  │  ┌─────▼───────────┐  │
        ▲          │ · replay harness (judge demo)   │  │  │ TxODDS oracle   │  │
        │          └──────────────┬──────────────────┘  │  │ validate_stat_v2│  │
        │                         │ Postgres            │  │ vs daily Merkle │  │
        │          ┌──────────────▼──────────────────┐  │  │ roots           │  │
        └──────────│ web (Next.js)                   │  │  └─────────────────┘  │
   practice mode,  │ · swipe UX, custodial wallets   │◀─┤                       │
   verify proofs   │ · receipts/profiles/duels/board │  │  (reads for verify)   │
                   │ · predict tx: user key signs,   │─▶│                       │
                   │   service wallet pays fees      │  └───────────────────────┘
                   └─────────────────────────────────┘
```

- **`program/`** — Anchor program, 7 instructions: `init_config`, `create_market`,
  `update_odds` (operator-gated), `predict`, `settle_proven` (permissionless, CPI into the
  oracle), `settle_expired` (permissionless, after an on-chain grace period), `claim`
  (permissionless crank — results land with zero user action). Positions persist forever:
  **the account is the receipt.**
- **`cranker/`** — autonomous TypeScript service. Triggers ≠ settlements: rich stream events
  (shots, VAR, penalties, free kicks) fire cards and feed the ticker/pressure meter, but every
  settlement resolves to a provable stat key (goals/cards/corners per team & period).
- **`web/`** — Next.js. Username + password; a custodial wallet is created server-side and
  never mentioned. Consensus, reputation, leaderboard, profiles, receipts and duels are all
  **read-models over on-chain Position/Player accounts** — the chain is the substrate, the
  social layer is views over it.

### Settlement soundness (the details that matter)

- Proof `ts` must be **≤ the market deadline** — a goal scored after the window can't settle
  a missed call.
- The daily-roots account must be **the PDA for the proof's own epoch-day** — no cross-day
  replay.
- The proof must contain **exactly the market's stat key** — no cross-market replay.
- A YES proof shows a stat crossed a threshold; a proof can never show it *didn't*. So NO
  settles by expiry — guarded by an **on-chain grace period** (deadline + 180s) so an expiry
  racer can't flip a market while the winning proof is still propagating through the delayed
  feed.
- Double-settle and double-claim are program errors, not conventions.

### Tests — against the real oracle, with a real proof

`cargo test` loads the **real TxODDS oracle binary** (dumped from devnet) into LiteSVM at its
live program id, plus a **real Merkle proof** (England 1–2 Argentina, seq 962) and the **real
daily-root account** for that epoch day. The end-to-end test performs a genuine oracle
verification — not a mock — then exercises: expiry-NO after grace, mismatched/late/fake proof
rejections, non-admin market creation, double-claim, the daily allowance, and odds
snapshotting.

## The replay harness (how to demo after the final whistle)

Matches end before judging begins, so the deployed app has a **judge-triggerable replay**: pick
a real finished match and the cranker pipes its recorded TxLINE history through the *same live
pipeline* — same card triggers, same odds engine, same Merkle proofs, same on-chain
settlement on devnet (historical roots persist, so replay settlements are real oracle-verified
transactions). Matches replayed this way are labelled **"simulated live"** in the UI.

## TxLINE endpoints used

| Endpoint | Use |
|---|---|
| `POST /auth/guest/start` | guest JWT |
| Txoracle `subscribe` (on-chain) | free World Cup tier subscription |
| `POST /api/token/activate` | API token |
| `GET /api/fixtures/snapshot` | fixture discovery |
| `GET /api/scores/snapshot/{id}` · `/updates/{id}` | score state + catch-up |
| `GET /api/scores/stream` (SSE) | **cards, ticker, pressure meter** |
| `GET /api/scores/historical/{id}` | **practice mode + replay harness** |
| `GET /api/scores/stat-validation` | **Merkle proofs → on-chain settlement** |
| `GET /api/odds/snapshot/{id}` · `/api/odds/stream` | strength priors + odds drift |
| Txoracle `validate_stat_v2` (CPI) | the settlement primitive |

## Legal shape (said out loud, on purpose)

Gambling needs consideration + chance + prize. We have chance and prize, so everything rests on
**no consideration**: points are never purchasable — not directly, not indirectly. And any
prize pot is **fixed and sponsor-funded**, never funded from stakes (fixed odds means there's
no pool to redistribute anyway). Sybil defense is the metric, not an identity system:
**prize rank is accuracy over a minimum volume**, so farming accounts buys nothing. The free
daily allowance is the fairness cap that keeps a real-prize contest clean.

## Running it

Prereqs: Node 20+, Rust + Solana CLI + Anchor 1.1.2, Docker (for local Postgres), a devnet
wallet with a little SOL.

```bash
# 0. Postgres
docker run -d --name bigshout-pg -e POSTGRES_PASSWORD=bigshout -e POSTGRES_DB=bigshout -p 5434:5432 postgres:16-alpine

# 1. program: build, test against the real oracle binary, deploy
cd program
anchor build
solana program dump 6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J \
  programs/bigshout/tests/fixtures/txoracle_devnet.so --url devnet
cargo test --manifest-path programs/bigshout/Cargo.toml
anchor deploy --provider.cluster devnet

# 2. cranker: fresh TxLINE activation (creates the service wallet), one-time config
cd ../cranker && npm i && cp .env.example .env   # set DATABASE_URL
npm run activate        # wallet + on-chain subscribe + API token -> .env
npm run init-config     # registers the service wallet as market authority
npm start               # live mode: streams, cards, settlement, indexer

# 3. web
cd ../web && npm i && cp ../cranker/.env .env    # + SESSION_SECRET, WALLET_KEY, SERVICE_WALLET_JSON
npx prisma db push && npm run dev                # http://localhost:3000

# 4. demo: seed fans, replay a real match through the live pipeline
cd web && npx tsx scripts/seed-users.ts
# then click "Run demo replay" in the app (or: cd cranker && npm run replay -- <fixtureId> 8)
cd cranker && npm run bots                       # seeded fans play the replay
```

## Deployed (Solana devnet)

| Component | Address |
|---|---|
| Web app | [big-shout.vercel.app](https://big-shout.vercel.app) (Vercel + Neon Postgres) |
| BigShout program | `DanMuZ6VfwEmhn2rj5hiXVhQXNpNv7ornBRNnjaia9oH` |
| TxODDS oracle (TxLINE devnet) | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` |
| Service wallet (operator) | `7Ae1QCEmcuJjGjTKeVayAmexsTE8Yc5qoSej7SXqo5ow` |

Example on-chain settlements from the replay harness (real Merkle proofs, devnet):
[YES via `validate_stat_v2` CPI](https://explorer.solana.com/tx/myTPMfcwrZipkEbszVjnPMY16JRg1ZV3bUnRgryqSJjYSi1u2zQfnsxuVn83mVAccDfp8D2FKTFky8VrxYJ9cmw?cluster=devnet) ·
[NO via expiry after grace](https://explorer.solana.com/tx/QYF7H39aU3HTheE76eN3YAKuCXsrRdB3avkCypZKqgktBvmbzA73SSkjdKUxTaim5GmDpABoNWLDUjRysfmfkmH?cluster=devnet)

## Monetization path

1. **B2B white-label** — license the engagement layer to sportsbooks, clubs and broadcasters
   who already buy TxODDS data.
2. **The sentiment flywheel** — thousands of fans predicting live *is* a dataset: real-time
   crowd sentiment per fixture, per event. The consensus reveal demonstrates it running live
   in this very demo.
3. **Sponsored prize pools** — brands fund fixed tournament pots.
4. **Regulated referral** — hand warmed-up users to licensed operators where lawful; we never
   take a wager.
5. **Cosmetics** — premium receipt and profile designs. Never points.

## Docs

- [`docs/technical-documentation.md`](docs/technical-documentation.md) — full technical documentation
- [`docs/txline-api-feedback.md`](docs/txline-api-feedback.md) — running API feedback notes
- [`docs/demo-video.md`](docs/demo-video.md) — demo video script
- [`SETUP.md`](SETUP.md) — team setup

## License

MIT
