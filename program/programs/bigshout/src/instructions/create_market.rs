use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::BigShoutError;
use crate::state::{Config, Market, MarketStatus};

/// Admin-only: the operator prices markets (trusted market-maker). If anyone
/// could create markets they could also price their own bet — the point
/// leaderboard would be farmable.
#[derive(Accounts)]
#[instruction(market_id: u64)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.admin == authority.key() @ BigShoutError::NotAdmin,
    )]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = authority,
        space = 8 + Market::INIT_SPACE,
        seeds = [MARKET_SEED, &market_id.to_le_bytes()],
        bump,
    )]
    pub market: Account<'info, Market>,
    pub system_program: Program<'info, System>,
}

#[allow(clippy::too_many_arguments)]
pub fn handle_create_market(
    ctx: Context<CreateMarket>,
    market_id: u64,
    fixture_id: i64,
    stat_key: u32,
    threshold: i32,
    deadline_ts: i64,
    yes_odds_bps: u32,
    no_odds_bps: u32,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(deadline_ts > now, BigShoutError::DeadlineInPast);
    for odds in [yes_odds_bps, no_odds_bps] {
        require!(
            (MIN_ODDS_BPS..=MAX_ODDS_BPS).contains(&odds),
            BigShoutError::OddsOutOfRange
        );
    }

    let market = &mut ctx.accounts.market;
    market.market_id = market_id;
    market.fixture_id = fixture_id;
    market.stat_key = stat_key;
    market.threshold = threshold;
    market.created_ts = now;
    market.deadline_ts = deadline_ts;
    market.yes_odds_bps = yes_odds_bps;
    market.no_odds_bps = no_odds_bps;
    market.status = MarketStatus::Open;
    market.settled_proof_ts = 0;
    market.yes_count = 0;
    market.no_count = 0;
    market.yes_staked = 0;
    market.no_staked = 0;
    market.bump = ctx.bumps.market;
    Ok(())
}
