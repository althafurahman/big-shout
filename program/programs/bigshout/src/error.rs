use anchor_lang::prelude::*;

#[error_code]
pub enum BigShoutError {
    #[msg("Only the config admin may perform this operation")]
    NotAdmin,
    #[msg("Deadline must be in the future")]
    DeadlineInPast,
    #[msg("Odds out of range (10_000..=1_000_000 bps)")]
    OddsOutOfRange,
    #[msg("Market is not open")]
    MarketNotOpen,
    #[msg("Prediction window is closed")]
    PredictionsClosed,
    #[msg("Stake must be greater than zero")]
    ZeroAmount,
    #[msg("Insufficient points")]
    InsufficientPoints,
    #[msg("Proof fixture does not match this market")]
    FixtureMismatch,
    #[msg("Proof stat keys do not match the market's stat key")]
    StatKeyMismatch,
    #[msg("Proof record is timestamped after the market deadline")]
    ProofAfterDeadline,
    #[msg("Wrong daily scores root account for the proof timestamp")]
    WrongRootAccount,
    #[msg("TxLINE on-chain validation rejected the proof")]
    ProofInvalid,
    #[msg("Expiry grace period has not elapsed; a YES proof may be in flight")]
    ExpiryTooEarly,
    #[msg("Market is not settled")]
    NotSettled,
    #[msg("Position already claimed")]
    AlreadyClaimed,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
