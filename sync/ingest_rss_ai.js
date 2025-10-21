require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const https = require('https');
const { URL } = require('url');

const OPENROUTER_KEY = (process.env.OPENROUTER_KEY || '').trim();
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://drmlsquvwybixocjwdud.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRybWxzcXV2d3liaXhvY2p3ZHVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzMDU0NzUsImV4cCI6MjA3NTg4MTQ3NX0.rimLZpAQEyVy8ci1j76HbgagFdtQJefKhZFkr20mlrE';

const MAX_ITEMS = parseInt(process.env.INGEST_MAX_ITEMS || '10');
const AI_MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS || '350');
const SLEEP_MS = parseInt(process.env.INGEST_SLEEP_MS || '300');

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function fetchText(u) {
  return fetch(u).then(res => res.text());
}

function parseRSS(xmlString) {
  const out = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xmlString)) !== null) {
    const itemXml = m[1];
    const t = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/s.exec(itemXml);
    const title = (t && (t[1] || t[2] || '').trim()) || '';
    const l = /<link><!\[CDATA\[(.*?)\]\]><\/link>|<link>(.*?)<\/link>/s.exec(itemXml);
    let link = l ? ((l[1] || l[2] || '').trim()) : '';
    if (!link) {
      const g = /<guid.*?>(.*?)<\/guid>/s.exec(itemXml);
      if (g) link = (g[1] || '').trim();
    }
    const d = /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/s.exec(itemXml);
    const description = d ? ((d[1] || d[2] || '').trim()) : '';
    if (title && link) out.push({ title, link, description });
  }
  return out;
}

function stripTags(html) {
  if (!html) return '';
  let h = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--([\s\S]*?)-->/g, '');
  // try article/main/content blocks first
  const blockMatch = /<(article|main|section|div)([^>]*?(article|content|story|post|text)[^>]*)>([\s\S]*?)<\/\1>/i.exec(h);
  const target = blockMatch ? blockMatch[4] : h;
  const text = target
    .replace(/<br\s*\/?>/gi, '\n')
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

function truncate(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  return str.slice(0, max) + '…';
}

function domainFromUrl(u) {
  try { return new URL(u).hostname; } catch { return ''; }
}

function normalizeSourceTag(tagRaw) {
  const t = String(tagRaw || '').toLowerCase().trim();
  if (!t) return '';
  if (['human_rights','humanrights','rights','droits','droits_humains'].includes(t)) return 'human_rights';
  if (['sdg','odd','objectifs','sustainable_development_goals'].includes(t)) return 'sdg';
  if (['un','onu','united_nations','onu_agency','agence_onu'].includes(t)) return 'un';
  if (['other','news','media'].includes(t)) return 'other';
  return '';
}

async function aiAnalyze({ title, url, source, description, content }) {
  if (!OPENROUTER_KEY) throw new Error('missing OPENROUTER_KEY');
  const systemPrompt = [
    'Tu es CARBON Agent. Analyse un ARTICLE COMPLET (pas seulement le titre) en évaluant orientation, statut, temporalité et ampleur.',
    'Décision stricte JSON: {"decision":"BURN"|"MINT"|"NEUTRAL","amount_crbn":100000,"final_score":5.5,"confidence":7,"justification":"..."}. Ajoute si possible: {"event_status":"implemented"|"planned"|"appeal"|"hazard","orientation":"positive"|"negative"|"neutral","modality":"indicative"|"conditional","tense":"past"|"present"|"future","scope":"local"|"regional"|"national"|"international"}.',
    'Règles: Impact positif concret mis en œuvre → BURN; Régression avérée → MINT; Appels/opportunités ou aléas sans mesure → NEUTRAL. Le CONTENU prime sur le titre.',
    'NEUTRAL = montant 0. Ajuster le montant et le score selon gravité/portée.'
  ].join('\n');
  const userPrompt = [
    `Titre: ${title}`,
    `URL: ${url}`,
    `Source: ${source}`,
    `Résumé RSS: ${description || '(aucun)'}`,
    `Contenu (tronqué):\n${truncate(content || '', 5000)}`,
    'Analyse et décide. Réponds uniquement en JSON strict.'
  ].join('\n');

  const body = {
    model: 'openai/gpt-3.5-turbo',
    temperature: 0,
    max_tokens: AI_MAX_TOKENS,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  };
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
      'X-Title': 'CARBON-Ingest'
    },
    body: JSON.stringify(body)
  });
  const j = await resp.json();
  const raw = j?.choices?.[0]?.message?.content || '';
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
  let analysis;
  try { analysis = JSON.parse(cleaned); } catch (_) {
    analysis = { decision: 'NEUTRAL', amount_crbn: 0, final_score: 0, confidence: 5, justification: 'AI parse failed' };
  }
  return analysis;
}

