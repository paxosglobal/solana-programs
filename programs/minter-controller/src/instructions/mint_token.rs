use {
    anchor_lang::prelude::*,
    anchor_spl::{
        associated_token::AssociatedToken,
        token::{Mint, Token, TokenAccount},
    },
};
pub use anchor_spl::token::spl_token;
pub use anchor_spl::token::spl_token::ID as splId;
use crate::*;

#[derive(Accounts)]
pub struct MintToken<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account()]
    pub minter_authority: Signer<'info>,

    /// CHECK: Multisig addr
    #[account()]
    pub mint_multisig: UncheckedAccount<'info,>,

    // Mint account address is a PDA
    #[account(mut)]
    pub mint_account: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"minter", minter_authority.key().as_ref(), mint_account.key().as_ref()],
        bump = minter.bump,
    )]
    pub minter: Account<'info, Minter>,

    /// CHECK: the wallet address to receive the token
    #[account()]
    pub to_address: UncheckedAccount<'info>,

    #[account(
        seeds = [b"mint-whitelist", minter_authority.key().as_ref(), mint_account.key().as_ref(), to_address.key().as_ref()],
        bump = whitelist.bump,
    )]
    pub whitelist: Account<'info, WhitelistedAddress>,
    // Create Associated Token Account, if needed
    // This is the account that will hold the minted tokens
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint_account,
        associated_token::authority = to_address,
    )]
    pub associated_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}


pub fn mint_token(ctx: Context<MintToken>, amount: u64) -> Result<()> {
    //Checks rate limit
    ctx.accounts.minter.rate_limit.check_limit(amount)?; 

    let minter_authority_key = ctx.accounts.minter_authority.key();
    let mint_account_key = ctx.accounts.mint_account.key();
    // PDA signer seeds
    let signer_seeds: &[&[&[u8]]] = &[&[b"minter", minter_authority_key.as_ref(), mint_account_key.as_ref(), &[ctx.accounts.minter.bump]]];

    // Invoke the mint_to instruction on the token program
    // Anchor does not implement the token multisig so we have to do it here manually.
    let ix = spl_token::instruction::mint_to(
        &splId,
        ctx.accounts.mint_account.to_account_info().key,
        ctx.accounts.associated_token_account.to_account_info().key,
        ctx.accounts.mint_multisig.to_account_info().key,
        &[ctx.accounts.minter.to_account_info().key],
        amount * 10u64.pow(ctx.accounts.mint_account.decimals as u32),
    )?;
    anchor_lang::solana_program::program::invoke_signed(
        &ix,
        &[
            ctx.accounts.associated_token_account.to_account_info(), 
            ctx.accounts.mint_account.to_account_info(), 
            ctx.accounts.mint_multisig.to_account_info(), 
            ctx.accounts.minter.to_account_info()
        ],
        signer_seeds,
    )?;

    emit!(TokensMinted{
        minter_authority: ctx.accounts.minter.minter_authority, 
        mint_account: ctx.accounts.minter.mint_account, 
        amount: amount
    });

    Ok(())
}

impl RateLimit {
    //Replenishes the rate limit based on how much time has passed without modifying any state
    pub fn refill(&mut self, current_time: u64) -> Result<u64> {
        let mut new_tokens: u64 = 0;
        if current_time > self.last_refill_time {
            let time_elapsed_in_seconds = current_time - self.last_refill_time;
            new_tokens = new_tokens.saturating_add(time_elapsed_in_seconds.saturating_mul(self.refill_per_second));
        }
        Ok(std::cmp::min(self.capacity, self.remaining_amount.saturating_add(new_tokens)))
    }

    pub fn check_limit(&mut self, amount: u64) -> Result<()> {
        let current_time: u64 = Clock::get()?.unix_timestamp.try_into().unwrap();
        self.remaining_amount = self.refill(current_time)?;
        self.last_refill_time = current_time;
        match self.remaining_amount.checked_sub(amount) {
            Some(new_tokens) => {
                self.remaining_amount = new_tokens;
                Ok(())
            },
            None => Err(error!(LimitError::LimitExceeded)),
        }
    }
}

#[error_code]
pub enum LimitError {
    #[msg("limit exceeeded")]
    LimitExceeded
}

#[event]
pub struct TokensMinted {
    pub minter_authority: Pubkey,
    pub mint_account: Pubkey,
    pub amount: u64,
}
