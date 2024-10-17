# Solana Programs
Solana programs developed at Paxos

## Development

### Required installs
- rust 1.79.0 (Installed via asdf)
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