require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://drmlsquvwybixocjwdud.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRybWxzcXV2d3liaXhvY2p3ZHVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzMDU0NzUsImV4cCI6MjA3NTg4MTQ3NX0.rimLZpAQEyVy8ci1j76HbgagFdtQJefKhZFkr20mlrE';
const OPENROUTER_KEY = (process.env.OPENROUTER_KEY || '').trim();

const AI_MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS || '350');
const SLEEP_MS = parseInt(process.env.AUDIT_SLEEP_MS || '300');

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function stripTags(html) {
  if (!html) return '';
  let h = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--([\s\S]*?)-->/g, '');
  const blockMatch = /<(article|main|section|div)([^>]*?(article|content|story|post|text)[^>]*)>([\s\S]*?)<\/\1>/i.exec(h);
  const target = blockMatch ? blockMatch[4] : h;
  const text = target
    .replace(/<br\s*\/?>(?=\s*[^\n])/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function truncate(str, max) { return (!str || str.length <= max) ? (str||'') : (str.slice(0, max) + '…'); }

async function aiAnalyze({ title, url, source, content }) {
  if (!OPENROUTER_KEY) throw new Error('missing OPENROUTER_KEY');
  const systemPrompt = [
    'Tu es CARBON Agent. Analyse l\'ARTICLE COMPLET (pas seulement le titre) en évaluant orientation (positive/négative), statut (implémenté/planifié/appel/aléa), temporalité (passé/présent/futur, indicatif/conditionnel), ampleur (locale/régionale/nationale/internationale).',
    'Réponds uniquement en JSON strict. Inclure au minimum: {"decision":"BURN"|"MINT"|"NEUTRAL","amount_crbn":int,"final_score":float,"confidence":int,"justification":"..."}. Si possible ajoute: {"event_status":"implemented"|"planned"|"appeal"|"hazard","orientation":"positive"|"negative"|"neutral","modality":"indicative"|"conditional","tense":"past"|"present"|"future","scope":"local"|"regional"|"national"|"international"}.',
    'Règles: BURN = progrès concrets mis en œuvre (droits/justice/protection/climat); MINT = régression avérée (violences/pénuries/effondrement/atteintes systémiques); NEUTRAL = appel/opportunité ou aléa naturel SANS mesure nouvelle. Le CONTENU prime sur le titre.',
    'Montant nul si NEUTRAL. Ajuster l\'échelle du montant et le score selon la gravité et la portée.'
  ].join('\n');
  const userPrompt = [
    `Titre: ${title}`,
    `URL: ${url}`,
    `Source: ${source}`,
    `Contenu (tronqué):\n${truncate(content || '', 5000)}`,
    'Décide et justifie. JSON strict uniquement.'
  ].join('\n');
  const body = { model: 'openai/gpt-3.5-turbo', temperature: 0, max_tokens: AI_MAX_TOKENS, messages: [ { role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt } ] };
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { 'Authorization': `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json', 'X-Title': 'CARBON-Audit' }, body: JSON.stringify(body) });
  const j = await resp.json();
  const raw = j?.choices?.[0]?.message?.content || '';
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
  let analysis;
  try { analysis = JSON.parse(cleaned); } catch (_) { analysis = { decision: 'NEUTRAL', amount_crbn: 0, final_score: 0, confidence: 5, justification: 'AI parse failed' }; }
  return analysis;
}

function normalizeDecision(analysis, { title, content }) {
  const dRaw = String(analysis?.decision || '').toUpperCase();
  const score = Number(analysis?.final_score);
  const text = `${title} ${content}`.toLowerCase();

  // Orientation & statut fournis par l'IA (si présents)
  const orientation = (analysis?.orientation || '').toLowerCase();
  const status = (analysis?.event_status || '').toLowerCase();
  const modality = (analysis?.modality || '').toLowerCase();
  const tense = (analysis?.tense || '').toLowerCase();

  // Détecteurs linguistiques (français)
  const conditionalTokens = ['pourrait','pourraient','devrait','devraient','risque','risquent','susceptible','susceptibles','en passe de','sur le point de'];
  const futureTokens = ['va','vont','prévoit','prévoient','entend','entendent'];
  const appealTokens = ['appel','appelle','appellent','sollicite','sollicitent','demande','demandent','exhorte','exhortent'];
  const hazardTokens = ['mousson','inondation','inondations','séisme','tremblement','cyclone','ouragan'];
  const actionTokens = ['adopte','adopté','adoptée','accorde','accordé','décide','décidé','met en oeuvre','mise en oeuvre','applique','appliqué','entre en vigueur','rétabli','rétablit','lance','lancé','promulgue','promulgué'];
  const negativeOrientationTokens = ['s\'aggrave','aggrave','gagne du terrain','au bord de la rupture','effondrement','régression','recule','privation','interdiction','droits effacés','pénurie','pénuries'];
  const positiveOrientationTokens = ['améliore','progrès','réouverture','libération','accès rétabli','protège','renforcé','renforcement','mise en place','mise en application'];
  const climateTokens = ['climat','écologie','environnement','émission','émissions','gaz à effet de serre','co2','carbone','neutralité','biodiversité','reforestation','renouvelable','énergie','solaire','éolien','déforestation','protection','droits humains','droits de l\'homme','onu','nations unies'];

  const isConditional = conditionalTokens.some(k => text.includes(k)) || modality === 'conditional';
  const isFuture = futureTokens.some(k => text.includes(k)) || tense === 'future';
  const hasAppeal = appealTokens.some(k => text.includes(k)) || status === 'appeal';
  const hasHazard = hazardTokens.some(k => text.includes(k)) || status === 'hazard';
  const hasAction = actionTokens.some(k => text.includes(k)) || status === 'implemented';
  const isPlanned = (!hasAction) && (isConditional || isFuture || status === 'planned');
  const hasNegative = negativeOrientationTokens.some(k => text.includes(k)) || orientation === 'negative';
  const hasPositive = positiveOrientationTokens.some(k => text.includes(k)) || orientation === 'positive';
  const hasClimateContext = climateTokens.some(k => text.includes(k));

  // Première passe: heuristiques
  let candidate = 'NEUTRAL';
  if (!(hasHazard || hasAppeal)) {
    if (isPlanned && !hasAction) {
      candidate = 'NEUTRAL';
    } else if (hasAction && hasPositive && !hasNegative) {
      candidate = 'BURN';
    } else if (hasNegative && (hasAction || (!isPlanned && !hasAppeal && !hasHazard))) {
      candidate = 'MINT';
    } else if (Number.isFinite(score)) {
      if (score > 0.5) candidate = 'BURN';
      else if (score < -0.5) candidate = 'MINT';
      else candidate = 'NEUTRAL';
    } else if (dRaw === 'BURN' || dRaw === 'MINT' || dRaw === 'NEUTRAL') {
      candidate = dRaw;
    }
  }

  // Contexte institutionnel: l'ONU détectée dans le texte → source autorisée
  const unTokens = ['onu','nations unies','united nations','ohchr','hrc','conseil des droits de l\'homme'];
  const hasUnContext = unTokens.some(k => text.includes(k));

  // Garde stricte Livre Blanc: pas de BURN sans action claire et contexte climat/SDG/ONU
  const srcTag = String(analysis?.event_source_tag || '').toLowerCase();
  const sourceAllowed = ['sdg','un','human_rights','nature_rights'].includes(srcTag) || hasUnContext;
  if (candidate === 'BURN') {
    if (!hasAction || !hasPositive) candidate = 'NEUTRAL';
    if (!(sourceAllowed || hasClimateContext)) candidate = 'NEUTRAL';
  }

  return candidate;
}

function sanitizeAmount(decision, amount_crbn) {
  let amt = parseInt(amount_crbn) || 0;
  if (decision === 'NEUTRAL') return 0;
  if (!Number.isFinite(amt) || amt <= 0) amt = 100000;
  return Math.abs(amt);
}

async function supabaseQuery(params) {
  const qs = new URLSearchParams(params).toString();
  const url = `${SUPABASE_URL}/rest/v1/carbon_events?${qs}`;
  const res = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
  if (!res.ok) throw new Error(`supabase_query_failed: ${res.status}`);
  return await res.json();
}

async function supabasePatch(id, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/carbon_events?id=eq.${id}`, { method: 'PATCH', headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`supabase_patch_failed: ${res.status}`);
  return await res.text();
}

async function audit({ source, decision, limit, apply }) {
  const select = 'id,event_title,decision,amount_crbn,created_at,event_url,event_source';
  const params = { select, order: 'created_at.desc' };
  if (source) params['event_source'] = `eq.${source}`;
  if (decision) params['decision'] = `eq.${decision}`;
  if (limit) params['limit'] = String(limit);
  const rows = await supabaseQuery(params);
  console.log(`Audit: ${rows.length} événements${source?` source=${source}`:''}${decision?` decision=${decision}`:''}`);
  for (const r of rows) {
    try {
      const html = await fetch(r.event_url).then(x => x.text()).catch(() => '');
      const content = stripTags(html);
      const analysis = await aiAnalyze({ title: r.event_title, url: r.event_url, source: r.event_source, content });
      const normalized = normalizeDecision(analysis, { title: r.event_title, content });
      const current = String(r.decision || '').toUpperCase();
      const suggested = normalized;
      const amountSan = sanitizeAmount(suggested, analysis.amount_crbn);
      const diff = current !== suggested;
      console.log(`${diff?'⚠️':''} id=${r.id} decision=${current} → ${suggested} amount=${amountSan} url=${r.event_url}`);
      if (diff && apply) {
        await supabasePatch(r.id, { decision: suggested, amount_crbn: amountSan, final_score: Number(analysis.final_score) || 0, confidence: parseInt(analysis.confidence) || 5, justification: String(analysis.justification || '') });
        console.log(`✓ patched id=${r.id}`);
        await sleep(SLEEP_MS);
      }
    } catch (e) {
      console.error(`✗ audit error id=${r.id}`, e.message);
    }
  }
}

(async () => {
  if (!OPENROUTER_KEY) { console.error('❌ OPENROUTER_KEY manquant'); process.exit(1); }
  const args = process.argv.slice(2);
  const argMap = Object.fromEntries(args.map(s => { const [k,v] = s.split('='); return [k, v]; }));
  const source = argMap.source || null;
  const decision = argMap.decision || null;
  const limitRaw = argMap.limit;
  const limit = Number.isFinite(parseInt(limitRaw)) ? parseInt(limitRaw) : null;
  const apply = ['1','true','yes'].includes(String(argMap.apply || '').toLowerCase());
  await audit({ source, decision, limit, apply });
  process.exit(0);
})();