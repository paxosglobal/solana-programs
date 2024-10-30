
use {
    anchor_lang::prelude::*,
    anchor_spl::token_interface::{Mint},
};
use crate::*;

#[derive(Accounts)]
pub struct StartAdminTransfer<'info> {
    #[account()]
    pub payer: Signer<'info>,

    #[account()]
    pub admin: Signer<'info>,

    /// CHECK: Minter authority 
    #[account()]
    pub minter_authority: UncheckedAccount<'info>,

    // Mint account address is a PDA
    #[account()]
    pub mint_account: InterfaceAccount<'info, Mint>,

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


//Can only be called if current admin signs
pub fn start_admin_transfer(ctx: Context<StartAdminTransfer>, pending_admin: Pubkey) -> Result<()> {
    ctx.accounts.minter.pending_admin = Some(pending_admin);
    emit!(AdminTransferStarted{
        minter_authority: ctx.accounts.minter.minter_authority, 
        mint_account: ctx.accounts.minter.mint_account, 
        pending_admin: pending_admin
    });
    Ok(())
}

#[event]
pub struct AdminTransferStarted {
    pub minter_authority: Pubkey,
    pub mint_account: Pubkey,
    pub pending_admin: Pubkey
}