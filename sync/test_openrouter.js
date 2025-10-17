require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const https = require('https');

const key = process.env.OPENROUTER_KEY;
if (!key) {
  console.error('❌ OPENROUTER_KEY manquant dans .env');
  process.exit(1);
}

const payload = JSON.stringify({
  model: 'openai/gpt-3.5-turbo',
  temperature: 0.1,
  max_tokens: 50,
  messages: [
    { role: 'system', content: 'Tu es un test de connectivité.' },
    { role: 'user', content: 'Réponds “OK” si la clé fonctionne.' }
  ]
});

const options = {
  hostname: 'openrouter.ai',
  path: '/api/v1/chat/completions',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'X-Title': 'CARBON-Test'
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('HTTP', res.statusCode);
    try {
      const parsed = JSON.parse(body);
      const text = parsed?.choices?.[0]?.message?.content?.trim();
      console.log('AI:', text);
      console.log('OK:', !!text);
      process.exit(0);
    } catch (e) {
      console.error('❌ Parse error:', e.message);
      console.error('Body:', body.slice(0, 400));
      process.exit(2);
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Request error:', e.message);
  process.exit(3);
});

req.write(payload);
req.end();