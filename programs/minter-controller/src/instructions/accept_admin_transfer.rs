
use {
    anchor_lang::prelude::*,
    anchor_spl::{
        token::{ Mint },
    },
};
use crate::*;

#[derive(Accounts)]
pub struct AcceptAdminTransfer<'info> {
    #[account()]
    pub payer: Signer<'info>,

    #[account()]
    pub pending_admin: Signer<'info>,

    /// CHECK: Minter authority 
    #[account()]
    pub minter_authority: UncheckedAccount<'info>,

    // Mint account address is a PDA
    #[account()]
    pub mint_account: Account<'info, Mint>,

    #[account(
        mut,
        constraint = minter.pending_admin == Some(pending_admin.key()),
        seeds = [b"minter", minter_authority.key().as_ref(), mint_account.key().as_ref()], 
        bump = minter.bump
    )]
    pub minter: Account<'info, Minter>,
}


//Can only be called if pending admin signs
pub fn accept_admin_transfer(ctx: Context<AcceptAdminTransfer>) -> Result<()> {
    ctx.accounts.minter.admin = ctx.accounts.minter.pending_admin.unwrap();
    ctx.accounts.minter.pending_admin = None;
    emit!(AdminTransferAccepted{
        minter_authority: ctx.accounts.minter.minter_authority, 
        mint_account: ctx.accounts.minter.mint_account, 
        admin: ctx.accounts.minter.admin
    });
    Ok(())
}

#[event]
pub struct AdminTransferAccepted {
    pub minter_authority: Pubkey,
    pub mint_account: Pubkey,
    pub admin: Pubkey
}