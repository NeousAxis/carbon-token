require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } = require('@solana/web3.js');
const { createMint, getOrCreateAssociatedTokenAccount } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const DECIMALS = process.env.CBWD_DECIMALS ? parseInt(process.env.CBWD_DECIMALS) : 6;
    const SYMBOL = process.env.CBWD_SYMBOL || 'CBWD';
    const NAME = process.env.CBWD_NAME || 'Carbon World';

    const connection = new Connection(RPC_URL, 'confirmed');

    // Generate keypairs for mint authority and treasury owner
    const mintAuthority = Keypair.generate();
    const treasuryOwner = Keypair.generate();

    // Optional: use a pre-funded payer from env to avoid faucet limits
    function fromEnvSecretKey(name) {
      if (!process.env[name]) return null;
      try {
        const arr = JSON.parse(process.env[name]);
        return Keypair.fromSecretKey(Uint8Array.from(arr));
      } catch (e) {
        console.warn(`⚠️ ${name} is present but invalid JSON array; ignoring and using default payer.`);
        return null;
      }
    }
    const envPayer = fromEnvSecretKey('PAYER_SECRET_KEY');
    const payer = envPayer || mintAuthority;

    console.log('🔐 Mint Authority PubKey:', mintAuthority.publicKey.toBase58());
    console.log('🔐 Treasury Owner PubKey:', treasuryOwner.publicKey.toBase58());
    console.log('👛 Payer PubKey:', payer.publicKey.toBase58(), envPayer ? '(from PAYER_SECRET_KEY)' : '(default: mintAuthority)');

    // Airdrop helper
    async function airdropAndConfirm(pubkey) {
      const sig = await connection.requestAirdrop(pubkey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, 'confirmed');
    }
    // Ensure payer has funds; skip faucet if SKIP_AIRDROP=true or balance is sufficient
    async function ensurePayerFunds(minLamports) {
      const bal = await connection.getBalance(payer.publicKey);
      console.log('💰 Payer balance:', (bal / LAMPORTS_PER_SOL).toFixed(4), 'SOL');
      const skip = process.env.SKIP_AIRDROP === 'true';
      if (bal >= minLamports) {
        console.log('✅ Sufficient payer balance, skipping airdrop.');
        return;
      }
      if (skip) {
        console.log('⏭️ SKIP_AIRDROP=true set, not requesting faucet.');
        throw new Error(`Insufficient funds for payer ${payer.publicKey.toBase58()}. Fund this address on devnet and re-run.`);
      }
      console.log('💧 Airdropping to payer...');
      await airdropAndConfirm(payer.publicKey);
    }

    // Fund payer if needed
    const MIN_PAYER_SOL = process.env.MIN_PAYER_SOL ? parseFloat(process.env.MIN_PAYER_SOL) : 0.2;
    await ensurePayerFunds(MIN_PAYER_SOL * LAMPORTS_PER_SOL);

    // Create mint with payer
    console.log('🪙 Creating Devnet mint...');
    const mint = await createMint(
      connection,
      payer,
      mintAuthority.publicKey,
      null,
      DECIMALS
    );
    console.log('✅ Mint created:', mint.toBase58());

    // Create treasury ATA owned by treasuryOwner (payer covers fees)
    console.log('🏦 Creating Treasury ATA...');
    const treasuryAta = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      treasuryOwner.publicKey
    );
    console.log('✅ Treasury ATA:', treasuryAta.address.toBase58());

    // Write addresses file for server auto-config
    const addr = {
      network: 'devnet',
      mint: mint.toBase58(),
      treasury_ata: treasuryAta.address.toBase58(),
      decimals: DECIMALS,
      symbol: SYMBOL,
      name: NAME
    };
    const addrPath = path.resolve(__dirname, '..', 'cbwd-addresses.json');
    fs.writeFileSync(addrPath, JSON.stringify(addr, null, 2));
    console.log('📝 Wrote', addrPath);

    // Print secrets for .env root (DO NOT COMMIT)
    function keypairToJsonArray(kp) {
      return '[' + Array.from(kp.secretKey).join(',') + ']';
    }
    console.log('\n⚠️ Add these lines to your .env at project root (DO NOT COMMIT):');
    console.log('TREASURY_TOKEN_ACCOUNT=' + treasuryAta.address.toBase58());
    console.log('MINT_AUTHORITY_SECRET_KEY=' + keypairToJsonArray(mintAuthority));
    console.log('TREASURY_OWNER_SECRET_KEY=' + keypairToJsonArray(treasuryOwner));
    console.log('SOLANA_RPC_URL=' + RPC_URL);
    console.log('CBWD_MINT=' + mint.toBase58());
    console.log('CBWD_DECIMALS=' + DECIMALS);
    console.log('\nOptional: set PAYER_SECRET_KEY in .env to a pre-funded devnet key to avoid faucet limits.');
    console.log('Optional: set SKIP_AIRDROP=true in .env to bypass faucet requests.');
    console.log('Optional: set MIN_PAYER_SOL in .env (default '+MIN_PAYER_SOL+' SOL) if you want to adjust minimum funds required.');

    // Also append these values to the root .env automatically
    try {
      const rootEnvPath = path.resolve(__dirname, '..', '.env');
      const envLines = [
        'TREASURY_TOKEN_ACCOUNT=' + treasuryAta.address.toBase58(),
        'MINT_AUTHORITY_SECRET_KEY=' + keypairToJsonArray(mintAuthority),
        'TREASURY_OWNER_SECRET_KEY=' + keypairToJsonArray(treasuryOwner),
        'SOLANA_RPC_URL=' + RPC_URL,
        'CBWD_MINT=' + mint.toBase58(),
        'CBWD_DECIMALS=' + DECIMALS
      ];
      fs.appendFileSync(rootEnvPath, '\n' + envLines.join('\n') + '\n');
      console.log('✅ .env mis à jour automatiquement avec les valeurs du mint Devnet.');
    } catch (err) {
      console.warn('⚠️ Impossible de mettre à jour automatiquement .env:', err.message);
    }

    console.log('\nThen restart `npm run start:mintburn` WITHOUT DRY_RUN.');
  } catch (e) {
    console.error('❌ Error creating devnet mint:', e);
    process.exit(1);
  }
})();