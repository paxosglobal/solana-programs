use {
    anchor_lang::prelude::*,
};

#[account]
#[derive(InitSpace)]
pub struct Minter {
    pub minter_authority: Pubkey,
    pub mint_account: Pubkey,
    pub admin: Pubkey,
    pub pending_admin: Option<Pubkey>,
    pub bump: u8,
    pub rate_limit: RateLimit,
}

#[account]
#[derive(InitSpace)]
pub struct RateLimit {
    pub capacity: u64,
    pub remaining_amount: u64,
    pub refill_per_second: u64,
    pub last_refill_time: u64,
}