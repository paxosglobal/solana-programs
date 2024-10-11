import * as anchor from '@coral-xyz/anchor'
import { BorshCoder, EventParser, Program } from '@coral-xyz/anchor'
import { Keypair, PublicKey, ConfirmOptions, Transaction, sendAndConfirmTransaction, TransactionSignature } from '@solana/web3.js'
import { getAssociatedTokenAddressSync, createMultisig, createMint, createSetAuthorityInstruction, AuthorityType, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { expect, assert } from 'chai'
import * as borsh from "borsh";
import { minterController } from '../target/types/minter_controller'

async function getEvents(provider: anchor.Provider, minterControllerProgram: Program<minterController>, tx: TransactionSignature) {
  const latestBlockHash = await provider.connection.getLatestBlockhash();
  await provider.connection.confirmTransaction(
    {
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: tx,
    },
    "confirmed"
  );

  let t = await provider.connection.getTransaction(tx, {
    commitment: "confirmed" ,
    maxSupportedTransactionVersion: 0
    });

  const eventParser = new EventParser(minterControllerProgram.programId, new
    BorshCoder(minterControllerProgram.idl));
  return [...eventParser.parseLogs(t.meta.logMessages)];

}

describe('minter_controller', () => {
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)

  const payer = provider.wallet as anchor.Wallet;
  const minterControllerProgram = anchor.workspace.minterController as Program<minterController>

  const adminKeypair = Keypair.generate()
  const minterAuthorityKeypair = Keypair.generate()
  const minterAuthorityKeypair2 = Keypair.generate()
  const badMinterAuthorityKeypair = Keypair.generate()

  // Derive the PDA to use as mint account address.
  let mintPDA: PublicKey;
  let mintPDAToken2: PublicKey;

  //Minter authority PDAs
  let minterPDA: PublicKey;
  let minterPDA2: PublicKey;
  let minterPDAToken2: PublicKey;
  let badMinterPDA: PublicKey;

  let associatedTokenAccountAddress: PublicKey;
  let associatedTokenAccountAddressToken2: PublicKey;
  // Amount of tokens to mint.
  const capacity = new anchor.BN(100);
  const amount = new anchor.BN(30);
  const refillPerSecond = new anchor.BN(20)
  const data2 = new anchor.BN(45)

  let mintMultisigAddr: PublicKey;
  let mintMultisigAddr2: PublicKey;

  const confirmOptions: ConfirmOptions = { commitment: "confirmed" };

  const getReturnLog = (confirmedTransaction) => {
    const prefix = "Program return: ";
    let log = confirmedTransaction.meta.logMessages.find((log) =>
      log.startsWith(prefix)
    );
    log = log.slice(prefix.length);
    const [key, data] = log.split(" ", 2);
    const buffer = Buffer.from(data, "base64");
    return [key, data, buffer];
  };

  before(async() => {


    //Airdrop tokens to new keypairs
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(minterAuthorityKeypair.publicKey, 10000000000),
      "confirmed"
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(badMinterAuthorityKeypair.publicKey, 10000000000),
      "confirmed"
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(adminKeypair.publicKey, 10000000000),
      "confirmed"
    );

    //Create tokens
    mintPDA = await createMint(
      provider.connection,
      minterAuthorityKeypair, //Payer
      adminKeypair.publicKey, //Mint authority
      adminKeypair.publicKey, //Freeze authority
      9,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    mintPDAToken2 = await createMint(
      provider.connection,
      minterAuthorityKeypair, //Payer
      adminKeypair.publicKey, //Mint authority
      adminKeypair.publicKey, //Freeze authority
      9,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    //Create PDAs
    [minterPDA] = PublicKey.findProgramAddressSync([anchor.utils.bytes.utf8.encode('minter'), minterAuthorityKeypair.publicKey.toBuffer(), mintPDA.toBuffer()], minterControllerProgram.programId);
    [minterPDA2] = PublicKey.findProgramAddressSync([anchor.utils.bytes.utf8.encode('minter'), minterAuthorityKeypair2.publicKey.toBuffer(), mintPDA.toBuffer()], minterControllerProgram.programId);
    [minterPDAToken2] = PublicKey.findProgramAddressSync([anchor.utils.bytes.utf8.encode('minter'), minterAuthorityKeypair.publicKey.toBuffer(), mintPDAToken2.toBuffer()], minterControllerProgram.programId);
    [badMinterPDA] = PublicKey.findProgramAddressSync([anchor.utils.bytes.utf8.encode('minter'), badMinterAuthorityKeypair.publicKey.toBuffer(), mintPDA.toBuffer()], minterControllerProgram.programId);

    //Create multisigs
    mintMultisigAddr = await createMultisig(
      provider.connection,
      minterAuthorityKeypair,
      [adminKeypair.publicKey, minterPDA],
      1,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    )
    mintMultisigAddr2 = await createMultisig(
      provider.connection,
      minterAuthorityKeypair,
      [adminKeypair.publicKey, minterPDAToken2],
      1,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    )

    //Update token mint authority
    let transaction = new Transaction()
      .add(createSetAuthorityInstruction(
        mintPDA,
        adminKeypair.publicKey, //Current authority
        AuthorityType.MintTokens, //Mint Authority type
        mintMultisigAddr,
        [],
        TOKEN_2022_PROGRAM_ID
      ));
    await sendAndConfirmTransaction(provider.connection, transaction, [adminKeypair]);

    let transaction2 = new Transaction()
      .add(createSetAuthorityInstruction(
        mintPDAToken2,
        adminKeypair.publicKey, //Current authority
        AuthorityType.MintTokens, //Mint Authority type
        mintMultisigAddr2,
        [],
        TOKEN_2022_PROGRAM_ID
      ));
    await sendAndConfirmTransaction(provider.connection, transaction2, [adminKeypair]);

    associatedTokenAccountAddress = getAssociatedTokenAddressSync(mintPDA, badMinterAuthorityKeypair.publicKey, true, TOKEN_2022_PROGRAM_ID);
    associatedTokenAccountAddressToken2 = getAssociatedTokenAddressSync(mintPDAToken2, badMinterAuthorityKeypair.publicKey, true, TOKEN_2022_PROGRAM_ID);

  })


  describe('Add minter', () => {
    it('Can add minter', async () => {
      let foundEvent = false
      try {
        const tx = await minterControllerProgram.methods
          .addMinter(capacity, refillPerSecond, adminKeypair.publicKey)
          .accounts({
            minter: minterPDA,
            payer: provider.wallet.publicKey,
            minterAuthority: minterAuthorityKeypair.publicKey,
            mintAccount: mintPDA
          })
          .signers([minterAuthorityKeypair])
          .rpc()

        const events = await getEvents(provider, minterControllerProgram, tx)
        foundEvent = events.some((event) => 
          event.name === 'minterAdded' 
          && event.data.minterAuthority.toString() === minterAuthorityKeypair.publicKey.toString() 
          && event.data.mintAccount.toString() === mintPDA.toString() 
          && event.data.capacity.toString() === capacity.toString()
          && event.data.refillPerSecond.toString() === refillPerSecond.toString()
          && event.data.admin.toString() === adminKeypair.publicKey.toString()
        );
      } catch (err) {
        console.log(err)
        assert.fail('Error not expected while adding minter')
      }

      expect(foundEvent).to.be.true
      expect(
        (
          await minterControllerProgram.account.minter.fetch(minterPDA)
        ).rateLimit['capacity'].toString()
      ).to.equal(capacity.toString())
    })
  
    it('Can add second minter', async () => {
      await minterControllerProgram.methods
        .addMinter(capacity, refillPerSecond, adminKeypair.publicKey)
        .accounts({
          minter: minterPDA2,
          payer: provider.wallet.publicKey,
          minterAuthority: minterAuthorityKeypair2.publicKey,
          mintAccount: mintPDA
        })
        .signers([minterAuthorityKeypair2])
        .rpc()
  
      expect(
        (
          await minterControllerProgram.account.minter.fetch(minterPDA)
        ).rateLimit['capacity'].toString()
      ).to.equal(capacity.toString())

  
      expect(
        (
          await minterControllerProgram.account.minter.fetch(minterPDA2)
        ).rateLimit['capacity'].toString()
      ).to.equal(capacity.toString())
    })

    it('Can add minter for second token', async () => {
      await minterControllerProgram.methods
        .addMinter(capacity, refillPerSecond, adminKeypair.publicKey)
        .accounts({
          minter: minterPDAToken2,
          payer: provider.wallet.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          mintAccount: mintPDAToken2
        })
        .signers([minterAuthorityKeypair])
        .rpc()
  
      expect(
        (
          await minterControllerProgram.account.minter.fetch(minterPDAToken2)
        ).rateLimit['capacity'].toString()
      ).to.equal(capacity.toString())
    })

    it('Cannot add duplicate minter', async () => {
      try {
      await minterControllerProgram.methods
        .addMinter(capacity, refillPerSecond, adminKeypair.publicKey)
        .accounts({
          minter: minterPDA,
          payer: provider.wallet.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          mintAccount: mintPDA
        })
        .signers([minterAuthorityKeypair])
        .rpc()
        assert.fail('Expected adding duplicate minter to fail')

      } catch (err) {
        assert.isTrue(err.logs[3].includes('address: ' + minterPDA.toString() + ', base: None } already in use'))
      }
    })

    it('Cannot add minter without signature', async () => {
      try {
        await minterControllerProgram.methods
        .addMinter(capacity, refillPerSecond, adminKeypair.publicKey)
        .accounts({
          minter: badMinterPDA,
          payer: provider.wallet.publicKey,
          minterAuthority: badMinterAuthorityKeypair.publicKey,
          mintAccount: mintPDA
        })
        .rpc();
  
        assert.fail('Should throw an error')
      } catch (err) {
        assert.isTrue(err.toString().includes('Missing signature for public key'))
      }

    })

    it('Cannot add minter with mismatched signature', async () => {
      try {
        await minterControllerProgram.methods
          .addMinter(capacity, refillPerSecond, adminKeypair.publicKey)
          .accounts({
            minter: badMinterPDA,
            payer: provider.wallet.publicKey,
            minterAuthority: badMinterAuthorityKeypair.publicKey,
            mintAccount: mintPDA
          })
          .signers([minterAuthorityKeypair])
          .rpc()
          assert.fail('Expected adding duplicate minter to fail')
      } catch (err) {
        assert.isTrue(err.toString().includes('unknown signer'))
      }
    })
  })

  describe('Add To Whitelist', () => {
    it('Can successfully add whitelisted_address', async () => {
      const [mintWhitelistPDA] = PublicKey.findProgramAddressSync([anchor.utils.bytes.utf8.encode('mint-whitelist'), minterAuthorityKeypair.publicKey.toBuffer(), mintPDA.toBuffer(), payer.publicKey.toBuffer()], minterControllerProgram.programId)
      let foundEvent = false
  
      try {
        const tx = await minterControllerProgram.methods
        .addWhitelistedAddress()
        .accounts({
          payer: payer.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          toAddress: payer.publicKey,
          admin: adminKeypair.publicKey,
          mintAccount: mintPDA
        })
        .signers([adminKeypair])
        .rpc();
        const events = await getEvents(provider, minterControllerProgram, tx)
        foundEvent = events.some((event) => 
          event.name === 'whitelistedAddressAdded' 
          && event.data.minterAuthority.toString() === minterAuthorityKeypair.publicKey.toString() 
          && event.data.mintAccount.toString() === mintPDA.toString() 
          && event.data.toAddress.toString() === payer.publicKey.toString()
        );
      } catch (err) {
        console.log(err)
        assert.fail('Error not expected while adding whitelisted_address')
      }
      let whitelistedAddress= await minterControllerProgram.account.whitelistedAddress.fetch(mintWhitelistPDA)
      expect(whitelistedAddress.toAddress.toString()).to.equal(payer.publicKey.toString())
      expect(foundEvent).is.true
    });

    it('Can successfully add whitelisted_address of another token', async () => {
      const [mintWhitelistPDA] = PublicKey.findProgramAddressSync([anchor.utils.bytes.utf8.encode('mint-whitelist'), minterAuthorityKeypair.publicKey.toBuffer(), mintPDAToken2.toBuffer(), payer.publicKey.toBuffer()], minterControllerProgram.programId)
  
      try {
        await minterControllerProgram.methods
        .addWhitelistedAddress()
        .accounts({
          payer: payer.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          toAddress: payer.publicKey,
          admin: adminKeypair.publicKey,
          mintAccount: mintPDAToken2
        })
        .signers([adminKeypair])
        .rpc();
      } catch (err) {
        console.log(err)
        assert.fail('Error not expected while adding to whitelisted_address')
      }
      let whitelistedAddress= await minterControllerProgram.account.whitelistedAddress.fetch(mintWhitelistPDA)
      expect(whitelistedAddress.toAddress.toString()).to.equal(payer.publicKey.toString())
    });

    it('Cannot add whitelisted_address without admin signature', async () => {
      try {
        await minterControllerProgram.methods
        .addWhitelistedAddress()
        .accounts({
          payer: payer.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          toAddress: payer.publicKey,
          admin: adminKeypair.publicKey,
          mintAccount: mintPDA
        })
        .rpc();
        assert.fail('Error expected while adding whitelisted_address without admin signature')
      } catch (err) {
        assert.isTrue(err.toString().includes('Missing signature for public key'))
      }
    });

    it('Cannot add duplicate whitelisted_address', async () => {
      const [mintWhitelistPDA] = PublicKey.findProgramAddressSync([anchor.utils.bytes.utf8.encode('mint-whitelist'), minterAuthorityKeypair.publicKey.toBuffer(), mintPDA.toBuffer(), payer.publicKey.toBuffer()], minterControllerProgram.programId)
      try {
        await minterControllerProgram.methods
        .addWhitelistedAddress()
        .accounts({
          payer: payer.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          toAddress: payer.publicKey,
          admin: adminKeypair.publicKey,
          mintAccount: mintPDA
        })
        .signers([adminKeypair])
        .rpc();
        assert.fail('Error expected while adding duplicate whitelisted_address')
      } catch (err) {
        assert.isTrue(err.logs[3].includes('address: ' + mintWhitelistPDA.toString() + ', base: None } already in use'))
      }
    });
  });

  describe('Remove From Whitelist', () => {
    it('Can successfully remove whitelisted_address', async () => {
      const [mintWhitelistPDA] = PublicKey.findProgramAddressSync([anchor.utils.bytes.utf8.encode('mint-whitelist'), minterAuthorityKeypair.publicKey.toBuffer(), mintPDA.toBuffer(), payer.publicKey.toBuffer()], minterControllerProgram.programId)
      let foundEvent = false
      try {
        const tx = await minterControllerProgram.methods
        .removeWhitelistedAddress()
        .accounts({
          payer: payer.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          toAddress: payer.publicKey,
          admin: adminKeypair.publicKey,
          mintAccount: mintPDA
        })
        .signers([adminKeypair])
        .rpc();
        const events = await getEvents(provider, minterControllerProgram, tx)
        foundEvent = events.some((event) => 
          event.name === 'whitelistedAddressRemoved' 
          && event.data.minterAuthority.toString() === minterAuthorityKeypair.publicKey.toString() 
          && event.data.mintAccount.toString() === mintPDA.toString() 
          && event.data.toAddress.toString() === payer.publicKey.toString()
        );
        assert.isTrue(foundEvent)
      } catch (err) {
        assert.fail('Error not expected while removing whitelisted_address')
      }
      try {
        await minterControllerProgram.account.whitelistedAddress.fetch(mintWhitelistPDA)
        assert.fail('Error expected while fetching non existing pda')
      } catch (err) {
        assert.isTrue(err.toString().includes('Account does not exist or has no data ' + mintWhitelistPDA))
      }
    });

    it('Cannot remove address whitelisted_address without admin signature', async () => {
      const [mintWhitelistPDA] = PublicKey.findProgramAddressSync([anchor.utils.bytes.utf8.encode('mint-whitelist'), minterAuthorityKeypair.publicKey.toBuffer(), mintPDA.toBuffer(), payer.publicKey.toBuffer()], minterControllerProgram.programId)
      try {
        await minterControllerProgram.methods
        .removeWhitelistedAddress()
        .accounts({
          payer: payer.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          toAddress: payer.publicKey,
          admin: adminKeypair.publicKey,
          mintAccount: mintPDA
        })
        .rpc();
        assert.fail('Error expected while adding whitelisted_address without admin signature')
      } catch (err) {
        assert.isTrue(err.toString().includes('Missing signature for public key'))
      }
    });

    it('Cannot remove non existent whitelisted_address', async () => {
      try {
        await minterControllerProgram.methods
        .removeWhitelistedAddress()
        .accounts({
          payer: payer.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          toAddress: payer.publicKey,
          admin: adminKeypair.publicKey,
          mintAccount: mintPDA
        })
        .signers([adminKeypair])
        .rpc();
        assert.fail('Error expected while adding duplicate whitelisted_address')
      } catch (err) {
        assert.equal(err.error.errorCode.code, 'AccountNotInitialized')
      }
    });
  });

  describe('Mint tokens', () => {
    before('Add payer to whitelisted_address', async() => {
      const [mintWhitelistPDA] = PublicKey.findProgramAddressSync([anchor.utils.bytes.utf8.encode('mint-whitelist'), minterAuthorityKeypair.publicKey.toBuffer(), mintPDA.toBuffer(), payer.publicKey.toBuffer()], minterControllerProgram.programId)
      try {
        await minterControllerProgram.methods
        .addWhitelistedAddress()
        .accounts({
          payer: minterAuthorityKeypair.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          toAddress: payer.publicKey,
          admin: adminKeypair.publicKey,
          mintAccount: mintPDA,
          whitelisted_address: mintWhitelistPDA
        })
        .signers([minterAuthorityKeypair, adminKeypair])
        .rpc();
      } catch (err) {
        console.log(err)
        assert.fail('Error not expected while adding to whitelisted_address')
      }
    });

    it('Can successfully mint tokens', async () => {
      // Derive the associated token address account for the mint and payer.
      const associatedTokenAccountAddress = getAssociatedTokenAddressSync(mintPDA, payer.publicKey, true, TOKEN_2022_PROGRAM_ID);
      let foundEvent = false
  
      try {
        const mintTokenSignature = await minterControllerProgram.methods
        .mintToken(amount)
        .accounts({
          payer: minterAuthorityKeypair.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          toAddress: payer.publicKey,
          associatedTokenAccount: associatedTokenAccountAddress,
          mintAccount: mintPDA,
          mintMultisig: mintMultisigAddr,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterAuthorityKeypair])
        .rpc();
        const events = await getEvents(provider, minterControllerProgram, mintTokenSignature)
        foundEvent = events.some((event) => 
          event.name === 'tokensMinted' 
          && event.data.minterAuthority.toString() === minterAuthorityKeypair.publicKey.toString() 
          && event.data.mintAccount.toString() === mintPDA.toString() 
          && event.data.amount.toString() === amount.toString()
        );
      } catch (err) {
        console.log('Got an error')
        console.log(err)
        assert.fail('Error not expected while minting with minterPDA')
      }
  
      let tokenAmount = await provider.connection.getTokenAccountBalance(associatedTokenAccountAddress);
      assert.equal(amount.toString(), tokenAmount.value.uiAmountString)
      assert.isTrue(foundEvent)
    });

    it('Cannot mint using token program with TOKEN-2022 mint account', async () => {
      // Derive the associated token address account for the mint and payer.
      const associatedTokenAccountAddress = getAssociatedTokenAddressSync(mintPDA, payer.publicKey, true, TOKEN_PROGRAM_ID);
  
      try {
        const mintTokenSignature = await minterControllerProgram.methods
        .mintToken(capacity)
        .accounts({
          payer: minterAuthorityKeypair.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          toAddress: payer.publicKey,
          associatedTokenAccount: associatedTokenAccountAddress,
          mintAccount: mintPDA,
          mintMultisig: mintMultisigAddr,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([minterAuthorityKeypair])
        .rpc();
        assert.fail('Should fail when using TOKEN_PROGRAM_ID')
      } catch (err) {
        assert.isTrue(err.toString().includes('incorrect program id for instruction'))
      }
    });

    it('Cannot mint if rate limit exceeded', async () => {
      // Derive the associated token address account for the mint and payer.
      const associatedTokenAccountAddress = getAssociatedTokenAddressSync(mintPDA, payer.publicKey, true, TOKEN_2022_PROGRAM_ID);
  
      try {
        const mintTokenSignature = await minterControllerProgram.methods
        .mintToken(capacity)
        .accounts({
          payer: minterAuthorityKeypair.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          toAddress: payer.publicKey,
          associatedTokenAccount: associatedTokenAccountAddress,
          mintAccount: mintPDA,
          mintMultisig: mintMultisigAddr,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterAuthorityKeypair])
        .rpc();
        assert.fail('Rate limit should be exceeded')
      } catch (err) {
        assert.equal(err.error.errorCode.code, 'LimitExceeded')
      }
  
      let tokenAmount = await provider.connection.getTokenAccountBalance(associatedTokenAccountAddress);
      assert.equal(amount.toString(), tokenAmount.value.uiAmountString)
    });

    it('Cannot mint if rate limit exceeded over time period', async () => {
      // Derive the associated token address account for the mint and payer.
      const associatedTokenAccountAddress = getAssociatedTokenAddressSync(mintPDA, payer.publicKey, true, TOKEN_2022_PROGRAM_ID);
  
      try {
        const mintTokenSignature = await minterControllerProgram.methods
        .mintToken(amount)
        .accounts({
          payer: minterAuthorityKeypair.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          toAddress: payer.publicKey,
          associatedTokenAccount: associatedTokenAccountAddress,
          mintAccount: mintPDA,
          mintMultisig: mintMultisigAddr,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterAuthorityKeypair])
        .rpc();
      } catch (err) {
        assert.fail('Should not throw an error')
      }

      try {
        const mintTokenSignature = await minterControllerProgram.methods
        .mintToken(new anchor.BN(80)) //Remaining amount
        .accounts({
          payer: minterAuthorityKeypair.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          toAddress: payer.publicKey,
          associatedTokenAccount: associatedTokenAccountAddress,
          mintAccount: mintPDA,
          mintMultisig: mintMultisigAddr,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterAuthorityKeypair])
        .rpc();
        assert.fail('Rate limit should be exceeded')
      } catch (err) {
        assert.equal(err.error.errorCode.code, 'LimitExceeded')
      }

      //Wait 2 seconds, amount is now refilled
      await new Promise(r => setTimeout(r, 2000));

      try {
        const mintTokenSignature = await minterControllerProgram.methods
        .mintToken(new anchor.BN(80))
        .accounts({
          payer: minterAuthorityKeypair.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          toAddress: payer.publicKey,
          associatedTokenAccount: associatedTokenAccountAddress,
          mintAccount: mintPDA,
          mintMultisig: mintMultisigAddr,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterAuthorityKeypair])
        .rpc();
      } catch (err) {
        assert.fail('Rate limit should not be exceeded')
      }
    });

    it('Can successfully mint tokens for second token using other multisig', async () => {
      // Derive the associated token address account for the mint and payer.
      const associatedTokenAccountAddressToken2 = getAssociatedTokenAddressSync(mintPDAToken2, payer.publicKey, true, TOKEN_2022_PROGRAM_ID);
      try {
        const mintTokenSignature = await minterControllerProgram.methods
        .mintToken(amount)
        .accounts({
          payer: minterAuthorityKeypair.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          toAddress: payer.publicKey,
          associatedTokenAccount: associatedTokenAccountAddressToken2,
          mintAccount: mintPDAToken2,
          mintMultisig: mintMultisigAddr2,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterAuthorityKeypair])
        .rpc();
      } catch (err) {
        console.log('Got an error')
        console.log(err)
        assert.fail('Error not expected while minting with minterPDA2')
      }
  
      let tokenAmount = await provider.connection.getTokenAccountBalance(associatedTokenAccountAddressToken2);
      assert.equal(amount.toString(), tokenAmount.value.uiAmountString)
    });
  
    it('Cannot mint tokens with non minter', async () => {

      // Derive the associated token address account for the mint and payer.
      const associatedTokenAccountAddress = getAssociatedTokenAddressSync(mintPDA, badMinterAuthorityKeypair.publicKey, true, TOKEN_2022_PROGRAM_ID);
  
      try {
        const mintTokenSignature = await minterControllerProgram.methods
        .mintToken(amount)
        .accounts({
          payer: badMinterAuthorityKeypair.publicKey,
          minterAuthority: badMinterAuthorityKeypair.publicKey,
          toAddress: badMinterAuthorityKeypair.publicKey,
          associatedTokenAccount: associatedTokenAccountAddress,
          mintAccount: mintPDA,
          mintMultisig: mintMultisigAddr,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([badMinterAuthorityKeypair])
        .rpc();
  
        assert.fail('Should throw an error')
      } catch (err) {
        assert.equal(err.error.errorCode.code, 'AccountNotInitialized')
      }
    });
    
    it('Cannot mint tokens without minter authority signature', async () => {
      try {
        const mintTokenSignature = await minterControllerProgram.methods
        .mintToken(amount)
        .accounts({
          payer: minterAuthorityKeypair.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          toAddress: badMinterAuthorityKeypair.publicKey,
          associatedTokenAccount: associatedTokenAccountAddress,
          mintAccount: mintPDA,
          mintMultisig: mintMultisigAddr,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
  
        assert.fail('Should throw an error')
      } catch (err) {
        assert.isTrue(err.toString().includes('Missing signature for public key'))
      }

    })

    it('Cannot mint tokens with invalid user for minter authority', async () => {
      const associatedTokenAccountAddress = getAssociatedTokenAddressSync(mintPDA, payer.publicKey, true, TOKEN_2022_PROGRAM_ID);

      try {
        const mintTokenSignature = await minterControllerProgram.methods
        .mintToken(amount)
        .accounts({
          payer: minterAuthorityKeypair.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          toAddress: payer.publicKey,
          associatedTokenAccount: associatedTokenAccountAddress,
          minter: minterPDA2,
          mintAccount: mintPDA,
          mintMultisig: mintMultisigAddr,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterAuthorityKeypair])
        .rpc();
        assert.fail('Should throw an error')
      } catch (err) {
        assert.equal(err.error.errorCode.code, 'ConstraintSeeds')
        assert.equal(err.error.errorMessage, 'A seeds constraint was violated')
      }
    })

    it('Cannot mint tokens with mismatched minter authority signature', async () => {
      const associatedTokenAccountAddress = getAssociatedTokenAddressSync(mintPDA, payer.publicKey, true, TOKEN_2022_PROGRAM_ID);

      try {
        const mintTokenSignature = await minterControllerProgram.methods
        .mintToken(amount)
        .accounts({
          payer: badMinterAuthorityKeypair.publicKey,
          minterAuthority: badMinterAuthorityKeypair.publicKey,
          toAddress: payer.publicKey,
          associatedTokenAccount: associatedTokenAccountAddress,
          minter: minterPDA,
          mintAccount: mintPDA,
          mintMultisig: mintMultisigAddr,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([badMinterAuthorityKeypair])
        .rpc();
  
        assert.fail('Should throw an error')
      } catch (err) {
        assert.equal(err.error.errorCode.code, 'AccountNotInitialized')
      }
    })

    it('Cannot mint tokens with mismatched minter authority signature for other minter authority', async () => {
      try {
        const mintTokenSignature = await minterControllerProgram.methods
        .mintToken(amount)
        .accounts({
          payer: provider.publicKey,
          minterAuthority: provider.publicKey,
          toAddress: badMinterAuthorityKeypair.publicKey,
          associatedTokenAccount: associatedTokenAccountAddress,
          minter: minterPDA,
          mintAccount: mintPDA,
          mintMultisig: mintMultisigAddr,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterAuthorityKeypair])
        .rpc();
  
        assert.fail('Should throw an error')
      } catch (err) {
        assert.isTrue(err.toString().includes('unknown signer'))
      }
    })

    it('Cannot mint tokens to another mint account', async () => {
      try {
        const mintTokenSignature = await minterControllerProgram.methods
        .mintToken(amount)
        .accounts({
          payer: minterAuthorityKeypair.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          toAddress: payer.publicKey,
          associatedTokenAccount: associatedTokenAccountAddressToken2,
          minter: minterPDA,
          mintAccount: mintPDAToken2,
          mintMultisig: mintMultisigAddr2,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterAuthorityKeypair])
        .rpc();
  
        assert.fail('Should throw an error')
      } catch (err) {
        assert.isTrue(err.toString().includes('An account required by the instruction is missing'))
      }
    })

    it('Cannot mint tokens if not whitelisted', async () => {
      const associatedTokenAccountAddress = getAssociatedTokenAddressSync(mintPDA, badMinterAuthorityKeypair.publicKey, true, TOKEN_2022_PROGRAM_ID);
      try {
        const mintTokenSignature = await minterControllerProgram.methods
        .mintToken(amount)
        .accounts({
          payer: minterAuthorityKeypair.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          toAddress: badMinterAuthorityKeypair.publicKey,
          associatedTokenAccount: associatedTokenAccountAddress,
          mintAccount: mintPDA,
          mintMultisig: mintMultisigAddr,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterAuthorityKeypair])
        .rpc();
        assert.fail('Should throw an error')
      } catch (err) {
        assert.equal(err.error.errorCode.code, 'AccountNotInitialized')
      }
    })

  })

  describe('Get remaining mint amount', () => {
    it('Can get remaining amount with distant timestamp', async () => {
      try {
        const tx = await minterControllerProgram.methods
        .getRemainingAmount(new anchor.BN(Date.now() + 86400)) //1 day since last tx
        .accounts({
          payer: minterAuthorityKeypair.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          mintAccount: mintPDA,
          minter: minterPDA,
        })
        .signers([minterAuthorityKeypair])
        .rpc(confirmOptions);

        let t = await provider.connection.getTransaction(tx, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0
        });
        const [key, data, buffer] = getReturnLog(t);
        const reader = new borsh.BinaryReader(buffer)
        assert.equal(reader.readU64().toNumber(), capacity.toNumber())
      } catch (err) {
        console.log('Got an error')
        console.log(err)
        assert.fail('Error not expected while minting with minterPDA')
      }
    });

    it('Can get remaining amount with distant timestamp', async () => {
      let minter =  await minterControllerProgram.account.minter.fetch(minterPDA)
      let last_refill_time = minter.rateLimit['lastRefillTime'].toNumber()
      let remaining_amount = minter.rateLimit['remainingAmount'].toNumber() //Previous remaining amount
      let ELAPSED_SECONDS = 2
      try {
        const tx = await minterControllerProgram.methods
        .getRemainingAmount(new anchor.BN(last_refill_time + ELAPSED_SECONDS))
        .accounts({
          payer: minterAuthorityKeypair.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          mintAccount: mintPDA,
          minter: minterPDA,
        })
        .signers([minterAuthorityKeypair])
        .rpc(confirmOptions);

        let t = await provider.connection.getTransaction(tx, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0
        });
        const [key, data, buffer] = getReturnLog(t);
        const reader = new borsh.BinaryReader(buffer)
        assert.equal(reader.readU64().toNumber(), remaining_amount + (refillPerSecond.toNumber() * ELAPSED_SECONDS))
      } catch (err) {
        console.log('Got an error')
        console.log(err)
        assert.fail('Error not expected while minting with minterPDA')
      }
    });
  })

  describe('Update rate limit', () => {
    const newCapacity = new anchor.BN(200);
    const newRefillPerSecond = new anchor.BN(300)

    it('Can successfully update rate limit', async () => {
      let foundEvent = false
      const tx = await minterControllerProgram.methods
        .updateRateLimit(newCapacity, newRefillPerSecond)
        .accounts({
          minter: minterPDA,
          payer: provider.wallet.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          mintAccount: mintPDA,
          admin: adminKeypair.publicKey
        })
        .signers([adminKeypair])
        .rpc()
      const events = await getEvents(provider, minterControllerProgram, tx)
      foundEvent = events.some((event) => 
        event.name === 'rateLimitUpdated' 
        && event.data.minterAuthority.toString() === minterAuthorityKeypair.publicKey.toString() 
        && event.data.mintAccount.toString() === mintPDA.toString() 
        && event.data.capacity.toString() === newCapacity.toString()
        && event.data.refillPerSecond.toString() === newRefillPerSecond.toString()
      ) 
  
      let minterPda = await minterControllerProgram.account.minter.fetch(minterPDA)
      expect(minterPda.rateLimit['capacity'].toString()).to.equal(newCapacity.toString())
      expect(minterPda.rateLimit['refillPerSecond'].toString()).to.equal(newRefillPerSecond.toString())
      expect(foundEvent).to.be.true
    });

    it('Cannot update rate limit without admin signature', async () => {
      try {
        await minterControllerProgram.methods
        .updateRateLimit(newCapacity, newRefillPerSecond)
        .accounts({
          minter: minterPDA,
          payer: provider.wallet.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          mintAccount: mintPDA,
          admin: adminKeypair.publicKey
        })
        .rpc();

        assert.fail('Should throw an error')
      } catch (err) {
        assert.isTrue(err.toString().includes('Missing signature for public key'))
      }
    })

    it('Cannot update rate limit with invalid admin', async () => {
      try {
        await minterControllerProgram.methods
        .updateRateLimit(newCapacity, newRefillPerSecond)
        .accounts({
          minter: minterPDA,
          payer: provider.wallet.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          mintAccount: mintPDA,
          admin: minterAuthorityKeypair2.publicKey
        })
        .signers([minterAuthorityKeypair2])
        .rpc();

        assert.fail('Should throw an error')
      } catch (err) {
        assert.isTrue(err.toString().includes('A has one constraint was violated'))
      }
    })
  });

  describe('Start admin transfer', () => {

    it('Can successfully start admin transfer', async () => {
      let foundEvent = false
      try {
        const tx = await minterControllerProgram.methods
          .startAdminTransfer(minterAuthorityKeypair2.publicKey)
          .accounts({
            minter: minterPDA,
            payer: provider.wallet.publicKey,
            minterAuthority: minterAuthorityKeypair.publicKey,
            mintAccount: mintPDA,
            admin: adminKeypair.publicKey
          })
          .signers([adminKeypair])
          .rpc()
        const events = await getEvents(provider, minterControllerProgram, tx)
        foundEvent = events.some((event) => 
          event.name === 'adminTransferStarted' 
          && event.data.minterAuthority.toString() === minterAuthorityKeypair.publicKey.toString() 
          && event.data.mintAccount.toString() === mintPDA.toString() 
          && event.data.pendingAdmin.toString() === minterAuthorityKeypair2.publicKey.toString()
        ) 
      } catch (err) {
        console.log(err)
        assert.fail('Error not expected calling start admin transfer')
      }
      let minterPda = await minterControllerProgram.account.minter.fetch(minterPDA)
      expect(minterPda.admin.toString()).to.equal(adminKeypair.publicKey.toString())
      expect(minterPda.pendingAdmin.toString()).to.equal(minterAuthorityKeypair2.publicKey.toString())
      expect(foundEvent).to.be.true
    });

    it('Can successfully start admin transfer with existing pending admin', async () => {
      await minterControllerProgram.methods
        .startAdminTransfer(minterAuthorityKeypair.publicKey)
        .accounts({
          minter: minterPDA,
          payer: provider.wallet.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          mintAccount: mintPDA,
          admin: adminKeypair.publicKey
        })
        .signers([adminKeypair])
        .rpc()
  
      let minterPda = await minterControllerProgram.account.minter.fetch(minterPDA)
      expect(minterPda.admin.toString()).to.equal(adminKeypair.publicKey.toString())
      expect(minterPda.pendingAdmin.toString()).to.equal(minterAuthorityKeypair.publicKey.toString())
    });

    it('Cannot start admin transfer with None pending admin', async () => {
      try {
      await minterControllerProgram.methods
        .startAdminTransfer(null)
        .accounts({
          minter: minterPDA,
          payer: provider.wallet.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          mintAccount: mintPDA,
          admin: adminKeypair.publicKey
        })
        .signers([adminKeypair])
        .rpc()
        assert.fail('Expected err')
      } catch (err) {
        assert.isTrue(err.toString().includes('Cannot read properties of null'))
      }
  
    });

    it('Cannot start admin transfer with missing admin signature', async () => {
      try {
        await minterControllerProgram.methods
        .startAdminTransfer(adminKeypair.publicKey)
        .accounts({
          minter: minterPDA,
          payer: provider.wallet.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          mintAccount: mintPDA,
          admin: minterAuthorityKeypair.publicKey
        })
        .rpc();

        assert.fail('Should throw an error')
      } catch (err) {
        assert.isTrue(err.toString().includes('Missing signature for public key'))
      }
    })

    it('Cannot start admin transfer with invalid admin', async () => {
      try {
        await minterControllerProgram.methods
        .startAdminTransfer(adminKeypair.publicKey)
        .accounts({
          minter: minterPDA,
          payer: provider.wallet.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          mintAccount: mintPDA,
          admin: minterAuthorityKeypair.publicKey
        })
        .signers([minterAuthorityKeypair])
        .rpc();

        assert.fail('Should throw an error')
      } catch (err) {
        assert.isTrue(err.toString().includes('A has one constraint was violated'))
      }
    })
  });

  describe('Accept admin transfer', () => {

    it('Cannot accept admin transfer with missing pending admin signature', async () => {
      try {
        await minterControllerProgram.methods
        .acceptAdminTransfer()
        .accounts({
          minter: minterPDA,
          payer: provider.wallet.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          mintAccount: mintPDA,
          pendingAdmin: minterAuthorityKeypair.publicKey
        })
        .rpc();

        assert.fail('Should throw an error')
      } catch (err) {
        assert.isTrue(err.toString().includes('Missing signature for public key'))
      }
    })

    it('Cannot accept admin transfer with invalid pending admin signature', async () => {
      try {
        await minterControllerProgram.methods
        .acceptAdminTransfer()
        .accounts({
          minter: minterPDA,
          payer: provider.wallet.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          mintAccount: mintPDA,
          pendingAdmin: minterAuthorityKeypair.publicKey
        })
        .signers([minterAuthorityKeypair2])
        .rpc();

        assert.fail('Should throw an error')
      } catch (err) {
        assert.isTrue(err.toString().includes('unknown signer'))
      }
    })

    it('Cannot accept admin transfer with invalid pending admin', async () => {
      try {
        await minterControllerProgram.methods
        .acceptAdminTransfer()
        .accounts({
          minter: minterPDA,
          payer: provider.wallet.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          mintAccount: mintPDA,
          pendingAdmin: minterAuthorityKeypair2.publicKey
        })
        .signers([minterAuthorityKeypair2])
        .rpc();

        assert.fail('Should throw an error')
      } catch (err) {
        assert.isTrue(err.toString().includes('A raw constraint was violated'))
      }
    })

    it('Can successfully accept admin transfer', async () => {
      let foundEvent = false
      try {
        const tx = await minterControllerProgram.methods
        .acceptAdminTransfer()
        .accounts({
          minter: minterPDA,
          payer: provider.wallet.publicKey,
          minterAuthority: minterAuthorityKeypair.publicKey,
          mintAccount: mintPDA,
          pendingAdmin: minterAuthorityKeypair.publicKey
        })
        .signers([minterAuthorityKeypair])
        .rpc()
        const events = await getEvents(provider, minterControllerProgram, tx)
        foundEvent = events.some((event) => 
          event.name === 'adminTransferAccepted' 
          && event.data.minterAuthority.toString() === minterAuthorityKeypair.publicKey.toString() 
          && event.data.mintAccount.toString() === mintPDA.toString() 
          && event.data.admin.toString() === minterAuthorityKeypair.publicKey.toString()
        )
      } catch (err) {
        console.log(err)
        assert.fail('Error not expected calling start admin transfer')
      }

  
      let minterPda = await minterControllerProgram.account.minter.fetch(minterPDA)
      expect(minterPda.admin.toString()).to.equal(minterAuthorityKeypair.publicKey.toString())
      expect(minterPda.pendingAdmin).to.be.null
      expect(foundEvent).to.be.true
    });
  });

})