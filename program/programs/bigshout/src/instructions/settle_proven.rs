use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::BigShoutError;
use crate::state::{Market, MarketStatus};
use crate::txoracle;
use crate::txoracle::types::{
    Comparison, NDimensionalStrategy, StatPredicate, StatValidationInput, TraderPredicate,
};

/// Permissionless YES settlement. The caller supplies a TxLINE stat proof;
/// this program derives the predicate itself from the market — proving that
/// `stat_key`'s value exceeded `threshold` in a record timestamped at or
/// before the deadline — then CPIs into the TxLINE oracle program, which
/// verifies the Merkle proof against its on-chain daily scores root. State
/// only changes if verification returns true: settlement is a deterministic
/// function of (market, proof), with no privileged resolution operator.
#[derive(Accounts)]
pub struct SettleProven<'info> {
    pub settler: Signer<'info>,
    #[account(mut)]
    pub market: Account<'info, Market>,
    /// CHECK: validated in the handler against the PDA derived from the
    /// proof timestamp under the TxLINE program id; the TxLINE program
    /// additionally verifies the Merkle root it contains.
    pub daily_scores_merkle_roots: UncheckedAccount<'info>,
    pub txoracle_program: Program<'info, txoracle::program::Txoracle>,
}

pub fn handle_settle_proven(
    ctx: Context<SettleProven>,
    payload: StatValidationInput,
) -> Result<()> {
    let market = &mut ctx.accounts.market;

    require!(market.status == MarketStatus::Open, BigShoutError::MarketNotOpen);
    require!(
        payload.fixture_summary.fixture_id == market.fixture_id,
        BigShoutError::FixtureMismatch
    );
    // A record from after the deadline can't settle a missed call: the stat
    // must have crossed the threshold while the window was still open.
    // (payload.ts is validated by the oracle as part of the proven record.)
    require!(
        payload.ts / 1000 <= market.deadline_ts,
        BigShoutError::ProofAfterDeadline
    );
    // Exactly the market's stat key, nothing else — blocks proof reuse
    // across markets with a different provable surface.
    require!(
        payload.stats.len() == 1 && payload.stats[0].stat.key == market.stat_key,
        BigShoutError::StatKeyMismatch
    );

    // The daily root account must be the TxLINE PDA for the UTC day of the
    // proof's own timestamp — a proof cannot be replayed against another day.
    let epoch_day = (payload.ts / MS_PER_DAY) as u16;
    let (expected_root, _) = Pubkey::find_program_address(
        &[DAILY_SCORES_ROOTS_SEED, &epoch_day.to_le_bytes()],
        &txoracle::ID,
    );
    require_keys_eq!(
        ctx.accounts.daily_scores_merkle_roots.key(),
        expected_root,
        BigShoutError::WrongRootAccount
    );

    let strategy = NDimensionalStrategy {
        geometric_targets: vec![],
        distance_predicate: None,
        discrete_predicates: vec![StatPredicate::Single {
            index: 0,
            predicate: TraderPredicate {
                threshold: market.threshold,
                comparison: Comparison::GreaterThan,
            },
        }],
    };

    let result = txoracle::cpi::validate_stat_v2(
        CpiContext::new(
            ctx.accounts.txoracle_program.key(),
            txoracle::cpi::accounts::ValidateStatV2 {
                daily_scores_merkle_roots: ctx.accounts.daily_scores_merkle_roots.to_account_info(),
            },
        ),
        payload.clone(),
        strategy,
    )?;
    require!(result.get(), BigShoutError::ProofInvalid);

    market.status = MarketStatus::YesWon;
    market.settled_proof_ts = payload.ts;
    Ok(())
}
