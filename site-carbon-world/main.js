const SUPABASE_URL = "https://drmlsquvwybixocjwdud.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRybWxzcXV2d3liaXhvY2p3ZHVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzMDU0NzUsImV4cCI6MjA3NTg4MTQ3NX0.rimLZpAQEyVy8ci1j76HbgagFdtQJefKhZFkr20mlrE";
const CBWD_MINT = "5bRPS8YnNMYZm6Mw86jkJMJpj9ZpCmq7Wj78gNAFnjHC"; // Devnet mint (aligne avec serveur)
const SERVER_URL = "http://localhost:3333"; // serveur mint/burn

// utilitaires format
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const nfi = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

// Petit helper pour éviter l'injection HTML dans le titre
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 1️⃣ charge la supply on-chain et IA
async function loadSupply() {
  try {
    const [onchainRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/carbon_supply?mint_address=eq.${CBWD_MINT}&select=current_supply&limit=1`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      }),
    ]);

    // Essayer d’inclure les colonnes pending; repli si non disponibles
    const selectPending = 'current_supply,total_events,total_burns,total_mints,total_burned,total_minted,last_update,pending_events,pending_mints,pending_burns,pending_burned,pending_minted';
    let overviewRes = await fetch(`${SUPABASE_URL}/rest/v1/carbon_overview?select=${selectPending}&mint_address=eq.${CBWD_MINT}&limit=1`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!overviewRes.ok) {
      overviewRes = await fetch(`${SUPABASE_URL}/rest/v1/carbon_overview?select=current_supply,total_events,total_burns,total_mints,total_burned,total_minted,last_update&mint_address=eq.${CBWD_MINT}&limit=1`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      });
    }

    const onchainArr = await onchainRes.json();
    const overviewArr = await overviewRes.json();

    const onchainRaw = onchainArr[0]?.current_supply ?? null;
    const overview = overviewArr[0] ?? null;

    const onchain = onchainRaw != null ? onchainRaw / 1e6 : null;
    const ovSupply = overview?.current_supply != null ? overview.current_supply / 1e6 : null;
    const delta = onchain != null && ovSupply != null ? onchain - ovSupply : null;

    const el = document.getElementById("stats-content");
    const pendEv = overview?.pending_events ?? null;
    const pendMints = overview?.pending_mints ?? null;
    const pendBurns = overview?.pending_burns ?? null;
  const pendMinted = overview?.pending_minted ?? null;
  const pendBurned = overview?.pending_burned ?? null;

    el.innerHTML = `
      <div class="stat"><div class="stat-label">Supply on-chain</div><div class="stat-value">${onchain!=null?nf.format(onchain):'—'} CBWD</div></div>
      <div class="stat"><div class="stat-label">Supply overview (Supabase)</div><div class="stat-value">${ovSupply!=null?nf.format(ovSupply):'—'} CBWD</div></div>
      <div class="stat"><div class="stat-label">Δ Écart (on-chain − overview)</div><div class="stat-value">${delta!=null?nf.format(delta):'—'} CBWD</div></div>
      <div class="stat"><div class="stat-label">Événements</div><div class="stat-value">${overview?nfi.format(overview.total_events):'—'}</div></div>
      <div class="stat"><div class="stat-label">Burns</div><div class="stat-value">${overview?nfi.format(overview.total_burns):'—'}</div></div>
      <div class="stat"><div class="stat-label">Mints</div><div class="stat-value">${overview?nfi.format(overview.total_mints):'—'}</div></div>
      <div class="stat"><div class="stat-label">Total brûlé</div><div class="stat-value">${overview?nf.format(overview.total_burned/1e6):'—'} CBWD</div></div>
      <div class="stat"><div class="stat-label">Total minté</div><div class="stat-value">${overview?nf.format(overview.total_minted/1e6):'—'} CBWD</div></div>
      <div class="stat"><div class="stat-label">Pendings (événements)</div><div class="stat-value">${pendEv!=null?nfi.format(pendEv):'—'}</div></div>
      <div class="stat"><div class="stat-label">Pendings: Mints/Burns</div><div class="stat-value">${pendMints!=null?nfi.format(pendMints):'—'} / ${pendBurns!=null?nfi.format(pendBurns):'—'}</div></div>
      <div class="stat"><div class="stat-label">Montant en attente</div><div class="stat-value">${pendMinted!=null?nf.format(pendMinted/1e6):'—'} / ${pendBurned!=null?nf.format(pendBurned/1e6):'—'} CBWD</div></div>
    `;
  } catch (e) {
    document.getElementById("stats-content").innerHTML = '<div class="muted">Impossible de charger les statistiques.</div>';
  }
}

// 2️⃣ charge les 20 derniers events
async function loadEvents() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/carbon_events?select=event_title,event_url,decision,amount_crbn,event_source,tx_hash,created_at&order=created_at.desc&limit=20`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const data = await res.json();
    const tbody = document.querySelector("#events-table tbody");
    tbody.innerHTML = data.length
      ? data
          .map((ev) => {
            const txHtml = ev.tx_hash
              ? `<a href="https://explorer.solana.com/tx/${ev.tx_hash}?cluster=devnet" target="_blank">voir</a>`
              : "-";

            const src = ev.event_source;
            let srcHtml = "-";

            function renderUrl(u) {
              try {
                const host = new URL(u).hostname;
                return `<a href="${u}" target="_blank" rel="noopener noreferrer">${host}</a>`;
              } catch {
                return `<a href="${u}" target="_blank" rel="noopener noreferrer">source</a>`;
              }
            }

            try {
              if (Array.isArray(src)) {
                srcHtml = src.map((u) => renderUrl(u)).join(' • ');
              } else if (typeof src === 'string') {
                const urls = src.match(/https?:\/\/[^\s,;]+/g);
                if (urls && urls.length) {
                  srcHtml = urls.map((u) => renderUrl(u)).join(' • ');
                } else if (src.startsWith('http://') || src.startsWith('https://')) {
                  srcHtml = renderUrl(src);
                } else {
                  srcHtml = src || '-';
                }
              }
            } catch (e) {
              srcHtml = src || '-';
            }

            const titleHtml = ev.event_url
              ? `<a href="${ev.event_url}" target="_blank" rel="noopener noreferrer">${escapeHTML(ev.event_title || ev.event_url)}</a>`
              : escapeHTML(ev.event_title || '-')

            return `
            <tr>
              <td>${titleHtml}</td>
              <td>${new Date(ev.created_at).toLocaleString()}</td>
              <td>${ev.decision}</td>
              <td>${nf.format(ev.amount_crbn/1e6)}</td>
              <td>${srcHtml}</td>
              <td>${txHtml}</td>
            </tr>`;
          })
          .join("")
      : '<tr><td colspan="6" class="muted">Aucun événement trouvé.</td></tr>';
  } catch (e) {
    document.querySelector("#events-table tbody").innerHTML = '<tr><td colspan="6" class="muted">Impossible de charger les événements.</td></tr>';
  }
}

// 3️⃣ Cotations CBWD & SOL
async function loadPrices() {
  const priceEl = document.getElementById('price-content');
  try {
    // Prix SOL via CoinGecko
    const cgRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true');
    const cg = await cgRes.json();
    const solPrice = cg.solana?.usd ?? null;
    const solChange = cg.solana?.usd_24h_change ?? null;

    // CBWD: placeholder (non listé publiquement). On affiche N/A et on attend ta source (DEX/CEX/Oracle/RPC).
    const cbwdPrice = null;
    const cbwdChange = null;

    priceEl.innerHTML = `
      <div class="price-card">
        <div class="price-title">CBWD <span class="badge ${cbwdChange!=null?(cbwdChange>=0?'up':'down'):''}">${cbwdChange!=null?(cbwdChange>=0?'+':'')+nf.format(Math.abs(cbwdChange))+'%':'N/A'}</span></div>
        <div class="price-value">${cbwdPrice!=null?nf.format(cbwdPrice)+' $':'N/A'}</div>
      </div>
      <div class="price-card">
        <div class="price-title">SOL <span class="badge ${solChange!=null?(solChange>=0?'up':'down'):''}">${solChange!=null?(solChange>=0?'+':'')+nf.format(Math.abs(solChange))+'%':'N/A'}</span></div>
        <div class="price-value">${solPrice!=null?nf.format(solPrice)+' $':'N/A'}</div>
      </div>
    `;
  } catch (e) {
    priceEl.innerHTML = '<div class="muted">Impossible de charger les prix pour le moment.</div>';
  }
}

// initialisation
loadSupply();
loadEvents();
loadPrices();

// 4️⃣ statut auto & exécution
async function loadAuto() {
  const mEl = document.getElementById('auto-mints');
  const bEl = document.getElementById('auto-burns');
  const tEl = document.getElementById('auto-treasury');
  const lastEl = document.getElementById('auto-last');
  const titleBadgeEl = document.getElementById('auto-status-badge');
  try {
    const [summaryRes, statusRes] = await Promise.all([
      fetch(`${SERVER_URL}/pending-summary`),
      fetch(`${SERVER_URL}/auto/status`),
    ]);
    const summary = await summaryRes.json();
    const status = await statusRes.json();
    if (!summary.ok) throw new Error('summary_failed');
    const mintsCount = summary.pending?.mints?.count ?? 0;
    const mintsSum = summary.pending?.mints?.sum ?? 0;
    const burnsCount = summary.pending?.burns?.count ?? 0;
    const burnsSum = summary.pending?.burns?.sum ?? 0;
    const treasuryUi = summary.treasury_balance?.ui_amount ?? null;
    mEl.textContent = `${nfi.format(mintsCount)} / ${nf.format(mintsSum/1e6)} CBWD`;
    bEl.textContent = `${nfi.format(burnsCount)} / ${nf.format(burnsSum/1e6)} CBWD`;
    tEl.textContent = treasuryUi!=null ? `${nf.format(treasuryUi)} CBWD` : '—';
    lastEl.textContent = `Dernier run: ${status.lastRunAt ? new Date(status.lastRunAt).toLocaleString() : '—'}`;
    if (titleBadgeEl && status.ok) {
      titleBadgeEl.className = `status-badge ${status.enabled ? 'on' : 'off'}`;
      titleBadgeEl.textContent = status.enabled ? 'Activé' : 'Désactivé';
      const last = status.lastRunAt ? new Date(status.lastRunAt).toLocaleString() : '—';
      const ms = status.interval_ms ?? null;
      const sec = ms != null ? Math.round(ms / 1000) : null;
      const tip = sec != null ? `Intervalle: ~${sec} s; Dernier run: ${last}` : `Dernier run: ${last}`;
      titleBadgeEl.setAttribute('title', tip);
    }
  } catch (e) {
    if (titleBadgeEl) {
      titleBadgeEl.className = 'status-badge off';
      titleBadgeEl.textContent = 'Indispo';
      titleBadgeEl.setAttribute('title', '—');
    }
  }
}

async function runAuto() {
  const sEl = document.getElementById('auto-status');
  if (sEl) sEl.textContent = 'Déclenché…';
  try {
    const res = await fetch(`${SERVER_URL}/auto/run`, { method: 'POST' });
    const data = await res.json();
    if (sEl) sEl.textContent = data.ok ? 'Terminé' : 'Erreur';
  } catch (e) {
    if (sEl) sEl.textContent = 'Erreur';
  }
  await loadAuto();
}

document.getElementById('btn-run-auto')?.addEventListener('click', runAuto);
document.getElementById('btn-refresh-auto')?.addEventListener('click', loadAuto);
loadAuto();

// 5️⃣ Test AI health via serveur
async function pingAI() {
  const el = document.getElementById('ai-health');
  const btn = document.getElementById('btn-ai-health');
  if (el) el.textContent = 'AI: test…';
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${SERVER_URL}/ai/health`);
    const data = await res.json();
    if (el) el.textContent = data.ok ? `AI: OK (status ${data.status})` : `AI: KO (${data.error || data.status})`;
  } catch (e) {
    if (el) el.textContent = 'AI: erreur';
  }
  if (btn) btn.disabled = false;
}

document.getElementById('btn-ai-health')?.addEventListener('click', pingAI);