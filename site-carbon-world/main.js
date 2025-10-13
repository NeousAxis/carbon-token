const SUPABASE_URL = "https://drmlsquvwybixocjwdud.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRybWxzcXV2d3liaXhvY2p3ZHVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzMDU0NzUsImV4cCI6MjA3NTg4MTQ3NX0.rimLZpAQEyVy8ci1j76HbgagFdtQJefKhZFkr20mlrE";
const CBWD_MINT = "HRqmMnbA18VgstcfjCueAuzVZEoHHbLbbu973AqmK3Fs"; // Devnet mint

// utilitaires format
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const nfi = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

// 1️⃣ charge la supply on-chain et IA
async function loadSupply() {
  try {
    const [onchainRes, statsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/carbon_supply?mint_address=eq.${CBWD_MINT}&select=current_supply&limit=1`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      }),
      fetch(`${SUPABASE_URL}/rest/v1/carbon_stats?select=current_supply,total_events,total_burns,total_mints,total_burned,total_minted&limit=1`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      }),
    ]);

    const onchainArr = await onchainRes.json();
    const statsArr = await statsRes.json();

    const onchainRaw = onchainArr[0]?.current_supply ?? null;
    const stats = statsArr[0] ?? null;

    const onchain = onchainRaw != null ? onchainRaw / 1e6 : null;
    const ia = stats?.current_supply != null ? stats.current_supply / 1e6 : null;
    const delta = onchain != null && ia != null ? onchain - ia : null;

    const el = document.getElementById("stats-content");
    el.innerHTML = `
      <div class="stat"><div class="stat-label">Supply on-chain</div><div class="stat-value">${onchain!=null?nf.format(onchain):'—'} CBWD</div></div>
      <div class="stat"><div class="stat-label">Supply IA (simulée)</div><div class="stat-value">${ia!=null?nf.format(ia):'—'} CBWD</div></div>
      <div class="stat"><div class="stat-label">Δ Écart (on-chain − IA)</div><div class="stat-value">${delta!=null?nf.format(delta):'—'} CBWD</div></div>
      <div class="stat"><div class="stat-label">Événements</div><div class="stat-value">${stats?nfi.format(stats.total_events):'—'}</div></div>
      <div class="stat"><div class="stat-label">Burns</div><div class="stat-value">${stats?nfi.format(stats.total_burns):'—'}</div></div>
      <div class="stat"><div class="stat-label">Mints</div><div class="stat-value">${stats?nfi.format(stats.total_mints):'—'}</div></div>
      <div class="stat"><div class="stat-label">Total brûlé</div><div class="stat-value">${stats?nf.format(stats.total_burned/1e6):'—'} CBWD</div></div>
      <div class="stat"><div class="stat-label">Total minté</div><div class="stat-value">${stats?nf.format(stats.total_minted/1e6):'—'} CBWD</div></div>
    `;
  } catch (e) {
    document.getElementById("stats-content").innerHTML = '<div class="muted">Impossible de charger les statistiques.</div>';
  }
}

// 2️⃣ charge les 20 derniers events
async function loadEvents() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/carbon_events?select=event_title,decision,amount_crbn,event_source,tx_hash,created_at&order=created_at.desc&limit=20`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const data = await res.json();
    const tbody = document.querySelector("#events-table tbody");
    tbody.innerHTML = data.length
      ? data
          .map(
            (ev) => `
            <tr>
              <td>${ev.event_title || '-'}</td>
              <td>${new Date(ev.created_at).toLocaleString()}</td>
              <td>${ev.decision}</td>
              <td>${nf.format(ev.amount_crbn/1e6)}</td>
              <td>${ev.event_source}</td>
              <td>${
                ev.tx_hash
                  ? `<a href="https://explorer.solana.com/tx/${ev.tx_hash}?cluster=devnet" target="_blank">voir</a>`
                  : "-"
              }</td>
            </tr>`
          )
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