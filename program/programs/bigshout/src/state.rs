use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum MarketStatus {
    /// Accepting predictions until `deadline_ts`; awaiting settlement after.
    Open,
    /// The stat was proven on-chain before the deadline; YES positions won.
    YesWon,
    /// Deadline expired with nothing proven; NO positions won.
    NoWon,
}

/// One-time program config. The admin (the operator's service wallet) is the
/// only key that may create markets or move odds — the operator is a trusted
/// market-maker. Settlement is NOT restricted: any key with a valid TxLINE
/// proof (or an expired deadline) can settle, so the operator is an
/// untrusted settler.
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub bump: u8,
}

/// A binary fixed-odds micro-market over one provable TxLINE stat:
/// "will `stat_key` exceed `threshold` before `deadline_ts`?"
#[account]
#[derive(InitSpace)]
pub struct Market {
    /// Operator-assigned unique id; PDA seed. Card copy ("will this corner
    /// become a goal?") lives off-chain keyed by this id — on-chain only the
    /// provable predicate matters.
    pub market_id: u64,
    /// TxLINE fixture id this market observes.
    pub fixture_id: i64,
    /// TxLINE stat key (`period_prefix + base_key`) the proof must contain.
    pub stat_key: u32,
    /// YES wins when the oracle proves `stat value > threshold` in a record
    /// timestamped at/before `deadline_ts`.
    pub threshold: i32,
    pub created_ts: i64,
    /// Unix seconds. Predictions rejected at/after this time; a settlement
    /// proof's record timestamp must be at/before it.
    pub deadline_ts: i64,
    /// Current decimal odds in bps for each side. Snapshotted onto the
    /// Position at lock time — players win at the price they took.
    pub yes_odds_bps: u32,
    pub no_odds_bps: u32,
    pub status: MarketStatus,
    /// TxLINE record timestamp (ms) of the proof used to settle YES.
    pub settled_proof_ts: i64,
    /// Live consensus tallies, readable by anyone (the consensus reveal and
    /// the sentiment dataset are views over these).
    pub yes_count: u32,
    pub no_count: u32,
    pub yes_staked: u64,
    pub no_staked: u64,
    pub bump: u8,
}

/// One player's sealed call on one market. Persists forever after claim —
/// this account IS the receipt: what you said, when you locked it, at what
/// odds, and how it settled.
#[account]
#[derive(InitSpace)]
pub struct Position {
    pub market: Pubkey,
    /// The player's wallet (Player PDA authority), not the fee payer.
    pub user: Pubkey,
    /// true = YES, false = NO.
    pub side: bool,
    /// Points staked.
    pub amount: u64,
    /// Decimal odds (bps) snapshotted from the market at lock time.
    pub odds_bps: u32,
    /// Unix seconds when the call was sealed — before the outcome was known.
    pub locked_ts: i64,
    pub claimed: bool,
    /// Set at claim; lets indexers read outcomes without joining the market.
    pub won: bool,
    pub bump: u8,
}

/// Per-player points and reputation. Points are a plain u64: free,
/// non-cashable, non-transferable — a scorekeeping system, not a treasury.
#[account]
#[derive(InitSpace)]
pub struct Player {
    pub authority: Pubkey,
    pub points: u64,
    /// Start of the last UTC day the daily allowance was topped up.
    pub last_refill_ts: i64,
    pub streak: u16,
    pub best_streak: u16,
    pub correct: u32,
    pub total: u32,
    pub bump: u8,
}
