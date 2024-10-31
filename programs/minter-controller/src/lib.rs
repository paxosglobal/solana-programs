use {
    anchor_lang::prelude::*,
};
use instructions::*;
use state::*;
pub mod instructions;
pub mod state;

declare_id!("DWGSMEEzjofw9Xd1rSUHr71HNgtmotoUbWuqRyfLcMWk");


#[program]
pub mod minter_controller {
    use super::*;

    pub fn accept_admin_transfer(ctx: Context<AcceptAdminTransfer>) -> Result<()> {
        accept_admin_transfer::accept_admin_transfer(ctx)
    }

    pub fn add_minter(ctx: Context<AddMinter>, capacity: u64, refill_per_second: u64) -> Result<()> {
        add_minter::add_minter(ctx, capacity, refill_per_second)
    }

    pub fn add_whitelisted_address(ctx: Context<AddWhitelistedAddress>) -> Result<()> {
        add_whitelisted_address::add_whitelisted_address(ctx)
    }

    pub fn get_remaining_amount(ctx: Context<GetRemainingAmount>, timestamp: u64) -> Result<u64> {
        get_remaining_amount::get_remaining_amount(ctx, timestamp)
    }

    pub fn mint_token(ctx: Context<MintToken>, amount: u64) -> Result<()> {
        mint_token::mint_token(ctx, amount)
    }

    pub fn remove_whitelisted_address(ctx: Context<RemoveWhitelistedAddress>) -> Result<()> {
        remove_whitelisted_address::remove_whitelisted_address(ctx)
    }

    pub fn start_admin_transfer(ctx: Context<StartAdminTransfer>, pending_admin: Pubkey) -> Result<()> {
        start_admin_transfer::start_admin_transfer(ctx, pending_admin)
    }

    pub fn update_rate_limit(ctx: Context<UpdateRateLimit>, capacity: u64, refill_per_second: u64) -> Result<()> {
        update_rate_limit::update_rate_limit(ctx, capacity, refill_per_second)
    }
}