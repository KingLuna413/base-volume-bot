'use strict';

const http = require('http');
const TelegramBot = require('node-telegram-bot-api');
const { ethers } = require('ethers');
const config = require('./config');
const Trader = require('./trader');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const bot = new TelegramBot(config.botToken, { polling: true });
const trader = new Trader(config);

const state = {
  token: config.defaultToken,
  amountEth: config.defaultAmountEth,
  loops: Number.isFinite(config.defaultLoops) && config.defaultLoops > 0 ? config.defaultLoops : 1,
  decimals: 18,
  running: false,
  stopRequested: false,
};

const HELP = [
  '*Base Volume Bot*',
  '',
  '/status - lihat konfigurasi',
  '/balance - saldo ETH & token',
  '/set <token> <eth> <loops> - set konfigurasi',
  '/run - mulai loop beli + jual',
  '/run <token> <eth> <loops> - run langsung',
  '/stop - hentikan loop',
].join('\n');

function isAdmin(id) {
  return String(id) === config.adminId;
}

function fmtEth(wei) {
  return Number(ethers.formatEther(wei)).toFixed(6);
}

async function statusText() {
  const bal = await trader.ethBalance().catch(() => null);
  return [
    '*Status*',
    'Wallet  : ' + trader.address,
    'Balance : ' + (bal === null ? '-' : fmtEth(bal) + ' ETH'),
    'Token   : ' + (state.token || '-'),
    'Amount  : ' + state.amountEth + ' ETH / tx',
    'Loops   : ' + state.loops,
    'Running : ' + (state.running ? 'YA' : 'tidak'),
  ].join('\n');
}

async function runLoop(chatId) {
  if (state.running) {
    await bot.sendMessage(chatId, 'Masih jalan. Pakai /stop dulu.');
    return;
  }
  if (!state.token || !ethers.isAddress(state.token)) {
    await bot.sendMessage(chatId, 'Token belum valid. Pakai /set <token> <eth> <loops>');
    return;
  }
  const amountEth = String(state.amountEth);
  if (!(Number(amountEth) > 0)) {
    await bot.sendMessage(chatId, 'Jumlah ETH tidak valid.');
    return;
  }
  const loops = Number(state.loops);
  if (!Number.isInteger(loops) || loops <= 0) {
    await bot.sendMessage(chatId, 'Jumlah loop tidak valid.');
    return;
  }

  state.running = true;
  state.stopRequested = false;
  const token = state.token;
  state.decimals = await trader.tokenDecimals(token).catch(() => 18);

  await bot.sendMessage(chatId, 'Mulai: ' + loops + 'x loop, ' + amountEth + ' ETH/tx\nToken: ' + token);

  try {
    for (let i = 1; i <= loops; i += 1) {
      if (state.stopRequested) {
        await bot.sendMessage(chatId, 'Dihentikan di loop ' + i + '.');
        break;
      }

      const before = await trader.tokenBalance(token);
      const buyReceipt = await trader.buy(token, amountEth);
      const after = await trader.tokenBalance(token);
      const received = after - before;

      await bot.sendMessage(
        chatId,
        '[' + i + '/' + loops + '] BUY ' + amountEth + ' ETH -> ' +
          ethers.formatUnits(received, state.decimals) + ' token\n' + buyReceipt.hash
      );

      if (received === 0n) {
        await bot.sendMessage(chatId, 'Dapat 0 token, loop dihentikan.');
        break;
      }

      await sleep(config.delayMs);
      if (state.stopRequested) {
        await bot.sendMessage(chatId, 'Dihentikan sebelum jual di loop ' + i + '.');
        break;
      }

      const sellReceipt = await trader.sell(token, received);
      await bot.sendMessage(
        chatId,
        '[' + i + '/' + loops + '] SELL ' +
          ethers.formatUnits(received, state.decimals) + ' token\n' + sellReceipt.hash
      );

      await sleep(config.delayMs);
    }
  } catch (err) {
    await bot.sendMessage(chatId, 'ERROR: ' + (err.shortMessage || err.message));
  } finally {
    state.running = false;
    state.stopRequested = false;
    await bot.sendMessage(chatId, 'Selesai.');
  }
}

bot.on('message', async (msg) => {
  const fromId = msg.from && msg.from.id;
  const chatId = msg.chat.id;

  if (!isAdmin(fromId)) {
    console.log('Unauthorized message from id=' + fromId);
    return;
  }

  const text = (msg.text || '').trim();
  if (!text.startsWith('/')) return;

  const parts = text.split(/\s+/);
  const command = parts[0].replace(/@.*$/, '').toLowerCase();
  const args = parts.slice(1);

  try {
    switch (command) {
      case '/start':
      case '/help':
        await bot.sendMessage(chatId, HELP, { parse_mode: 'Markdown' });
        break;

      case '/status':
        await bot.sendMessage(chatId, await statusText(), { parse_mode: 'Markdown' });
        break;

      case '/balance': {
        const bal = await trader.ethBalance();
        let line = 'ETH: ' + fmtEth(bal);
        if (state.token && ethers.isAddress(state.token)) {
          const dec = await trader.tokenDecimals(state.token).catch(() => 18);
          const tb = await trader.tokenBalance(state.token).catch(() => 0n);
          line += '\nToken: ' + ethers.formatUnits(tb, dec);
        }
        await bot.sendMessage(chatId, line);
        break;
      }

      case '/set': {
        if (args.length < 3) {
          await bot.sendMessage(chatId, 'Format: /set <token> <eth> <loops>');
          break;
        }
        const token = args[0];
        const eth = args[1];
        const loops = Number(args[2]);
        if (!ethers.isAddress(token)) {
          await bot.sendMessage(chatId, 'Alamat token tidak valid.');
          break;
        }
        if (!(Number(eth) > 0)) {
          await bot.sendMessage(chatId, 'Jumlah ETH tidak valid.');
          break;
        }
        if (!Number.isInteger(loops) || loops <= 0) {
          await bot.sendMessage(chatId, 'Jumlah loop tidak valid.');
          break;
        }
        state.token = token;
        state.amountEth = eth;
        state.loops = loops;
        state.decimals = await trader.tokenDecimals(token).catch(() => 18);
        await bot.sendMessage(chatId, 'Diset.\n\n' + (await statusText()), { parse_mode: 'Markdown' });
        break;
      }

      case '/run': {
        if (args.length >= 3) {
          const token = args[0];
          const eth = args[1];
          const loops = Number(args[2]);
          if (ethers.isAddress(token) && Number(eth) > 0 && Number.isInteger(loops) && loops > 0) {
            state.token = token;
            state.amountEth = eth;
            state.loops = loops;
          } else {
            await bot.sendMessage(chatId, 'Argumen /run tidak valid.');
            break;
          }
        }
        runLoop(chatId);
        break;
      }

      case '/stop':
        state.stopRequested = true;
        await bot.sendMessage(chatId, 'Permintaan stop dikirim...');
        break;

      default:
        await bot.sendMessage(chatId, 'Perintah tidak dikenal. Pakai /help');
    }
  } catch (err) {
    await bot.sendMessage(chatId, 'Error: ' + (err.shortMessage || err.message));
  }
});

bot.on('polling_error', (err) => {
  console.error('polling_error: ' + err.message);
});

// Optional health endpoint so Railway can treat this as a web service.
if (process.env.PORT) {
  http
    .createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    })
    .listen(Number(process.env.PORT), () => {
      console.log('health server on ' + process.env.PORT);
    });
}

console.log('Bot started. Wallet: ' + trader.address);
