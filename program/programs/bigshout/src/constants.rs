//! TxLINE soccer-feed stat-key encoding: `period_prefix + base_key`.
//! Prefixes: 0=total, 1000=H1, 2000=HT, 3000=H2, 4000/5000=ET1/ET2,
//! 6000=penalties, 7000=ET total. Base keys: 1/2=P1/P2 goals,
//! 3/4=yellow cards, 5/6=red cards, 7/8=corners.

pub const CONFIG_SEED: &[u8] = b"config";
pub const MARKET_SEED: &[u8] = b"market";
pub const POSITION_SEED: &[u8] = b"position";
pub const PLAYER_SEED: &[u8] = b"player";

/// TxLINE publishes one scores Merkle root per UTC day, keyed by epoch day.
pub const DAILY_SCORES_ROOTS_SEED: &[u8] = b"daily_scores_roots";

/// TxLINE timestamps are Unix milliseconds; roots are bucketed per UTC day.
pub const MS_PER_DAY: i64 = 86_400_000;
pub const SECS_PER_DAY: i64 = 86_400;

/// Free points topped up on a player's first prediction of each UTC day.
/// Non-cashable by construction: points exist only as a u64 on the Player
/// PDA — there is no mint, no transfer, and no purchase path.
pub const DAILY_ALLOWANCE: u64 = 1_000;

/// NO settlement (deadline expiry) is only accepted this many seconds after
/// the market deadline. The devnet feed runs 60s delayed and proofs publish
/// in batches, so a YES proof for an event just inside the deadline can
/// arrive well after wall-clock deadline. Without this gate an expiry racer
/// could flip a market NO while the winning proof is still in flight.
pub const EXPIRY_GRACE_SECS: i64 = 180;

/// Odds are decimal odds in basis points: 25_000 = 2.5x payout on stake.
pub const MIN_ODDS_BPS: u32 = 10_000; // 1.00x — returns the stake
pub const MAX_ODDS_BPS: u32 = 1_000_000; // 100x
pub const ODDS_DENOMINATOR: u64 = 10_000;
