require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const express = require('express');
const { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, createMintToInstruction, createBurnInstruction } = require('@solana/spl-token');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Config via .env
const PORT = process.env.MINT_BURN_PORT ? parseInt(process.env.MINT_BURN_PORT) : 3333;
const RPC_URL = ((process.env.SOLANA_RPC_URL || process.env.RPC_URL || 'https://api.devnet.solana.com') + '').trim().replace(/^`+|`+$/g, '');
let ADDR_JSON = null;
try {
  const jsonPath = path.resolve(__dirname, '..', 'cbwd-addresses.json');
  if (fs.existsSync(jsonPath)) {
    ADDR_JSON = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  }
} catch (_) {}
const CBWD_MINT = process.env.CBWD_MINT || (ADDR_JSON && ADDR_JSON.mint) || '5bRPS8YnNMYZm6Mw86jkJMJpj9ZpCmq7Wj78gNAFnjHC';
const TREASURY_TOKEN_ACCOUNT = process.env.TREASURY_TOKEN_ACCOUNT || (ADDR_JSON && ADDR_JSON.treasury_ata) || '';
const DECIMALS = process.env.CBWD_DECIMALS ? parseInt(process.env.CBWD_DECIMALS) : (ADDR_JSON && ADDR_JSON.decimals) || 6;
const DRY_RUN = (process.env.DRY_RUN || 'false').toLowerCase() === 'true';
// Mint-split configuration (basis points: 10000 = 100%)
const OPS_BPS = process.env.OPS_BPS ? parseInt(process.env.OPS_BPS) : 25; // 0.25%
const PAYROLL_BPS = process.env.PAYROLL_BPS ? parseInt(process.env.PAYROLL_BPS) : 100; // 1.00%
const BURN_BUFFER_BPS = process.env.BURN_BUFFER_BPS ? parseInt(process.env.BURN_BUFFER_BPS) : 25; // 0.25%
const OPS_TOKEN_ACCOUNT = (process.env.OPS_TOKEN_ACCOUNT || '').trim();
const PAYROLL_TOKEN_ACCOUNT = (process.env.PAYROLL_TOKEN_ACCOUNT || '').trim();

// Supabase config (optional but recommended for automatic updates)
const SUPABASE_URL = process.env.SUPABASE_URL || '';
// Prefer service role key; fallback to anon if explicitly allowed by RLS
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || '';
const SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

if (!TREASURY_TOKEN_ACCOUNT && !DRY_RUN) {
  console.error('❌ TREASURY_TOKEN_ACCOUNT manquant dans .env ou cbwd-addresses.json');
}
if (!process.env.MINT_AUTHORITY_SECRET_KEY && !DRY_RUN) {
  console.error('❌ MINT_AUTHORITY_SECRET_KEY manquant dans .env');
}
const MINT_AUTHORITY_SECRET_KEY = process.env.MINT_AUTHORITY_SECRET_KEY || '';
const TREASURY_OWNER_SECRET_KEY = process.env.TREASURY_OWNER_SECRET_KEY || process.env.MINT_AUTHORITY_SECRET_KEY || '';
const PAYER_SECRET_KEY = process.env.PAYER_SECRET_KEY || '';
function parseSecretKey(raw) {
  try {
    const arr = JSON.parse(raw);
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  } catch (_) {
    return null;
  }
}

// Auto-cycle config (devnet par défaut activé)
const AUTO_ENABLED = ((process.env.AUTO_ENABLED || 'true') + '').toLowerCase() === 'true';
const AUTO_INTERVAL_MS = parseInt(process.env.AUTO_INTERVAL_MS || '30000'); // 30s
const AUTO_BURN_LIMIT = parseInt(process.env.AUTO_BURN_LIMIT || '10');
const AUTO_MINT_LIMIT = parseInt(process.env.AUTO_MINT_LIMIT || '10');
const AUTO_TOPUP_EXTRA_BPS = parseInt(process.env.AUTO_TOPUP_EXTRA_BPS || '0'); // marge additionnelle optionnelle
const autoState = { running: false, lastRunAt: null, lastResult: null, enabled: AUTO_ENABLED, interval_ms: AUTO_INTERVAL_MS };