function normalizeDecision(analysis, { title, description, content }) {
  const dRaw = String(analysis?.decision || '').toUpperCase();
  const score = Number(analysis?.final_score);
  const text = `${title} ${description} ${content}`.toLowerCase();
  const orientation = (analysis?.orientation || '').toLowerCase();
  const status = (analysis?.event_status || '').toLowerCase();
  const modality = (analysis?.modality || '').toLowerCase();
  const tense = (analysis?.tense || '').toLowerCase();

  const conditionalTokens = ['pourrait','pourraient','devrait','devraient','risque','risquent','susceptible','susceptibles','en passe de','sur le point de'];
  const futureTokens = ['va','vont','prévoit','prévoient','entend','entendent'];
  const appealTokens = ['appel','appelle','appellent','sollicite','sollicitent','demande','demandent','exhorte','exhortent'];
  const hazardTokens = ['mousson','inondation','inondations','séisme','tremblement','cyclone','ouragan'];
  const actionTokens = ['adopte','adopté','adoptée','accorde','accordé','décide','décidé','met en oeuvre','mise en oeuvre','applique','appliqué','entre en vigueur','rétabli','rétablit','lance','lancé','promulgue','promulgué'];
  const negativeOrientationTokens = ["s'aggrave",'aggrave','gagne du terrain','au bord de la rupture','effondrement','régression','recule','privation','interdiction','droits effacés','pénurie','pénuries'];
  const positiveOrientationTokens = ['améliore','progrès','réouverture','libération','accès rétabli','protège','renforcé','renforcement','mise en place','mise en application'];
  const climateTokens = ['climat','écologie','environnement','émission','émissions','gaz à effet de serre','co2','carbone','neutralité','biodiversité','reforestation','renouvelable','énergie','solaire','éolien','déforestation','protection','droits humains','droits de l\'homme','onu','nations unies','accord de paris'];

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

  // Garde stricte Livre Blanc: pas de BURN sans action claire et contexte climat/SDG/ONU
  const srcTag = String(analysis?.event_source_tag || '').toLowerCase();
  const sourceAllowed = ['sdg','un','human_rights','nature_rights'].includes(srcTag);
  if (candidate === 'BURN') {
    if (!hasAction || !hasPositive) candidate = 'NEUTRAL';
    if (!(sourceAllowed || hasClimateContext)) candidate = 'NEUTRAL';
  }

  return candidate;
}

function sanitizeAmount(decision, amount_crbn) {
  let amt = parseInt(amount_crbn) || 0;
  if (decision === 'NEUTRAL') return 0;
  if (!Number.isFinite(amt) || amt <= 0) amt = 100000; // base units fallback (0.1 CBWD)
  return Math.abs(amt);
}

