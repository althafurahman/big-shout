use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::BigShoutError;
use crate::state::{Market, MarketStatus};

/// Permissionless NO settlement. A Merkle proof can show a stat crossed a
/// threshold, never that it didn't — so NO is proven by absence: the
/// deadline passed and nobody could settle YES. The grace period keeps an
/// expiry racer from flipping a market while the winning proof is still
/// propagating through the (delayed) feed and proof pipeline.
#[derive(Accounts)]
pub struct SettleExpired<'info> {
    pub settler: Signer<'info>,
    #[account(mut)]
    pub market: Account<'info, Market>,
}

pub fn handle_settle_expired(ctx: Context<SettleExpired>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let market = &mut ctx.accounts.market;

    require!(market.status == MarketStatus::Open, BigShoutError::MarketNotOpen);
    require!(
        now >= market.deadline_ts + EXPIRY_GRACE_SECS,
        BigShoutError::ExpiryTooEarly
    );

    market.status = MarketStatus::NoWon;
    Ok(())
}
