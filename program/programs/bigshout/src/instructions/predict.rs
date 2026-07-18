use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::BigShoutError;
use crate::state::{Market, MarketStatus, Player, Position};

/// Seal a call. The user is a custodial wallet held by the backend; the
/// payer is the operator's service wallet funding rent and fees — users
/// never hold SOL and never see gas. One position per user per market:
/// `init` (not init_if_needed) makes a second swipe on the same card fail.
#[derive(Accounts)]
pub struct Predict<'info> {
    pub user: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + Player::INIT_SPACE,
        seeds = [PLAYER_SEED, user.key().as_ref()],
        bump,
    )]
    pub player: Account<'info, Player>,
    #[account(
        init,
        payer = payer,
        space = 8 + Position::INIT_SPACE,
        seeds = [POSITION_SEED, market.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub position: Account<'info, Position>,
    pub system_program: Program<'info, System>,
}

pub fn handle_predict(ctx: Context<Predict>, side: bool, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let market = &mut ctx.accounts.market;

    require!(market.status == MarketStatus::Open, BigShoutError::MarketNotOpen);
    require!(now < market.deadline_ts, BigShoutError::PredictionsClosed);
    require!(amount > 0, BigShoutError::ZeroAmount);

    let player = &mut ctx.accounts.player;
    if player.authority == Pubkey::default() {
        player.authority = ctx.accounts.user.key();
        player.bump = ctx.bumps.player;
    }
    // The daily allowance is a top-up to the floor, not a grant: winnings
    // above the floor are kept, but idle days don't accumulate. This is the
    // fairness cap that keeps the prize contest legal (no consideration) and
    // Sybil-resistant (rank is by accuracy, not points).
    if now / SECS_PER_DAY > player.last_refill_ts / SECS_PER_DAY {
        player.points = player.points.max(DAILY_ALLOWANCE);
        player.last_refill_ts = now;
    }
    require!(player.points >= amount, BigShoutError::InsufficientPoints);
    player.points -= amount;

    if side {
        market.yes_count += 1;
        market.yes_staked = market
            .yes_staked
            .checked_add(amount)
            .ok_or(BigShoutError::MathOverflow)?;
    } else {
        market.no_count += 1;
        market.no_staked = market
            .no_staked
            .checked_add(amount)
            .ok_or(BigShoutError::MathOverflow)?;
    }

    let position = &mut ctx.accounts.position;
    position.market = market.key();
    position.user = ctx.accounts.user.key();
    position.side = side;
    position.amount = amount;
    // The lock: odds are sealed at the price taken, before the outcome.
    position.odds_bps = if side { market.yes_odds_bps } else { market.no_odds_bps };
    position.locked_ts = now;
    position.claimed = false;
    position.won = false;
    position.bump = ctx.bumps.position;
    Ok(())
}