const app = express();
app.use(express.json());
// CORS simplifié pour permettre la lecture depuis un site statique local
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
// Servir le site statique
try {
  const siteDir = path.resolve(__dirname, '..', 'site-carbon-world');
  if (fs.existsSync(siteDir)) {
    app.use('/site', express.static(siteDir));
  }
} catch (_) {}

app.get('/', (req, res) => {
  res.json({ ok: true, rpc: RPC_URL, mint: CBWD_MINT, treasury: TREASURY_TOKEN_ACCOUNT, decimals: DECIMALS, dryRun: DRY_RUN });
});

// Nouveau endpoint: obtenir la supply actuelle du token
app.get('/supply', async (req, res) => {
  try {
    const connection = new Connection(RPC_URL, 'confirmed');
    const info = await connection.getTokenSupply(new PublicKey(CBWD_MINT));
    const ui = Number(info.value.amount) / 10 ** DECIMALS;
    res.json({ ok: true, mint: CBWD_MINT, amount_raw: info.value.amount, decimals: info.value.decimals, supply_cbwd: ui });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// AI healthcheck via OpenRouter
app.get('/ai/health', async (req, res) => {
  try {
    const key = (process.env.OPENROUTER_KEY || '').trim();
    if (!key) return res.status(400).json({ ok: false, error: 'missing_openrouter_key' });
    const url = 'https://openrouter.ai/api/v1/chat/completions';
    const body = {
      model: 'openai/gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a simple healthcheck responder.' },
        { role: 'user', content: 'Reply with OK' }
      ],
      max_tokens: 3,
      temperature: 0
    };
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    let json = null;
    try { json = await resp.json(); } catch (_) {}
    const content = json?.choices?.[0]?.message?.content || '';
    const okMsg = typeof content === 'string' && content.trim().toUpperCase().includes('OK');
    res.json({ ok: resp.ok && okMsg, status: resp.status, content, usage: json?.usage || null });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Helper: recount overview stats from carbon_events and write to carbon_overview table
async function recountOverview() {
  if (!supabase) return { ok: false, reason: 'supabase_not_configured' };
  try {
    const connection = new Connection(RPC_URL, 'confirmed');
    const info = await connection.getTokenSupply(new PublicKey(CBWD_MINT));
    const supplyRaw = Number(info.value.amount);
    const nowIso = new Date().toISOString();

    // Count events
    const { count: mintCount, error: mintCountErr } = await supabase
      .from('carbon_events')
      .select('*', { count: 'exact', head: true })
      .eq('decision', 'MINT')
      .not('tx_hash', 'is', null);
    if (mintCountErr) throw mintCountErr;

    const { data: mintRows, error: mintRowsErr } = await supabase
      .from('carbon_events')
      .select('amount_crbn')
      .eq('decision', 'MINT')
      .not('tx_hash', 'is', null);
    if (mintRowsErr) throw mintRowsErr;
    const total_minted = Array.isArray(mintRows) ? mintRows.reduce((acc, r) => acc + Number(r.amount_crbn || 0), 0) : 0;

    const { count: burnCount, error: burnCountErr } = await supabase
      .from('carbon_events')
      .select('*', { count: 'exact', head: true })
      .eq('decision', 'BURN')
      .not('tx_hash', 'is', null);
    if (burnCountErr) throw burnCountErr;

    const { data: burnRows, error: burnRowsErr } = await supabase
      .from('carbon_events')
      .select('amount_crbn')
      .eq('decision', 'BURN')
      .not('tx_hash', 'is', null);
    if (burnRowsErr) throw burnRowsErr;
    const total_burned = Array.isArray(burnRows) ? burnRows.reduce((acc, r) => acc + Number(r.amount_crbn || 0), 0) : 0;

    const total_events = Number(mintCount || 0) + Number(burnCount || 0);

    // Pending counters (tx_hash IS NULL)
    async function countPending(decision) {
      const { data, error } = await supabase
        .from('carbon_events')
        .select('amount_crbn')
        .is('tx_hash', null)
        .eq('decision', decision);
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      const sum = rows.reduce((acc, r) => acc + Number(r.amount_crbn || 0), 0);
      return { count: rows.length, sum };
    }
    const pMints = await countPending('MINT');
    const pBurns = await countPending('BURN');
    const pending_events = Number(pMints.count || 0) + Number(pBurns.count || 0);

    // Detect if pending columns exist in carbon_overview to avoid write errors
    let hasPendingCols = false;
    try {
      const { error: pendingColErr } = await supabase
        .from('carbon_overview')
        .select('pending_mints')
        .eq('mint_address', CBWD_MINT)
        .limit(1);
      hasPendingCols = !pendingColErr;
    } catch (_) {
      hasPendingCols = false;
    }

    const payload = {
      mint_address: CBWD_MINT,
      current_supply: supplyRaw,
      total_events,
      total_mints: Number(mintCount || 0),
      total_burns: Number(burnCount || 0),
      total_minted,
      total_burned,
      last_update: nowIso
    };
    if (hasPendingCols) {
      Object.assign(payload, {
        pending_events,
        pending_mints: Number(pMints.count || 0),
        pending_burns: Number(pBurns.count || 0),
        pending_minted: Number(pMints.sum || 0),
        pending_burned: Number(pBurns.sum || 0)
      });
    }

    const { error: ovErr } = await supabase
      .from('carbon_overview')
      .upsert(payload, { onConflict: 'mint_address' });
    if (ovErr) throw ovErr;

    return {
      ok: true,
      total_events,
      total_mints: Number(mintCount || 0),
      total_burns: Number(burnCount || 0),
      total_minted,
      total_burned,
      current_supply: supplyRaw,
      pending_events,
      pending_mints: Number(pMints.count || 0),
      pending_burns: Number(pBurns.count || 0),
      pending_minted: Number(pMints.sum || 0),
      pending_burned: Number(pBurns.sum || 0)
    };
  } catch (e) {
    return { ok: false, error: String(e?.message || JSON.stringify(e)) };
  }
}

// Helper: update Supabase tables after a successful on-chain tx
async function updateSupabaseAfterTx({ decision, amountRaw, signature, connection, eventId }) {
  if (!supabase) return { ok: false, reason: 'supabase_not_configured' };
  try {
    // Read latest supply on-chain
    const info = await connection.getTokenSupply(new PublicKey(CBWD_MINT));
    const supplyRaw = Number(info.value.amount);
    const nowIso = new Date().toISOString();

    // Update carbon_supply (upsert by mint_address)
    const { error: supplyErr } = await supabase
      .from('carbon_supply')
      .upsert({ mint_address: CBWD_MINT, current_supply: supplyRaw, updated_at: nowIso }, { onConflict: 'mint_address' });
    if (supplyErr) throw supplyErr;

    // Recompute counters from carbon_events to avoid drift
    const overview = await recountOverview();

    // Optionally patch carbon_events with the real signature
    if (eventId) {
      const { error: evErr } = await supabase
        .from('carbon_events')
        .update({ tx_hash: signature, amount_crbn: amountRaw, chain: 'solana' })
        .eq('id', eventId);
      if (evErr) throw evErr;
    }

    return { ok: true, overview };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

app.post('/apply-decision', async (req, res) => {
  try {
    const { decision, amount_crbn, event_id } = req.body || {};
    const result = await performDecision({ decision, amount_crbn, event_id });
    if (result && result.ok) return res.json(result);
    const code = result && result.error && /invalid|missing|configured/i.test(result.error) ? 400 : 500;
    return res.status(code).json(result || { ok: false, error: 'unknown_error' });
  } catch (e) {
    console.error('❌ error apply-decision:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// --------- AUTO-CYCLE ---------
async function readPendingSummary() {
  if (!supabase) return { ok: false, error: 'supabase_not_configured' };
  const connection = new Connection(RPC_URL, 'confirmed');
  const treasuryAtaPk = TREASURY_TOKEN_ACCOUNT ? new PublicKey(TREASURY_TOKEN_ACCOUNT) : null;
  async function sumPending(decision) {
    const { data, error } = await supabase
      .from('carbon_events')
      .select('amount_crbn')
      .is('tx_hash', null)
      .eq('decision', decision);
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    const sum = rows.reduce((acc, r) => acc + Number(r.amount_crbn || 0), 0);
    return { count: rows.length, sum };
  }
  const mints = await sumPending('MINT');
  const burns = await sumPending('BURN');
  let treasuryBal = null;
  if (treasuryAtaPk) {
    try {
      const bal = await connection.getTokenAccountBalance(treasuryAtaPk);
      treasuryBal = { amount_raw: Number(bal.value.amount), ui_amount: bal.value.uiAmount, decimals: bal.value.decimals };
    } catch (_) {}
  }
  return { ok: true, pending: { mints, burns }, treasury_balance: treasuryBal };
}

async function runPending(decision, limit) {
  if (!supabase) return { ok: false, error: 'supabase_not_configured' };
  let q = supabase
    .from('carbon_events')
    .select('id, decision, amount_crbn, created_at')
    .is('tx_hash', null)
    .eq('decision', decision)
    .order('created_at', { ascending: true })
    .limit(limit);
  const { data, error } = await q;
  if (error) return { ok: false, error: String(error?.message || JSON.stringify(error)) };
  const rows = Array.isArray(data) ? data : [];
  const results = [];
  for (const r of rows) {
    const out = await performDecision({ decision: r.decision, amount_crbn: r.amount_crbn, event_id: r.id });
    results.push({ id: r.id, decision: r.decision, amount_crbn: r.amount_crbn, ok: !!out?.ok, error: out?.error || null, signature: out?.signature || null });
  }
  return { ok: true, processed: results.length, results };
}

async function autoCycle() {
  if (autoState.running) return { ok: false, error: 'already_running' };
  autoState.running = true;
  autoState.lastRunAt = new Date().toISOString();
  try {
    const summary = await readPendingSummary();
    if (!summary.ok) throw new Error(summary.error || 'summary_failed');
    const burnsSum = summary.pending.burns.sum || 0;
    const mintsSum = summary.pending.mints.sum || 0;
    const treasuryRaw = summary.treasury_balance?.amount_raw || 0;

    let topup = null;
    if (burnsSum > treasuryRaw) {
      const deficit = burnsSum - treasuryRaw;
      const extra = Math.floor(deficit * AUTO_TOPUP_EXTRA_BPS / 10000);
      const toMint = deficit + extra;
      const mRes = await performDecision({ decision: 'MINT', amount_crbn: toMint, event_id: null });
      topup = { requested: toMint, ok: !!mRes?.ok, signature: mRes?.signature || null, error: mRes?.error || null };
    }

    // Exécuter d'abord les MINTs en attente (si on en a)
    let mintBatch = null;
    if (mintsSum > 0) {
      mintBatch = await runPending('MINT', AUTO_MINT_LIMIT);
    }
    // Puis les BURNs
    let burnBatch = null;
    if (burnsSum > 0) {
      burnBatch = await runPending('BURN', AUTO_BURN_LIMIT);
    }

    const overview = supabase ? await recountOverview() : null;
    autoState.lastResult = { summary, topup, mintBatch, burnBatch, overview };
    autoState.running = false;
    return { ok: true, state: autoState };
  } catch (e) {
    autoState.lastResult = { error: String(e?.message || e) };
    autoState.running = false;
    return { ok: false, error: String(e?.message || e), state: autoState };
  }
}

function startAutoTimer() {
  if (!AUTO_ENABLED) return;
  setInterval(() => { autoCycle(); }, AUTO_INTERVAL_MS);
}

app.get('/auto/status', (req, res) => {
  res.json({ ok: true, enabled: AUTO_ENABLED, interval_ms: AUTO_INTERVAL_MS, burn_limit: AUTO_BURN_LIMIT, mint_limit: AUTO_MINT_LIMIT, lastRunAt: autoState.lastRunAt, lastResult: autoState.lastResult, running: autoState.running });
});

app.post('/auto/run', async (req, res) => {
  const result = await autoCycle();
  const code = result.ok ? 200 : 500;
  res.status(code).json(result);
});

// Mint-split: emit tokens split across user, treasury (burn buffer), ops, payroll
// Body: { recipient_token_account: string (ATA for CBWD), amount_crbn: integer base units }
app.post('/mint-split', async (req, res) => {
  try {
    const { recipient_token_account, amount_crbn } = req.body || {};
    const amountRaw = parseInt(amount_crbn);
    if (!recipient_token_account) return res.status(400).json({ ok: false, error: 'missing recipient_token_account (ATA for CBWD)' });
    let recipientAtaPk;
    try { recipientAtaPk = new PublicKey(String(recipient_token_account)); } catch (_) { return res.status(400).json({ ok: false, error: 'invalid recipient_token_account' }); }
    if (!Number.isFinite(amountRaw) || amountRaw <= 0) return res.status(400).json({ ok: false, error: 'Invalid amount_crbn (positive integer base units required)' });

    const totalBps = OPS_BPS + PAYROLL_BPS + BURN_BUFFER_BPS;
    if (totalBps >= 10000) return res.status(400).json({ ok: false, error: 'Sum of OPS_BPS + PAYROLL_BPS + BURN_BUFFER_BPS must be < 10000' });

    const toOps = Math.floor(amountRaw * OPS_BPS / 10000);
    const toPayroll = Math.floor(amountRaw * PAYROLL_BPS / 10000);
    const toTreasury = Math.floor(amountRaw * BURN_BUFFER_BPS / 10000);
    const toUser = amountRaw - (toOps + toPayroll + toTreasury);
    if (toUser <= 0) return res.status(400).json({ ok: false, error: 'Recipient share computed to zero or negative. Adjust BPS.' });

    if (DRY_RUN) {
      console.log(`🧪 DRY_RUN mint-split: user=${toUser}, treasury=${toTreasury}, ops=${toOps}, payroll=${toPayroll}`);
      return res.json({ ok: true, dryRun: true, mint: CBWD_MINT, splits: { user: toUser, treasury: toTreasury, ops: toOps, payroll: toPayroll }, bps: { ops: OPS_BPS, payroll: PAYROLL_BPS, burn_buffer: BURN_BUFFER_BPS } });
    }

    if (!MINT_AUTHORITY_SECRET_KEY) return res.status(400).json({ ok: false, error: 'Missing MINT_AUTHORITY_SECRET_KEY' });
    if (!TREASURY_TOKEN_ACCOUNT) return res.status(400).json({ ok: false, error: 'Missing TREASURY_TOKEN_ACCOUNT' });
    if (!OPS_TOKEN_ACCOUNT) return res.status(400).json({ ok: false, error: 'Missing OPS_TOKEN_ACCOUNT' });
    if (!PAYROLL_TOKEN_ACCOUNT) return res.status(400).json({ ok: false, error: 'Missing PAYROLL_TOKEN_ACCOUNT' });

    let mintAuthArr;
    try { mintAuthArr = JSON.parse(MINT_AUTHORITY_SECRET_KEY); } catch (_) { return res.status(400).json({ ok: false, error: 'MINT_AUTHORITY_SECRET_KEY must be JSON array' }); }
    const mintAuthority = Keypair.fromSecretKey(Uint8Array.from(mintAuthArr));

    const connection = new Connection(RPC_URL, 'confirmed');
    const mintPk = new PublicKey(CBWD_MINT);
    const treasuryAtaPk = new PublicKey(TREASURY_TOKEN_ACCOUNT);
    const opsAtaPk = new PublicKey(OPS_TOKEN_ACCOUNT);
    const payrollAtaPk = new PublicKey(PAYROLL_TOKEN_ACCOUNT);

    const tx = new Transaction();
    // Mint to user
    tx.add(createMintToInstruction(mintPk, recipientAtaPk, mintAuthority.publicKey, BigInt(toUser), [], TOKEN_PROGRAM_ID));
    // Mint to treasury (burn buffer)
    if (toTreasury > 0) tx.add(createMintToInstruction(mintPk, treasuryAtaPk, mintAuthority.publicKey, BigInt(toTreasury), [], TOKEN_PROGRAM_ID));
    // Mint to ops
    if (toOps > 0) tx.add(createMintToInstruction(mintPk, opsAtaPk, mintAuthority.publicKey, BigInt(toOps), [], TOKEN_PROGRAM_ID));
    // Mint to payroll
    if (toPayroll > 0) tx.add(createMintToInstruction(mintPk, payrollAtaPk, mintAuthority.publicKey, BigInt(toPayroll), [], TOKEN_PROGRAM_ID));

    const feePayerKp = PAYER_SECRET_KEY ? parseSecretKey(PAYER_SECRET_KEY) : null;
    tx.feePayer = feePayerKp ? feePayerKp.publicKey : mintAuthority.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    const signers = feePayerKp ? [mintAuthority, feePayerKp] : [mintAuthority];
    const signature = await sendAndConfirmTransaction(connection, tx, signers, { commitment: 'confirmed' });
    console.log(`✅ mint-split total=${amountRaw} (user=${toUser}, treasury=${toTreasury}, ops=${toOps}, payroll=${toPayroll}) → ${signature}`);

    let supabaseResult = { ok: false, reason: 'skipped' };
    if (supabase) {
      // Update supply and overview; no carbon_events row updated (operational mint)
      supabaseResult = await updateSupabaseAfterTx({ decision: 'MINT', amountRaw: amountRaw, signature, connection, eventId: null });
    }
    return res.json({ ok: true, signature, splits: { user: toUser, treasury: toTreasury, ops: toOps, payroll: toPayroll }, bps: { ops: OPS_BPS, payroll: PAYROLL_BPS, burn_buffer: BURN_BUFFER_BPS }, supabase: supabaseResult });
  } catch (e) {
    console.error('❌ mint-split error:', String(e?.message || e));
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Internal helper to execute a decision (shared by apply-decision and process-pending)
async function performDecision({ decision, amount_crbn, event_id }) {
  try {
    if (!decision || !['MINT', 'BURN'].includes(decision)) {
      return { ok: false, error: 'Invalid decision. Must be MINT or BURN.' };
    }
    const amountRaw = parseInt(amount_crbn);
    if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
      return { ok: false, error: 'Invalid amount_crbn (must be positive integer in base units).' };
    }
    if (DRY_RUN) {
      console.log(`🧪 DRY_RUN: ${decision} ${amountRaw} (base units) on mint ${CBWD_MINT} using treasury ${TREASURY_TOKEN_ACCOUNT}`);
      return { ok: true, dryRun: true, decision, amount_crbn: amountRaw, mint: CBWD_MINT, treasury: TREASURY_TOKEN_ACCOUNT };
    }
    if (decision === 'MINT') {
      if (!MINT_AUTHORITY_SECRET_KEY) {
        return { ok: false, error: 'Missing MINT_AUTHORITY_SECRET_KEY for MINT operation.' };
      }
    } else if (decision === 'BURN') {
      if (!TREASURY_OWNER_SECRET_KEY) {
        return { ok: false, error: 'Missing TREASURY_OWNER_SECRET_KEY (owner of treasury ATA) for BURN operation.' };
      }
    }
    if (!TREASURY_TOKEN_ACCOUNT) {
      return { ok: false, error: 'Server not configured: missing TREASURY_TOKEN_ACCOUNT.' };
    }
    const connection = new Connection(RPC_URL, 'confirmed');
    const mintPk = new PublicKey(CBWD_MINT);
    const treasuryAccountPk = new PublicKey(TREASURY_TOKEN_ACCOUNT);
    const tx = new Transaction();
    let signers = [];
    const feePayerKp = PAYER_SECRET_KEY ? parseSecretKey(PAYER_SECRET_KEY) : null;
    if (decision === 'MINT') {
      let secretArray;
      try { secretArray = JSON.parse(MINT_AUTHORITY_SECRET_KEY); }
      catch (e) { return { ok: false, error: 'MINT_AUTHORITY_SECRET_KEY must be a JSON array of numbers.' }; }
      const mintAuthority = Keypair.fromSecretKey(Uint8Array.from(secretArray));
      const ix = createMintToInstruction(mintPk, treasuryAccountPk, mintAuthority.publicKey, BigInt(amountRaw), [], TOKEN_PROGRAM_ID);
      tx.add(ix);
      tx.feePayer = feePayerKp ? feePayerKp.publicKey : mintAuthority.publicKey;
      signers = feePayerKp ? [mintAuthority, feePayerKp] : [mintAuthority];
    } else {
      let ownerSecretArray;
      try { ownerSecretArray = JSON.parse(TREASURY_OWNER_SECRET_KEY); }
      catch (e) { return { ok: false, error: 'TREASURY_OWNER_SECRET_KEY must be a JSON array of numbers.' }; }
      const treasuryOwner = Keypair.fromSecretKey(Uint8Array.from(ownerSecretArray));
      const ix = createBurnInstruction(treasuryAccountPk, mintPk, treasuryOwner.publicKey, BigInt(amountRaw), [], TOKEN_PROGRAM_ID);
      tx.add(ix);
      tx.feePayer = feePayerKp ? feePayerKp.publicKey : treasuryOwner.publicKey;
      signers = feePayerKp ? [treasuryOwner, feePayerKp] : [treasuryOwner];
    }
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    const signature = await sendAndConfirmTransaction(connection, tx, signers, { commitment: 'confirmed' });
    console.log(`✅ ${decision} ${amountRaw} (base units) → signature ${signature}`);
    let supabaseResult = { ok: false, reason: 'skipped' };
    if (supabase) {
      supabaseResult = await updateSupabaseAfterTx({ decision, amountRaw, signature, connection, eventId: event_id || null });
    }
    return { ok: true, decision, amount_crbn: amountRaw, signature, supabase: supabaseResult };
  } catch (e) {
    const msg = String(e?.message || e);
    console.error('❌ performDecision error:', msg);
    // Do not mark as signed; caller can decide to retry later
    return { ok: false, error: msg };
  }
}

// Batch process pending events: tx_hash is null and decision is MINT/BURN
app.post('/process-pending', async (req, res) => {
  try {
    if (!supabase) return res.status(400).json({ ok: false, error: 'supabase_not_configured' });
    const { decision, limit } = req.body || {};
    let q = supabase
      .from('carbon_events')
      .select('id, decision, amount_crbn, created_at')
      .is('tx_hash', null)
      .in('decision', ['MINT', 'BURN'])
      .order('created_at', { ascending: true });
    if (decision && ['MINT', 'BURN'].includes(String(decision).toUpperCase())) q = q.eq('decision', String(decision).toUpperCase());
    const { data, error } = await q.limit((limit && parseInt(limit)) || 10);
    if (error) return res.status(400).json({ ok: false, error: String(error?.message || JSON.stringify(error)) });
    const rows = Array.isArray(data) ? data : [];
    const results = [];
    for (const r of rows) {
      const out = await performDecision({ decision: r.decision, amount_crbn: r.amount_crbn, event_id: r.id });
      results.push({ id: r.id, decision: r.decision, amount_crbn: r.amount_crbn, ok: !!out?.ok, error: out?.error || null, signature: out?.signature || null });
    }
    return res.json({ ok: true, processed: results.length, results });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Endpoint to recompute overview counters from carbon_events
app.post('/recount-overview', async (req, res) => {
  try {
    if (!supabase) return res.status(400).json({ ok: false, error: 'supabase_not_configured' });
    const result = await recountOverview();
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || JSON.stringify(e)) });
  }
});

// Minimal debug endpoint to verify we can read carbon_events
app.get('/debug-supabase', async (req, res) => {
  try {
    if (!supabase) return res.status(400).json({ ok: false, error: 'supabase_not_configured' });
    const { data, error, count } = await supabase
      .from('carbon_events')
      .select('id, tx_hash, amount_crbn, decision', { count: 'exact' })
      .limit(5);
    if (error) return res.status(400).json({ ok: false, error: String(error?.message || JSON.stringify(error)) });
    res.json({ ok: true, rows: data || [], count: count ?? null });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || JSON.stringify(e)) });
  }
});

// Pending summary: counts and sums by decision, plus treasury available
app.get('/pending-summary', async (req, res) => {
  try {
    if (!supabase) return res.status(400).json({ ok: false, error: 'supabase_not_configured' });
    const connection = new Connection(RPC_URL, 'confirmed');
    const treasuryAtaPk = TREASURY_TOKEN_ACCOUNT ? new PublicKey(TREASURY_TOKEN_ACCOUNT) : null;

    async function sumPending(decision) {
      const { data, error } = await supabase
        .from('carbon_events')
        .select('amount_crbn')
        .is('tx_hash', null)
        .eq('decision', decision);
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      const sum = rows.reduce((acc, r) => acc + Number(r.amount_crbn || 0), 0);
      return { count: rows.length, sum };
    }

    const mints = await sumPending('MINT');
    const burns = await sumPending('BURN');
    let treasuryBal = null;
    if (treasuryAtaPk) {
      try {
        const bal = await connection.getTokenAccountBalance(treasuryAtaPk);
        treasuryBal = { amount_raw: bal.value.amount, ui_amount: bal.value.uiAmount, decimals: bal.value.decimals };
      } catch (_) {}
    }
    res.json({ ok: true, pending: { mints, burns }, treasury_balance: treasuryBal });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Overview quick readback to confirm writes
app.get('/overview', async (req, res) => {
  try {
    if (!supabase) return res.status(400).json({ ok: false, error: 'supabase_not_configured' });
    const { data, error } = await supabase
      .from('carbon_overview')
      .select('*')
      .eq('mint_address', CBWD_MINT)
      .limit(1);
    if (error) return res.status(400).json({ ok: false, error: String(error?.message || JSON.stringify(error)) });

    // Enrichir avec les adresses et soldes utiles (devnet)
    const connection = new Connection(RPC_URL, 'confirmed');
    const rpcIsDevnet = /devnet/i.test(RPC_URL);
    const explorerBase = 'https://explorer.solana.com/address/';
    const clusterParam = rpcIsDevnet ? '?cluster=devnet' : '';

    // Owners (facultatifs, selon présence des secrets)
    const mintAuthKp = parseSecretKey(MINT_AUTHORITY_SECRET_KEY);
    const payerKp = parseSecretKey(PAYER_SECRET_KEY);
    const treasuryOwnerKp = parseSecretKey(TREASURY_OWNER_SECRET_KEY);
    const opsOwnerKp = parseSecretKey(process.env.OPS_OWNER_SECRET_KEY || '');
    const payrollOwnerKp = parseSecretKey(process.env.PAYROLL_OWNER_SECRET_KEY || '');

    const addresses = {
      rpc: RPC_URL,
      mint: CBWD_MINT,
      decimals: DECIMALS,
      treasury_ata: TREASURY_TOKEN_ACCOUNT || null,
      ops_ata: OPS_TOKEN_ACCOUNT || null,
      payroll_ata: PAYROLL_TOKEN_ACCOUNT || null,
      mint_authority: mintAuthKp ? mintAuthKp.publicKey.toBase58() : null,
      fee_payer: payerKp ? payerKp.publicKey.toBase58() : null,
      treasury_owner: treasuryOwnerKp ? treasuryOwnerKp.publicKey.toBase58() : null,
      ops_owner: opsOwnerKp ? opsOwnerKp.publicKey.toBase58() : null,
      payroll_owner: payrollOwnerKp ? payrollOwnerKp.publicKey.toBase58() : null
    };

    async function readAtaBalance(ata) {
      try {
        if (!ata) return null;
        const bal = await connection.getTokenAccountBalance(new PublicKey(ata));
        return { amount_raw: bal.value.amount, ui_amount: bal.value.uiAmount, decimals: bal.value.decimals };
      } catch (_) {
        return null;
      }
    }
    async function readSolBalance(pubkeyStr) {
      try {
        if (!pubkeyStr) return null;
        const lamports = await connection.getBalance(new PublicKey(pubkeyStr));
        return { lamports, sol: lamports / 1_000_000_000 };
      } catch (_) {
        return null;
      }
    }

    const balances = {
      cbwd: {
        treasury_ata: await readAtaBalance(addresses.treasury_ata),
        ops_ata: await readAtaBalance(addresses.ops_ata),
        payroll_ata: await readAtaBalance(addresses.payroll_ata)
      },
      sol: {
        mint_authority: await readSolBalance(addresses.mint_authority),
        fee_payer: await readSolBalance(addresses.fee_payer),
        treasury_owner: await readSolBalance(addresses.treasury_owner),
        ops_owner: await readSolBalance(addresses.ops_owner),
        payroll_owner: await readSolBalance(addresses.payroll_owner)
      }
    };

    const explorer = {
      mint: explorerBase + CBWD_MINT + clusterParam,
      treasury_ata: addresses.treasury_ata ? (explorerBase + addresses.treasury_ata + clusterParam) : null,
      ops_ata: addresses.ops_ata ? (explorerBase + addresses.ops_ata + clusterParam) : null,
      payroll_ata: addresses.payroll_ata ? (explorerBase + addresses.payroll_ata + clusterParam) : null,
      mint_authority: addresses.mint_authority ? (explorerBase + addresses.mint_authority + clusterParam) : null,
      fee_payer: addresses.fee_payer ? (explorerBase + addresses.fee_payer + clusterParam) : null,
      treasury_owner: addresses.treasury_owner ? (explorerBase + addresses.treasury_owner + clusterParam) : null,
      ops_owner: addresses.ops_owner ? (explorerBase + addresses.ops_owner + clusterParam) : null,
      payroll_owner: addresses.payroll_owner ? (explorerBase + addresses.payroll_owner + clusterParam) : null
    };

    res.json({ ok: true, row: (data && data[0]) || null, addresses, balances, explorer });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || JSON.stringify(e)) });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Mint/Burn server running on http://localhost:${PORT}`);
  startAutoTimer();
});