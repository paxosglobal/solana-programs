# Solana Programs
Solana programs developed at Paxos

## Minter Controller
`minter_controller` is used to add transaction controls to Solana mint authorities for the token and token-2022 program.
The transaction controls include rate limitings and whitelisting.  The program requires the token mint authority
to be a [spl token multisig](https://spl.solana.com/token#example-mint-with-multisig-authority).

## Audits
Audits were performed by both Zellic and Trail of Bits.  Audit reports can be found [here](audits/).

### Usage

#### Add Minter
The program is first used by calling the `add_minter` instruction which creates a PDA that can be used to mint tokens.  
The PDA is derived from the `minter_authority` and `mint_account`. 
The minter PDA should be added as a signer on the spl token multisig.
An `admin` Pubkey is also specified to update the transaction controls.

#### Whitelisting
Whitelisted addresses which can be minted to can be added via `add_whitelisted_address`. Whitelisted addresses can be
removed via `remove_whitelisted_address`.  These instructions can only be called by the `admin`.

#### Rate limiting
The initial rate limit is specified when calling `add_minter`.  It can also be updated via `update_rate_limit`.
These instructions can only be called by the `admin`.

#### Update admin
Updating the admin is a two step process. Step 1 is to call `start_admin_transfer` with the current `admin`.
Step 2 is for the new admin to call `accept_admin_transfer`.

#### Minting tokens
Minting tokens is done by calling `mint_tokens`.  This instruction must be signed with the `minter_authority`.


## Development

### Required installs
- rust 1.79.0
- [solana](https://docs.solanalabs.com/cli/install) 1.18.18
- [anchor](https://book.anchor-lang.com/getting_started/installation.html) 0.30.1

### Build
`anchor build`

### Test
`npm install`

`anchor test`

### Deploy
Run `anchor keys list`.  Ensure the public key output matches the `declare_id!` value in `lib.rs`
`anchor deploy`