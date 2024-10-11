use {
    anchor_lang::prelude::*,
    anchor_spl::token_interface::{Mint},
};
use crate::*;

#[derive(Accounts)]
pub struct RemoveWhitelistedAddress<'info> {
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
        has_one = admin,
        has_one = minter_authority,
        has_one = mint_account,
        seeds = [b"minter", minter_authority.key().as_ref(), mint_account.key().as_ref()], 
        bump = minter.bump
    )]
    pub minter: Account<'info, Minter>,

    /// CHECK: the wallet address to receive the token
    #[account()]
    pub to_address: UncheckedAccount<'info>,

    #[account(
        mut,
        close = payer,
        seeds = [b"mint-whitelist", minter_authority.key().as_ref(), mint_account.key().as_ref(), to_address.key().as_ref()], 
        bump = whitelisted_address.bump
    )]
    pub whitelisted_address: Account<'info, WhitelistedAddress>,
}


//Can only be called if admin signs
pub fn remove_whitelisted_address(ctx: Context<RemoveWhitelistedAddress>) -> Result<()> {
    emit!(WhitelistedAddressRemoved{
        minter_authority: ctx.accounts.whitelisted_address.minter_authority, 
        mint_account: ctx.accounts.whitelisted_address.mint_account, 
        to_address: ctx.accounts.whitelisted_address.to_address, 
    });
    Ok(())
}

#[event]
pub struct WhitelistedAddressRemoved {
    pub minter_authority: Pubkey,
    pub mint_account: Pubkey,
    pub to_address: Pubkey,
}

