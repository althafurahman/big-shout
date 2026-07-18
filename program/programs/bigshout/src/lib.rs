//! BigShout — big calls, on the record.
//!
//! Swipe-to-predict micro-markets over live TxLINE World Cup stats. Calls
//! are sealed on-chain with the odds taken, before the outcome is known,
//! and settled by proof: this program CPIs into the TxLINE oracle, which
//! verifies a Merkle stat proof against its Solana-anchored daily scores
//! root. Points are free and non-cashable — the chain is the substrate for
//! provable bragging rights, not a wager.

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

// Generates CPI bindings for the TxLINE oracle program from idls/txoracle.json.
declare_program!(txoracle);

declare_id!("DanMuZ6VfwEmhn2rj5hiXVhQXNpNv7ornBRNnjaia9oH");

#[program]
pub mod bigshout {
    use super::*;

    pub fn init_config(ctx: Context<InitConfig>) -> Result<()> {
        instructions::init_config::handle_init_config(ctx)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_market(
        ctx: Context<CreateMarket>,
        market_id: u64,
        fixture_id: i64,
        stat_key: u32,
        threshold: i32,
        deadline_ts: i64,
        yes_odds_bps: u32,
        no_odds_bps: u32,
    ) -> Result<()> {
        instructions::create_market::handle_create_market(
            ctx,
            market_id,
            fixture_id,
            stat_key,
            threshold,
            deadline_ts,
            yes_odds_bps,
            no_odds_bps,
        )
    }

    pub fn update_odds(ctx: Context<UpdateOdds>, yes_odds_bps: u32, no_odds_bps: u32) -> Result<()> {
        instructions::update_odds::handle_update_odds(ctx, yes_odds_bps, no_odds_bps)
    }

    pub fn predict(ctx: Context<Predict>, side: bool, amount: u64) -> Result<()> {
        instructions::predict::handle_predict(ctx, side, amount)
    }

    pub fn settle_proven(
        ctx: Context<SettleProven>,
        payload: crate::txoracle::types::StatValidationInput,
    ) -> Result<()> {
        instructions::settle_proven::handle_settle_proven(ctx, payload)
    }

    pub fn settle_expired(ctx: Context<SettleExpired>) -> Result<()> {
        instructions::settle_expired::handle_settle_expired(ctx)
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        instructions::claim::handle_claim(ctx)
    }
}
