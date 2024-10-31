use {
    anchor_lang::prelude::*,
    anchor_spl::token_interface::{Mint},
};
use crate::*;

#[derive(Accounts)]
pub struct AddMinter<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    //The admin signature prevents a minter from being accidentally created with an incorrect admin
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account()]
    pub minter_authority: Signer<'info>,

    // Mint account address is a PDA
    #[account()]
    pub mint_account: InterfaceAccount<'info, Mint>,

    #[account(
        init, 
        payer = payer, 
        space = 8 + Minter::INIT_SPACE,
        seeds = [b"minter", minter_authority.key().as_ref(), mint_account.key().as_ref()], 
        bump
    )]
    pub minter: Account<'info, Minter>,
    pub system_program: Program<'info, System>,
}

pub fn add_minter(ctx: Context<AddMinter>, capacity: u64, refill_per_second: u64) -> Result<()> {
    ctx.accounts.minter.minter_authority = ctx.accounts.minter_authority.key();
    ctx.accounts.minter.mint_account = ctx.accounts.mint_account.key();
    ctx.accounts.minter.bump = ctx.bumps.minter;
    ctx.accounts.minter.admin = ctx.accounts.admin.key();
    ctx.accounts.minter.pending_admin = None;
    ctx.accounts.minter.rate_limit.capacity = capacity;
    ctx.accounts.minter.rate_limit.refill_per_second = refill_per_second;
    emit!(MinterAdded{
        minter_authority: ctx.accounts.minter.minter_authority, 
        mint_account: ctx.accounts.minter.mint_account, 
        capacity: capacity, 
        refill_per_second: refill_per_second, 
        admin: ctx.accounts.minter.admin
    });
    Ok(())
}

#[event]
pub struct MinterAdded {
    minter_authority: Pubkey,
    mint_account: Pubkey,
    admin: Pubkey,
    capacity: u64,
    refill_per_second: u64
}