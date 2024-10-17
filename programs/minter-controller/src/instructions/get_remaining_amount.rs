use {
    anchor_lang::prelude::*,
    anchor_spl::{
        token::{ Mint },
    },
};
use crate::*;

#[derive(Accounts)]
pub struct GetRemainingAmount<'info> {
    #[account()]
    pub payer: Signer<'info>,

    /// CHECK: Minter authority 
    #[account()]
    pub minter_authority: UncheckedAccount<'info>,

    // Mint account address is a PDA
    #[account()]
    pub mint_account: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"minter", minter_authority.key().as_ref(), mint_account.key().as_ref()],
        bump = minter.bump,
    )]
    pub minter: Account<'info, Minter>,
}

pub fn get_remaining_amount(ctx: Context<GetRemainingAmount>, timestamp: u64) -> Result<u64> {
    let remaining_amount = ctx.accounts.minter.rate_limit.refill(timestamp)?; 
    Ok(remaining_amount)
}