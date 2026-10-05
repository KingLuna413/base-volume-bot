'use strict';

require('dotenv').config();

const REQUIRED = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_ADMIN_ID',
  'RPC_URL',
  'PRIVATE_KEY',
];

function optional(name, fallback) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function isMissing(name) {
  const value = process.env[name];
  return !value || !value.trim();
}

// Fail fast with a clear message listing every missing variable at once.
const missing = REQUIRED.filter(isMissing);
if (missing.length > 0) {
  console.error('');
  console.error('==================================================');
  console.error('  STARTUP FAILED - missing environment variables');
  console.error('==================================================');
  for (const name of missing) {
    console.error('  - ' + name);
  }
  console.error('');
  console.error('Fix: open Railway -> your service -> Variables,');
  console.error('add each name above with its value, then click Deploy.');
  console.error('Reference: .env.example in the repository.');
  console.error('==================================================');
  console.error('');
  process.exit(1);
}

// PRIVATE_KEY sanity check (do not print the value).
const pk = process.env.PRIVATE_KEY.trim();
const normalizedPk = pk.startsWith('0x') ? pk : '0x' + pk;
if (!/^0x[0-9a-fA-F]{64}$/.test(normalizedPk)) {
  console.error('');
  console.error('==================================================');
  console.error('  STARTUP FAILED - PRIVATE_KEY looks invalid');
  console.error('==================================================');
  console.error('  Expected 64 hex characters (with or without 0x).');
  console.error('  Check the PRIVATE_KEY value in Railway Variables.');
  console.error('==================================================');
  console.error('');
  process.exit(1);
}

module.exports = {
  botToken: process.env.TELEGRAM_BOT_TOKEN.trim(),
  adminId: String(process.env.TELEGRAM_ADMIN_ID).trim(),
  rpcUrl: process.env.RPC_URL.trim(),
  privateKey: normalizedPk,
  defaultToken: optional('TOKEN_ADDRESS', null),
  defaultAmountEth: optional('TRADE_AMOUNT_ETH', '0.001'),
  defaultLoops: Number(optional('TRADE_LOOPS', '1')),
  slippageBps: Number(optional('SLIPPAGE_BPS', '1500')),
  delayMs: Number(optional('DELAY_MS', '3000')),
  gasLimit: Number(optional('GAS_LIMIT', '500000')),
};
