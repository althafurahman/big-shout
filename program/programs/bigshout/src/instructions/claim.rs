use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::BigShoutError;
use crate::state::{Market, MarketStatus, Player, Position};

/// Permissionless crank: anyone may claim any settled position, crediting
/// the position's own player — the operator's cranker sweeps these so
/// results land without the user lifting a finger. The Position account
/// persists (claimed = true) as the permanent, verifiable receipt.
#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(constraint = market.key() == position.market)]
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub position: Account<'info, Position>,
    #[account(
        mut,
        seeds = [PLAYER_SEED, position.user.as_ref()],
        bump = player.bump,
    )]
    pub player: Account<'info, Player>,
}

pub fn handle_claim(ctx: Context<Claim>) -> Result<()> {
    let market = &ctx.accounts.market;
    let position = &mut ctx.accounts.position;
    let player = &mut ctx.accounts.player;

    require!(!position.claimed, BigShoutError::AlreadyClaimed);
    let outcome = match market.status {
        MarketStatus::YesWon => true,
        MarketStatus::NoWon => false,
        MarketStatus::Open => return err!(BigShoutError::NotSettled),
    };

    position.claimed = true;
    position.won = position.side == outcome;

    player.total += 1;
    if position.won {
        // Fixed odds, locked at prediction time: stake × odds. No pool, no
        // pro-rata, no solvency constraint — points are free and non-cashable.
        let payout = (position.amount as u128)
            .checked_mul(position.odds_bps as u128)
            .ok_or(BigShoutError::MathOverflow)?
            .checked_div(ODDS_DENOMINATOR as u128)
            .ok_or(BigShoutError::MathOverflow)?;
        player.points = player
            .points
            .checked_add(u64::try_from(payout).map_err(|_| BigShoutError::MathOverflow)?)
            .ok_or(BigShoutError::MathOverflow)?;
        player.correct += 1;
        player.streak = player.streak.saturating_add(1);
        player.best_streak = player.best_streak.max(player.streak);
    } else {
        player.streak = 0;
    }
    Ok(())
}
