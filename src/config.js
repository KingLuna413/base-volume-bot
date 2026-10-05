'use strict';

require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error('Missing required environment variable: ' + name);
  }
  return value.trim();
}

function optional(name, fallback) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

module.exports = {
  botToken: required('TELEGRAM_BOT_TOKEN'),
  adminId: String(required('TELEGRAM_ADMIN_ID')),
  rpcUrl: required('RPC_URL'),
  privateKey: required('PRIVATE_KEY'),
  defaultToken: optional('TOKEN_ADDRESS', null),
  defaultAmountEth: optional('TRADE_AMOUNT_ETH', '0.001'),
  defaultLoops: Number(optional('TRADE_LOOPS', '1')),
  slippageBps: Number(optional('SLIPPAGE_BPS', '1500')),
  delayMs: Number(optional('DELAY_MS', '3000')),
  gasLimit: Number(optional('GAS_LIMIT', '500000')),
};