async function supabaseExistsByUrl(url) {
  const q = `${SUPABASE_URL}/rest/v1/carbon_events?select=id&event_url=eq.${encodeURIComponent(url)}`;
  const res = await fetch(q, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function supabaseInsertEvent(ev) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/carbon_events`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(ev)
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`supabase_insert_failed: ${JSON.stringify(body)}`);
  return body;
}

// Heuristic: detect institution/source tags directly from text when AI misses them
function heuristicSourceTagFromText(title, description, content) {
  const text = `${title} ${description} ${content}`.toLowerCase();
  const unTokens = ['onu','nations unies','united nations','ohchr','hrc','conseil des droits de l\'homme','rapport de l\'onu','haut commissariat'];
  const hrTokens = ['amnesty','human rights watch','hrw','droits humains',"droits de l\'homme","organisation de défense des droits"];
  const sdgTokens = ['odd','sdg','objectifs de développement durable','sustainable development goals'];
  if (unTokens.some(k => text.includes(k))) return 'un';
  if (hrTokens.some(k => text.includes(k))) return 'human_rights';
  if (sdgTokens.some(k => text.includes(k))) return 'sdg';
  return '';
}

async function processArticle({ title, link, description }) {
  const source = domainFromUrl(link) || 'Source';
  if (await supabaseExistsByUrl(link)) {
    console.log(`↪︎ Skip duplicate: ${link}`);
    return null;
  }
  let html = '';
  try { html = await fetchText(link); } catch (_) {}
  const content = stripTags(html);
  const analysis = await aiAnalyze({ title, url: link, source, description, content });
  const decision = normalizeDecision(analysis, { title, description, content });
  const amountSan = sanitizeAmount(decision, analysis.amount_crbn);

  const tagHeuristic = heuristicSourceTagFromText(title, description, content);
  const tag = normalizeSourceTag(analysis?.event_source_tag) || tagHeuristic;
  const event_source_final = (tag && tag !== 'other') ? tag : source;

  // Garde additionnelle: ne jamais insérer BURN/MINT avec montant zéro → NEUTRAL
  const decisionFinal = (Number(amountSan) <= 0) ? 'NEUTRAL' : decision;
  const amountFinal = decisionFinal === 'NEUTRAL' ? 0 : amountSan;

  const eventData = {
    event_title: title,
    event_url: link,
    event_source: event_source_final,
    decision: decisionFinal,
    amount_crbn: amountFinal,
    final_score: Number(analysis.final_score) || 0,
    confidence: parseInt(analysis.confidence) || 5,
    justification: String(analysis.justification || ''),
    tx_hash: null,
    created_at: new Date().toISOString()
  };
  const saved = await supabaseInsertEvent(eventData);
  console.log('✓ Saved', { id: saved?.[0]?.id, decision: decisionFinal, amount_crbn: amountFinal, event_source: event_source_final });
  await sleep(SLEEP_MS);
  return saved?.[0] || null;
}

async function ingestFromRSS(rssUrl, limit) {
  const xml = await fetchText(rssUrl);
  let items = parseRSS(xml);
  if (Number.isFinite(limit) && items.length > limit) items = items.slice(0, limit);
  if (items.length > MAX_ITEMS) items = items.slice(0, MAX_ITEMS);
  console.log(`Found ${items.length} items from RSS`);
  const results = [];
  for (const it of items) {
    try { const out = await processArticle(it); if (out) results.push(out); } catch (e) { console.error('✗ Error article', it.link, e.message); }
  }
  return results;
}

async function ingestSingleArticle(articleUrl) {
  const title = articleUrl.split('/').slice(-1)[0];
  const description = '';
  return await processArticle({ title, link: articleUrl, description });
}

(async () => {
  const arg = process.argv[2] || '';
  const lim = parseInt(process.argv[3] || '5');
  if (!OPENROUTER_KEY) {
    console.error('❌ OPENROUTER_KEY manquant dans .env');
    process.exit(1);
  }
  if (!arg) {
    console.error('Usage: node ingest_rss_ai.js <rss_url|article_url> [limit]');
    process.exit(2);
  }
  try {
    const isRss = /(\.xml|\/rss)(\?|$)/.test(arg) || /(?:\?|&)format=mrss\b/.test(arg);
    if (isRss) {
      const results = await ingestFromRSS(arg, lim);
      console.log('Done RSS. Inserted:', results.length);
    } else {
      const out = await ingestSingleArticle(arg);
      console.log('Done single article.', out ? { id: out.id, decision: out.decision } : 'no insert');
    }
    process.exit(0);
  } catch (e) {
    console.error('❌ Ingest error:', e.message);
    process.exit(3);
  }
})();