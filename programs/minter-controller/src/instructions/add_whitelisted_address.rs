use {
    anchor_lang::prelude::*,
    anchor_spl::token_interface::{Mint},
};
use crate::*;

#[derive(Accounts)]
pub struct AddWhitelistedAddress<'info> {
    #[account(mut)]
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
        init,
        payer = payer,
        space = 8 + WhitelistedAddress::INIT_SPACE,
        seeds = [b"mint-whitelist", minter_authority.key().as_ref(), mint_account.key().as_ref(), to_address.key().as_ref()], 
        bump
    )]
    pub whitelisted_address: Account<'info, WhitelistedAddress>,

    pub system_program: Program<'info, System>,
}


//Can only be called if admin signs
pub fn add_whitelisted_address(ctx: Context<AddWhitelistedAddress>) -> Result<()> {
    ctx.accounts.whitelisted_address.minter_authority = ctx.accounts.minter_authority.key();
    ctx.accounts.whitelisted_address.mint_account = ctx.accounts.mint_account.key();
    ctx.accounts.whitelisted_address.to_address = ctx.accounts.to_address.key();
    ctx.accounts.whitelisted_address.bump = ctx.bumps.whitelisted_address;
    emit!(WhitelistedAddressAdded{
        minter_authority: ctx.accounts.whitelisted_address.minter_authority, 
        mint_account: ctx.accounts.whitelisted_address.mint_account, 
        to_address: ctx.accounts.whitelisted_address.to_address, 
    });
    Ok(())
}

#[event]
pub struct WhitelistedAddressAdded {
    pub minter_authority: Pubkey,
    pub mint_account: Pubkey,
    pub to_address: Pubkey,
}