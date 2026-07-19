# BigShout — Technical Documentation

**Big calls, on the record.** Swipe-to-predict micro-markets on live World Cup moments —
sealed on Solana before the outcome, settled by TxODDS' own on-chain oracle, provable
forever.

| | |
|---|---|
| Live app | **https://big-shout.vercel.app** (instantly playable, no account needed) |
| Track | Consumer & Fan Experiences |
| Network | Solana devnet |
| BigShout program | `DanMuZ6VfwEmhn2rj5hiXVhQXNpNv7ornBRNnjaia9oH` |
| TxODDS oracle (TxLINE devnet) | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` |
| Example YES settlement (real Merkle proof) | [`myTPMf…J9cmw`](https://explorer.solana.com/tx/myTPMfcwrZipkEbszVjnPMY16JRg1ZV3bUnRgryqSJjYSi1u2zQfnsxuVn83mVAccDfp8D2FKTFky8VrxYJ9cmw?cluster=devnet) · [public verify page](https://big-shout.vercel.app/verify/1784419170821003) |
| Example NO settlement (expiry after grace) | [`QYF7H3…fkmH`](https://explorer.solana.com/tx/QYF7H39aU3HTheE76eN3YAKuCXsrRdB3avkCypZKqgktBvmbzA73SSkjdKUxTaim5GmDpABoNWLDUjRysfmfkmH?cluster=devnet) |
| API feedback (submission requirement) | [`docs/txline-api-feedback.md`](txline-api-feedback.md) |

---

## 1. Core idea

Every fan says *"I called it."* Nobody can prove it — group chats are dead for 85 minutes,
then flooded with retroactive genius the moment a goal lands. The alternatives are a real
sportsbook (deposits, KYC, real losses) or a free prediction app whose scoring you simply
have to trust.

BigShout is the third option: **gamified micro-predictions on live moments, played with
friends, with cryptographically unfakeable results.**

1. A real event in TxLINE's live stream (a corner, a shot on target, a dangerous free
   kick, a VAR check) fires a **card**: *"Corner to England — do they score in the next
   10 minutes?"*
2. The fan stakes free daily points and swipes. The call is **sealed in a Solana account**
   with a timestamp and the exact odds taken — before the outcome exists.
3. The moment the stat lands, our engine fetches a **Merkle proof from TxLINE** and our
   program **CPIs into TxODDS' on-chain oracle** (`validate_stat_v2`), which verifies the
   proof against the daily root TxODDS already published on-chain. Verified → paid at the
   locked odds, in seconds, with no human in the loop.
4. Wins become **receipts** — shareable cards with the question, the call, the lock time,
   the odds, and a public verify link. **Match rooms** put groups of friends on the same
   cards with a live session leaderboard.

The trust model is stated honestly: the operator is a **trusted market-maker** (it prices
cards) but an **untrusted settler** — settlement and claims are permissionless, and the
operator cannot decide outcomes, delay payouts, or fake results. The public `/verify` page
exists so we never have to say "trust us."

## 2. System architecture

```
                   ┌─────────────────────────────────┐
   TxLINE API      │ cranker (autonomous engine)     │        Solana devnet
  ┌─────────────┐  │ · discovers fixtures (15 min)   │  ┌───────────────────────┐
  │ fixtures    │─▶│ · one SSE scores stream         │─▶│ bigshout program      │
  │ scores SSE  │─▶│ · fires cards off real events   │  │ Config · Market ·     │
  │ odds        │─▶│ · drifts odds on open cards     │  │ Position · Player     │
  │ historical  │─▶│ · settles: proof YES/expiry NO  │  │        │ CPI          │
  │ proofs      │─▶│ · sweeps claims, indexes chain  │  │  ┌─────▼───────────┐  │
  └─────────────┘  │ · replay harness (judge demo)   │  │  │ TxODDS oracle   │  │
        ▲          └──────────────┬──────────────────┘  │  │ validate_stat_v2│  │
        │                         │ Neon Postgres       │  │ vs daily Merkle │  │
        │          ┌──────────────▼──────────────────┐  │  │ roots           │  │
        └──────────│ web (Next.js, Vercel)           │  │  └─────────────────┘  │
   practice mode,  │ · swipe UX, custodial wallets   │◀─┤                       │
   verify proofs   │ · rooms/receipts/profiles/board │  │  (live reads for      │
                   │ · predict tx: user key signs,   │─▶│   the verify page)    │
                   │   service wallet pays fees      │  └───────────────────────┘
                   └─────────────────────────────────┘
