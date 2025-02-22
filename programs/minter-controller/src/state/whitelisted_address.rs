use {
    anchor_lang::prelude::*,
};

#[account]
#[derive(InitSpace)]
pub struct WhitelistedAddress{
    pub minter_authority: Pubkey,
    pub mint_account: Pubkey,
    pub to_address: Pubkey,
    pub bump: u8,
}