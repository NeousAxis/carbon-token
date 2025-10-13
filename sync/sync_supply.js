require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');
const { createClient } = require('@supabase/supabase-js');

const RPC_URL = 'https://api.devnet.solana.com';
const MINT = 'HRqmMnbA18VgstcfjCueAuzVZEoHHbLbbu973AqmK3Fs';
const DECIMALS = 6;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
// Ajout: champs pour mise à jour carbon_stats et updated_at
const UPDATE_STATS = true;
const UPDATED_AT_FIELD = 'updated_at';
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
      const payloadWithTs = { current_supply: amountRaw, [UPDATED_AT_FIELD]: nowIso };

      // On essaie de détecter une clé de filtre en lisant une ligne existante
      const { data: statsRows, error: statsSelectError } = await supabase
        .from('carbon_stats')
        .select('*')
        .limit(1);
      if (statsSelectError) throw statsSelectError;

      let filterKey = null;
      let filterValue = null;
      if (statsRows && statsRows.length > 0) {
        const row = statsRows[0];
        const candidates = ['id', 'uid', 'pk', 'mint_address', 'mint', 'token', 'name'];
        filterKey = candidates.find((k) => Object.prototype.hasOwnProperty.call(row, k));
        filterValue = filterKey ? row[filterKey] : null;
      }

      let statsErrorFinal = null;
      if (filterKey && filterValue != null) {
        // tentative avec updated_at
        const { error: statsError1 } = await supabase
          .from('carbon_stats')
          .update(payloadWithTs)
          .eq(filterKey, filterValue);
        if (statsError1) {
          console.warn('⚠️ Mise à jour carbon_stats avec updated_at a échoué:', statsError1.message || statsError1);
          const { error: statsError2 } = await supabase
            .from('carbon_stats')
            .update({ current_supply: amountRaw })
            .eq(filterKey, filterValue);
          statsErrorFinal = statsError2 || null;
        }
      } else {
        // fallback: mise à jour de toutes les lignes éligibles pour satisfaire la clause WHERE
        const { error: statsError1 } = await supabase
          .from('carbon_stats')
          .update(payloadWithTs)
          .gte('current_supply', 0);
        if (statsError1) {
          console.warn('⚠️ Mise à jour carbon_stats (fallback) avec updated_at a échoué:', statsError1.message || statsError1);
          const { error: statsError2 } = await supabase
            .from('carbon_stats')
            .update({ current_supply: amountRaw })
            .gte('current_supply', 0);
          statsErrorFinal = statsError2 || null;
        }
      }

      if (statsErrorFinal) throw statsErrorFinal;
      console.log('✅ carbon_stats.current_supply mis à jour (avec ou sans updated_at) :', amountRaw);
    }
  } catch (e) {
    console.error('❌ erreur:', e.message);
    if (String(e.message).includes('view')) {
      console.error('➡️ Suggestion: indiquer SUPABASE_TABLE (écrivable) et un filtre SUPABASE_FILTER_FIELD/SUPABASE_FILTER_VALUE dans .env, ou créer une fonction RPC côté Supabase qui met à jour la table sous-jacente.');
    }
    process.exit(1);
  }
})();