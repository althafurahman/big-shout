# Demo video script (≤ 5:00)

The primary judged artifact. Screen-record the deployed app; voiceover per beat. Before
filming: run `seed-users.ts`, start a replay at 8×, and start the bots so every social
surface is alive. Film the replay's second half so settled cards already exist.

| # | Beat | Time | Shot | Say |
|---|---|---|---|---|
| 1 | The problem | 0:00–0:30 | Group-chat mockup: "told you Mbappé would score" sent *after* the goal | Every fan says "I called it." Nobody can prove it. Football opinions are worthless the second the whistle blows — because there's no record. BigShout puts them on the record. |
| 2 | Land & swipe | 0:30–0:50 | Fresh incognito browser → landing page → swipe within 5 seconds | No account, no wall, no wallet. You're playing before you've signed anything. |
| 3 | The live card | 0:50–1:30 | Match screen: ticker scrolling, pressure meter shifting, card fires off a corner; odds visibly drift ("was 4.2 → 2.8"); pick stake; swipe | Cards fire off the real TxLINE event stream. The odds move while you hesitate. When you swipe, your call is sealed on Solana with the timestamp and the exact price you took — before the outcome exists. |
| 4 | Consensus reveal | 1:30–1:50 | Lock panel: "You said YES. 71% of fans disagree." | The moment you lock, you see the crowd. This isn't just an emotional payoff — hold that thought for the business slide. |
| 5 | **Settlement (money shot)** | 1:50–2:50 | Goal arrives in replay → settled card flips YES → open `/verify`: Merkle proof panel, root account on explorer, settle tx with the CPI into TxODDS' oracle | Sixty seconds ago that was an opinion. Then the stat landed in TxODDS' feed, our cranker fetched the Merkle proof, and our program called *their* on-chain oracle — the same company whose data settles real sportsbooks. No committee, no dispute window, no "trust us." We wrote zero Merkle code: we built on their primitive. This page is why nobody can fake a BigShout receipt — including us. |
| 6 | The receipt | 2:50–3:20 | Receipt card (a rare long-shot one) → share → open link in the incognito window | This is the product: proof, styled to be screenshotted into the group chat that doubted you. Long shots render rarer. Every shared receipt is a landing page. |
| 7 | Social proof surfaces | 3:20–4:00 | Profile (reputation: "78% on corners"), duel side-by-side, leaderboard | Your profile is your provable history — what kind of fan you actually are. Duels: same match, same cards, side by side. The leaderboard flexes points but **ranks accuracy over a minimum volume** — so farming free accounts buys nothing. And points are never purchasable; prize pots are fixed and sponsor-funded, never from stakes. No consideration, no wager, no licence needed. |
| 8 | How it's built | 4:00–4:40 | Architecture slide + endpoints list + test output (real proof settling in LiteSVM) | One SSE scores stream drives cards, ticker and pressure. Historical replay drives practice mode and this very demo — labelled "simulated live" because judging happens after the final whistle; on mainnet this runs at real-time service level 12, a service-level parameter, not an architectural limit. Our tests load TxODDS' real oracle binary and settle with a real England–Argentina proof. |
| 9 | Business | 4:40–5:00 | Consensus bar again + one slide | That crowd data you saw at every lock? Thousands of fans predicting live is a real-time sentiment feed per fixture, per event — TxODDS' trading-desk customers buy exactly this. Plus white-label to sportsbooks and broadcasters, sponsored pots, regulated referral. BigShout: big calls, on the record. |

Checklist before filming:
- [ ] 20+ seeded users with varied records (bots run through at least one full replay)
- [ ] at least one legendary-tier winning receipt to show
- [ ] a duel with both chairs filled and different scores
- [ ] `/verify` for a YES-settled market (proof panel populated)
- [ ] incognito window ready for the guest-swipe and shared-receipt beats
