require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');
const { createClient } = require('@supabase/supabase-js');

const RPC_URL = 'https://api.devnet.solana.com';
const MINT = 'HRqmMnbA18VgstcfjCueAuzVZEoHHbLbbu973AqmK3Fs';
const DECIMALS = 6;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SUPABASE_TABLE = process.env.SUPABASE_TABLE; // table écrivable (optionnel)
const SUPABASE_FILTER_FIELD = process.env.SUPABASE_FILTER_FIELD; // ex: 'id' ou 'mint'
const SUPABASE_FILTER_VALUE = process.env.SUPABASE_FILTER_VALUE; // ex: '1' ou le mint
const UPDATE_ONLY_IF_DIFFERENT = process.env.SUPABASE_UPDATE_ONLY_IF_DIFFERENT !== 'false';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ erreur: Variables SUPABASE_URL et SUPABASE_KEY manquantes dans .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

(async () => {
  try {
    // 1️⃣ lecture on-chain
    const connection = new Connection(RPC_URL, 'confirmed');
    const info = await connection.getTokenSupply(new PublicKey(MINT));
    const amountRaw = Number(info.value.amount);
    const supply = amountRaw / 10 ** DECIMALS;
    console.log(`💰 Supply on-chain : ${supply.toFixed(6)} CBWD`);

    // 2️⃣ mise à jour dans la table carbon_supply
    const { data, error } = await supabase
      .from('carbon_supply')
      .update({ current_supply: amountRaw })
      .eq('mint_address', MINT)
      .select();

    if (error) throw error;
    console.log('✅ carbon_supply.current_supply mis à jour :', amountRaw);
  } catch (e) {
    console.error('❌ erreur:', e.message);
    if (String(e.message).includes('view')) {
      console.error('➡️ Suggestion: indiquer SUPABASE_TABLE (écrivable) et un filtre SUPABASE_FILTER_FIELD/SUPABASE_FILTER_VALUE dans .env, ou créer une fonction RPC côté Supabase qui met à jour la table sous-jacente.');
    }
    process.exit(1);
  }
})();