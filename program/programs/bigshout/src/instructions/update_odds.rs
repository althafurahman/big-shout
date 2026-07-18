use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::BigShoutError;
use crate::state::{Config, Market, MarketStatus};

/// Admin-only: live odds drift while a card is open. Existing positions are
/// unaffected — they snapshotted the odds they locked at.
#[derive(Accounts)]
pub struct UpdateOdds<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.admin == authority.key() @ BigShoutError::NotAdmin,
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub market: Account<'info, Market>,
}

pub fn handle_update_odds(
    ctx: Context<UpdateOdds>,
    yes_odds_bps: u32,
    no_odds_bps: u32,
) -> Result<()> {
    let market = &mut ctx.accounts.market;
    require!(market.status == MarketStatus::Open, BigShoutError::MarketNotOpen);
    for odds in [yes_odds_bps, no_odds_bps] {
        require!(
            (MIN_ODDS_BPS..=MAX_ODDS_BPS).contains(&odds),
            BigShoutError::OddsOutOfRange
        );
    }
    market.yes_odds_bps = yes_odds_bps;
    market.no_odds_bps = no_odds_bps;
    Ok(())
}