```

**Deployment:** web on Vercel (serverless), shared state in Neon Postgres, the cranker and
a bot-crowd runner as `systemd` services on an always-on VM (units and a two-command
deploy procedure in [`ops/`](../ops/README.md)). A Postgres advisory lock guarantees only
one live cranker can ever run — a duplicate exits immediately, so restarts and host
migrations are race-free.

## 3. The on-chain program (Anchor)

Seven instructions over four account types. Positions **persist forever** — the account
*is* the receipt.

**Accounts**

| Account | Purpose | Key fields |
|---|---|---|
| `Config` | one-time; records the operator | `admin` |
| `Market` | one card: "will `stat_key` exceed `threshold` before `deadline_ts`?" | `market_id, fixture_id, stat_key, threshold, deadline_ts, yes/no_odds_bps, status(Open/YesWon/NoWon), yes/no_count, yes/no_staked, settled_proof_ts` |
| `Position` | one sealed call; the permanent receipt | `market, user, side, amount, odds_bps (snapshotted at lock), locked_ts, claimed, won` |
| `Player` | points + reputation | `points, last_refill_ts, streak, best_streak, correct, total` |

**Instructions**

| Instruction | Access | What it does |
|---|---|---|
| `init_config` | one-time | first caller becomes operator; role can never be reassigned |
| `create_market` | operator only | prices and opens a card (odds sanity-checked; deadline must be future) |
| `update_odds` | operator only | live odds drift; existing positions keep their locked odds |
| `predict` | user + fee-payer | tops up the daily allowance (UTC-day floor of 1,000 points), debits stake, snapshots the chosen side's odds, seals the Position (`init` → one call per card, structurally) |
| `settle_proven` | **permissionless** | verifies a TxLINE Merkle proof via CPI into `validate_stat_v2`; YES wins |
| `settle_expired` | **permissionless** | deadline + 180 s on-chain grace passed unproven; NO wins |
| `claim` | **permissionless crank** | credits the position's own player at locked odds; updates streak/reputation |

**Settlement soundness — the checks that make receipts unfakeable**

- Proof record timestamp **≤ market deadline** — a goal after the window can't settle a
  missed call.
- The daily-roots account must be **the PDA for the proof's own epoch-day** — no cross-day
  replay.
- The proof must contain **exactly the market's stat key** — no cross-market replay.
- A Merkle proof can show a stat crossed a threshold, never that it didn't — so **NO
  settles by expiry**, gated by an **on-chain 180-second grace period** so an expiry racer
  cannot flip a market while the winning proof is still propagating through the delayed
  feed.
- Double-settle and double-claim are program errors; a second `init_config` cannot steal
  the operator role; non-operator `create_market` is rejected (otherwise a player could
  price their own bet and farm the leaderboard).

**Custody & gas UX:** users get server-side custodial wallets (AES-256-GCM at rest),
created invisibly at signup — two form fields, no seed phrase, no gas. Predict
transactions are co-signed: the user's key signs as identity, the operator's service
wallet pays fees and rent. Points are a `u64` on the Player PDA — free, non-cashable,
non-transferable by construction.

## 4. TxLINE integration (the data spine)

**Activation (sign up through Solana):** guest JWT → on-chain
`subscribe(serviceLevel 1, 4 weeks)` free World Cup bundle → sign
`"${txSig}:${leagues}:${jwt}"` → `POST /api/token/activate`. One config object per
network; credentials live server-side only.

**Endpoints used**

| TxLINE endpoint | Used for |
|---|---|
| `POST /auth/guest/start` | guest JWT (auto-renewed on 401) |
| Txoracle `subscribe` (on-chain) | free-tier subscription — the Solana sign-up |
| `POST /api/token/activate` | API token |
| `GET /api/fixtures/snapshot` | fixture discovery (every 15 min) |
| `GET /api/scores/stream` (SSE) | **the heartbeat**: card triggers, ticker, pressure meter, settlement watch |
| `GET /api/scores/snapshot/{id}` | state backfill for fixtures that started before the engine |
| `GET /api/scores/updates/{id}` | catch-up after restarts |
| `GET /api/scores/historical/{id}` | practice mode + the replay harness |
| `GET /api/odds/snapshot/{id}` · `GET /api/odds/stream` | StablePrice strength priors feeding card pricing |
| `GET /api/scores/stat-validation` | **Merkle proofs → on-chain settlement** (the differentiator) |
| Txoracle `validate_stat_v2` (CPI) | the on-chain settlement primitive |

**Triggers ≠ settlements.** The stream's rich events (`shot` outcomes, `free_kick` danger
levels, `var`, `penalty`, substitutions) fire cards and feed the ticker/pressure meter —
but every settlement resolves to a provable stat key (`period_prefix + base_key`; goals,
yellows, reds, corners per team). *"Will this corner become a goal?"* is triggered by the
corner and settled as `team goals > value at card creation`.

**Pricing:** cards open from per-trigger priors, tilted by StablePrice-derived team
strength, boosted by live pressure events, and decayed as the window runs down — odds
drift on-chain (visible in the UI as "was 4.20") and each position pays at the odds it
locked. Fixed odds, not pari-mutuel: points are free, so pool-splitting would routinely
pay 50-point stakes 52 points; locked fixed odds keep wins meaningful, and non-cashable
points mean there is no solvency constraint.

## 5. Real-time pipeline (criterion: real-time responsiveness)

One unfiltered SSE connection drives everything. Per record, the engine: updates score
state → classifies events into the ticker with pressure weights → fires at most one card
(cooldown- and family-gated) → checks every open market for a provable crossing and races
to fetch the proof (TxLINE proofs commit in batches, so it probes recent sequence numbers
backwards) → settles → sweeps claims so results land with **zero user action**. Odds
re-price every 45 s (only >2 % moves hit the chain); an indexer mirrors all
Market/Position/Player accounts into Postgres every 45 s. The UI polls at 3–5 s: score,
odds flash, drain bar, consensus counts, and room session boards all move while the page
is open.

## 6. The social layer as read-models (criterion: originality)

Consensus reveals, reputation-by-stat-type, the accuracy-ranked leaderboard, public
profiles, receipts, and match-room session boards are **all views over on-chain Position
and Player accounts** — no extra on-chain state, no trusted scorekeeper. The chain is the
substrate; the social layer is queries over it. That is why every brag on a profile is
independently checkable, and why the feature surface is broad while the program stays
small.

**Match rooms:** one tap creates a room on a live match; friends join by link (sign-in
returns them to the room), everyone plays the same cards, and a session leaderboard
re-ranks live as calls settle. Rooms persist after full time as the match's permanent
history ("final standings"); owners can delete a room (the on-chain calls remain). The
[showcase room](https://big-shout.vercel.app/duel/showdown) is live.

**Public verification for non-technical fans:** every settled card has a `/verify` page —
three plain-language steps (locked first → the sport's own data decided → the payout
followed the proof), with the full detail behind a toggle: the live-re-fetched Merkle
proof (stat leaf → fixture sub-tree → daily batch root), the on-chain root account, and
explorer links for the creation and settlement transactions.

## 7. Playable when nothing is live (criterion: completeness)

- **Practice mode** — real moments from finished matches replayed as pre-scored cards,
  with a session score that rewards bold calls, streaks, skips, a per-card result trail,
  and an end-of-session performance sparkline. Free, unlimited, off-chain.
- **Replay harness (judge-facing)** — the deployed site's *Demo replay* button queues any
  finished match through the **exact live pipeline**: same card engine, same odds drift,
  same Merkle proofs, same on-chain settlement (historical daily roots persist on devnet,
  so replay settlements are real oracle-verified transactions, not mocks). Replayed
  matches are labelled **Replay** in the UI. This is how the product stays demonstrable
  after the tournament ends.
- **Seeded crowd** — 24 fan accounts with custodial wallets are played by a bot runner
  through the real `predict` instruction. Their leaderboard records (e.g. 80 % over 9
  calls) emerged from genuine on-chain settlements; nothing is fabricated, and every one
  of their receipts verifies.

## 8. Testing

`cargo test` runs LiteSVM integration tests against the **real TxODDS oracle binary**
dumped from devnet at its live program id — plus a **real Merkle proof** (England 1–2
Argentina, seq 962) and the **real daily-root account** for that epoch day, so the
end-to-end YES test performs a genuine oracle verification. Covered: proof-before-deadline
→ YES; expiry-after-grace → NO (and too-early expiry rejected); wrong-fixture,
wrong-stat-key, wrong-day-root and late proofs rejected; cryptographically fake proof
rejected *by the oracle* with no state change; non-operator market creation/repricing
rejected; double-settle, double-claim, one-position-per-card; daily allowance and odds
snapshotting.

## 9. Business model & legal shape (criterion: commercial path)

1. **The sentiment flywheel** — every consensus reveal is a data point: real-time crowd
   sentiment per fixture, per event. TxODDS' existing customers are trading desks; the
   dataset runs live on screen in this demo, not in a roadmap.
2. **B2B white-label** — license the engagement layer to sportsbooks, clubs and
   broadcasters who already buy TxODDS data.
3. **Sponsored prize pools** — brands fund fixed tournament pots.
4. **Regulated referral** — hand warmed-up users to licensed operators where lawful; we
   never take a wager.
5. **Cosmetics** — premium receipt/profile designs. Never points.

**Legal cleanliness:** gambling requires consideration + chance + prize. Points are
**never purchasable** (no consideration); prize pots are **fixed and sponsor-funded**,
never from stakes (fixed odds also means there is no pool to redistribute). Sybil defense
is the metric, not an identity system: **prize rank is accuracy over a minimum volume**,
so splitting a bankroll across free accounts buys nothing.

## 10. Judging-criteria summary

| Criterion | Where BigShout answers it |
|---|---|
| **Fan Accessibility & UX** | Play before signup (swipe in ~5 s, guest mode clearly labelled); two-field signup; custodial wallets — no seed phrase/gas/crypto vocabulary; app-style mobile UI (bottom nav, pitch-hero match screen, flags); skip + drain-bar countdowns |
| **Real-Time Responsiveness** | Cards fire off live SSE events, not timers; on-chain odds drift visible in-card; pressure meter from event density; live consensus; session boards re-rank as settlements land; settlement seconds after the proof |
| **Originality & Value** | Unfakeable bragging rights: receipts + lock timestamps + public verify; match rooms as a new watch-together model; built **on** TxODDS' oracle primitive (zero Merkle code of our own), not around it |
| **Commercial Path** | Live sentiment dataset demonstrated on screen; white-label, sponsored pots, referral, cosmetics; licence-free by construction |
| **Completeness & Execution** | Full loop live on devnet (lock → proof-settle → claim → receipt → verify); practice + judge-triggered replays; tests against the real oracle binary with real proofs; deployed web + always-on engine + seeded crowd |

## 11. Repository map

```
program/   Anchor workspace — the bigshout program, oracle IDL, LiteSVM tests (real binary + real proof fixtures)
cranker/   the engine: TxLINE client (SSE + proof), card/odds engines, settlement, claims, indexer, replay harness, bots
web/       Next.js app: swipe UX, auth + custodial wallets, rooms, receipts, profiles, leaderboard, practice, verify
ops/       systemd units + deploy procedure for the always-on engine
docs/      this document · demo video script · TxLINE API feedback (submission requirement)
```
