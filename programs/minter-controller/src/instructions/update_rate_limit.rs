
use {
    anchor_lang::prelude::*,
    anchor_spl::{
        token::{ Mint },
    },
};
use crate::*;

#[derive(Accounts)]
pub struct UpdateRateLimit<'info> {
    #[account()]
    pub payer: Signer<'info>,

    #[account()]
    pub admin: Signer<'info>,

    /// CHECK: Minter authority 
    #[account()]
    pub minter_authority: UncheckedAccount<'info>,

    // Mint account address is a PDA
    #[account()]
    pub mint_account: Account<'info, Mint>,

    #[account(
        mut, 
        has_one = admin,
        has_one = minter_authority,
        has_one = mint_account,
        seeds = [b"minter", minter_authority.key().as_ref(), mint_account.key().as_ref()], 
        bump = minter.bump
    )]
    pub minter: Account<'info, Minter>,
}


//Can only be called if admin signs
pub fn update_rate_limit(ctx: Context<UpdateRateLimit>, capacity: u64, refill_per_second: u64) -> Result<()> {
    ctx.accounts.minter.rate_limit.capacity = capacity;
    ctx.accounts.minter.rate_limit.refill_per_second = refill_per_second;
    emit!(RateLimitUpdated{
        minter_authority: ctx.accounts.minter.minter_authority, 
        mint_account: ctx.accounts.minter.mint_account, 
        capacity: capacity, 
        refill_per_second: refill_per_second, 
    });
    Ok(())
}

#[event]
pub struct RateLimitUpdated {
    pub minter_authority: Pubkey,
    pub mint_account: Pubkey,
    pub capacity: u64,
    pub refill_per_second: u64
}