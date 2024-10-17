use {
    anchor_lang::prelude::*,
    anchor_spl::{
        token::{ Mint },
    },
};
use crate::*;

#[derive(Accounts)]
pub struct AddMinter<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account()]
    pub minter_authority: Signer<'info>,

    // Mint account address is a PDA
    #[account()]
    pub mint_account: Account<'info, Mint>,

    #[account(
        init, 
        payer = payer, 
        space = 8 + 32 + 32 + 32 + 33 + 8 + 8 + 8 + 8 + 1, //8 discriminator + 32 minter_authority + 32 mint account + 32 admin + 33 optional pending admin + 8 capacity + 8 tokens + 8 refill_per_second + 8 last_refill_time + 1 bump
        seeds = [b"minter", minter_authority.key().as_ref(), mint_account.key().as_ref()], 
        bump
    )]
    pub minter: Account<'info, Minter>,
    pub system_program: Program<'info, System>,
}

pub fn add_minter(ctx: Context<AddMinter>, capacity: u64, refill_per_second: u64, admin: Pubkey) -> Result<()> {
    ctx.accounts.minter.minter_authority = ctx.accounts.minter_authority.key();
    ctx.accounts.minter.mint_account = ctx.accounts.mint_account.key();
    ctx.accounts.minter.bump = ctx.bumps.minter;
    ctx.accounts.minter.admin = admin;
    ctx.accounts.minter.pending_admin = None;
    ctx.accounts.minter.rate_limit.capacity = capacity;
    ctx.accounts.minter.rate_limit.refill_per_second = refill_per_second;
    emit!(MinterAdded{
        minter_authority: ctx.accounts.minter.minter_authority, 
        mint_account: ctx.accounts.minter.mint_account, 
        capacity: capacity, 
        refill_per_second: refill_per_second, 
        admin: admin
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