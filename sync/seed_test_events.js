// Insert 2 test events into Supabase carbon_events using anon key (TEST source)
const https = require('https');

const SUPABASE_URL = 'https://drmlsquvwybixocjwdud.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRybWxzcXV2d3liaXhvY2p3ZHVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzMDU0NzUsImV4cCI6MjA3NTg4MTQ3NX0.rimLZpAQEyVy8ci1j76HbgagFdtQJefKhZFkr20mlrE';

function postJson(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const opts = {
      hostname: SUPABASE_URL.replace('https://',''),
      path,
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

(async () => {
  const ts = Date.now();
  const events = [
    {
      event_title: 'TEST E2E Burn',
      event_url: `https://carbon-token.xyz/test/e2e-${ts}-burn`,
      event_source: 'TEST',
      decision: 'BURN',
      amount_crbn: 100000,
      final_score: 7.2,
      confidence: 8,
      justification: 'Test contrôlé côté serveur',
      tx_hash: null,
      created_at: new Date().toISOString(),
    },
    {
      event_title: 'TEST E2E Mint',
      event_url: `https://carbon-token.xyz/test/e2e-${ts}-mint`,
      event_source: 'TEST',
      decision: 'MINT',
      amount_crbn: 200000,
      final_score: 3.6,
      confidence: 6,
      justification: 'Test contrôlé côté serveur',
      tx_hash: null,
      created_at: new Date().toISOString(),
    },
  ];

  const res = await postJson('/rest/v1/carbon_events', events);
  console.log('HTTP', res.status);
  console.log('Inserted:', Array.isArray(res.body) ? res.body.map(r => ({ id: r.id, url: r.event_url, decision: r.decision })) : res.body);
})();