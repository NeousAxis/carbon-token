// Delete test events (source=TEST) from Supabase carbon_events
const https = require('https');

const SUPABASE_URL = 'https://drmlsquvwybixocjwdud.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRybWxzcXV2d3liaXhvY2p3ZHVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzMDU0NzUsImV4cCI6MjA3NTg4MTQ3NX0.rimLZpAQEyVy8ci1j76HbgagFdtQJefKhZFkr20mlrE';

function req(method, path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: SUPABASE_URL.replace('https://',''),
      path,
      method,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Accept': 'application/json',
      },
    };
    const r = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    r.on('error', reject);
    r.end();
  });
}

(async () => {
  const path = '/rest/v1/carbon_events?event_source=eq.TEST';
  const res = await req('DELETE', path);
  console.log('HTTP', res.status);
  console.log('Body:', res.body.slice(0, 200));
})();