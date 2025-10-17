require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { Connection, PublicKey } = require('@solana/web3.js');
const { createClient } = require('@supabase/supabase-js');

const RPC_URL = 'https://api.devnet.solana.com';
const MINT = '5bRPS8YnNMYZm6Mw86jkJMJpj9ZpCmq7Wj78gNAFnjHC';
const DECIMALS = 6;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
// Ajout: champs pour mise à jour carbon_stats et updated_at
const UPDATE_STATS = true;
const UPDATED_AT_FIELD = 'updated_at';
// Configuration paramétrable pour la table/ligne à mettre à jour côté stats
const SUPABASE_STATS_TABLE = process.env.SUPABASE_STATS_TABLE || 'carbon_stats';
const SUPABASE_STATS_FILTER_FIELD = process.env.SUPABASE_STATS_FILTER_FIELD || null;
const SUPABASE_STATS_FILTER_VALUE = process.env.SUPABASE_STATS_FILTER_VALUE || null;
const SUPABASE_STATS_UPDATED_AT_FIELD = process.env.SUPABASE_STATS_UPDATED_AT_FIELD || null;
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

    // 2️⃣ mise à jour dans la table carbon_supply avec updated_at
    const nowIso = new Date().toISOString();
    const { data: supplyData, error: supplyError } = await supabase
      .from('carbon_supply')
      .update({ current_supply: amountRaw, [UPDATED_AT_FIELD]: nowIso })
      .eq('mint_address', MINT)
      .select();

    if (supplyError) throw supplyError;
    console.log('✅ carbon_supply.current_supply mis à jour :', amountRaw);

    // 3️⃣ (optionnel) mise à jour carbon_stats.current_supply aussi
    if (UPDATE_STATS) {
      const nowIso = new Date().toISOString();
      const payloadBase = { current_supply: amountRaw };
      const payloadWithTs = SUPABASE_STATS_UPDATED_AT_FIELD
        ? { ...payloadBase, [SUPABASE_STATS_UPDATED_AT_FIELD]: nowIso }
        : payloadBase;

      if (!SUPABASE_STATS_FILTER_FIELD || SUPABASE_STATS_FILTER_VALUE == null) {
        console.warn('⚠️ Variables SUPABASE_STATS_FILTER_FIELD/SUPABASE_STATS_FILTER_VALUE non définies, impossible de cibler une ligne dans', SUPABASE_STATS_TABLE);
      } else {
        const { error: statsError } = await supabase
          .from(SUPABASE_STATS_TABLE)
          .update(payloadWithTs)
          .eq(SUPABASE_STATS_FILTER_FIELD, SUPABASE_STATS_FILTER_VALUE);
        if (statsError) throw statsError;
        console.log(`✅ ${SUPABASE_STATS_TABLE}.current_supply mis à jour (filtre ${SUPABASE_STATS_FILTER_FIELD}=${SUPABASE_STATS_FILTER_VALUE})`);
      }
    }
  } catch (e) {
    console.error('❌ erreur:', e.message);
    if (String(e.message).includes('view')) {
      console.error('➡️ Suggestion: indiquer SUPABASE_TABLE (écrivable) et un filtre SUPABASE_FILTER_FIELD/SUPABASE_FILTER_VALUE dans .env, ou créer une fonction RPC côté Supabase qui met à jour la table sous-jacente.');
    }
    process.exit(1);
  }
})();