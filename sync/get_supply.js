const { Connection, PublicKey } = require('@solana/web3.js');

const RPC_URL = 'https://api.devnet.solana.com';
const MINT = 'HRqmMnbA18VgstcfjCueAuzVZEoHHbLbbu973AqmK3Fs'; // CBWD (devnet)
const DECIMALS = 6;

(async () => {
  try {
    const connection = new Connection(RPC_URL, 'confirmed');
    const info = await connection.getTokenSupply(new PublicKey(MINT));
    const ui = Number(info.value.amount) / 10 ** DECIMALS;
    console.log(JSON.stringify({
      ok: true,
      mint: MINT,
      amount_raw: info.value.amount,   // en “units”
      decimals: info.value.decimals,
      supply_cbwd: ui                  // en CBWD lisibles
    }, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ ok:false, error: String(e.message || e) }));
    process.exit(1);
  }
})();