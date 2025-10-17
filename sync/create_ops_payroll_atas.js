require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    const RPC_URL = process.env.SOLANA_RPC_URL || process.env.RPC_URL || 'https://api.devnet.solana.com';
    const MINT = process.env.CBWD_MINT;
    if (!MINT) {
      console.error('❌ CBWD_MINT manquant dans .env');
      process.exit(1);
    }
    const connection = new Connection(RPC_URL, 'confirmed');

    function parseSecretKey(raw) {
      try {
        const arr = JSON.parse(raw);
        return Keypair.fromSecretKey(Uint8Array.from(arr));
      } catch (_) {
        return null;
      }
    }

    // Owners for ops and payroll: use provided secrets or generate new ones
    let opsOwner = parseSecretKey(process.env.OPS_OWNER_SECRET_KEY);
    let payrollOwner = parseSecretKey(process.env.PAYROLL_OWNER_SECRET_KEY);
    const generatedOps = !opsOwner;
    const generatedPayroll = !payrollOwner;
    if (!opsOwner) opsOwner = Keypair.generate();
    if (!payrollOwner) payrollOwner = Keypair.generate();

    async function ensureFunds(kp, minSol = 0.2) {
      try {
        const bal = await connection.getBalance(kp.publicKey);
        if (bal < minSol * LAMPORTS_PER_SOL) {
          console.log(`↪️ Airdrop ${minSol} SOL → ${kp.publicKey.toBase58()}`);
          const sig = await connection.requestAirdrop(kp.publicKey, Math.ceil(minSol * LAMPORTS_PER_SOL));
          await connection.confirmTransaction(sig, 'confirmed');
        }
      } catch (e) {
        console.warn('⚠️ Airdrop échoué (devnet probable):', e.message);
      }
    }

    // Choose a payer for ATA creation: prefer PAYER_SECRET_KEY, fallback to owner
    let payer = parseSecretKey(process.env.PAYER_SECRET_KEY);
    if (!payer) payer = opsOwner; // fallback
    await ensureFunds(payer);
    await ensureFunds(opsOwner);
    await ensureFunds(payrollOwner);

    const mintPk = new PublicKey(MINT);
    const opsAta = await getOrCreateAssociatedTokenAccount(connection, payer, mintPk, opsOwner.publicKey);
    const payrollAta = await getOrCreateAssociatedTokenAccount(connection, payer, mintPk, payrollOwner.publicKey);

    function keypairToJsonArray(kp) {
      return '[' + Array.from(kp.secretKey).join(',') + ']';
    }

    console.log('\nAdd these to your .env (DO NOT COMMIT):');
    if (generatedOps) console.log('OPS_OWNER_SECRET_KEY=' + keypairToJsonArray(opsOwner));
    if (generatedPayroll) console.log('PAYROLL_OWNER_SECRET_KEY=' + keypairToJsonArray(payrollOwner));
    console.log('OPS_TOKEN_ACCOUNT=' + opsAta.address.toBase58());
    console.log('PAYROLL_TOKEN_ACCOUNT=' + payrollAta.address.toBase58());

    // Append to .env automatically
    try {
      const rootEnvPath = path.resolve(__dirname, '..', '.env');
      const envLines = [];
      if (generatedOps) envLines.push('OPS_OWNER_SECRET_KEY=' + keypairToJsonArray(opsOwner));
      if (generatedPayroll) envLines.push('PAYROLL_OWNER_SECRET_KEY=' + keypairToJsonArray(payrollOwner));
      envLines.push('OPS_TOKEN_ACCOUNT=' + opsAta.address.toBase58());
      envLines.push('PAYROLL_TOKEN_ACCOUNT=' + payrollAta.address.toBase58());
      fs.appendFileSync(rootEnvPath, '\n' + envLines.join('\n') + '\n');
      console.log('✅ .env mis à jour automatiquement avec OPS/PAYROLL ATAs.');
    } catch (err) {
      console.warn('⚠️ Impossible de mettre à jour automatiquement .env:', err.message);
    }

    console.log('\nEnsuite, redémarrez `npm run start:mintburn` et utilisez /mint-split.');
  } catch (e) {
    console.error('❌ Erreur création ATAs ops/payroll:', e);
    process.exit(1);
  }
})();