'use strict';

const http = require('http');
const TelegramBot = require('node-telegram-bot-api');
const { ethers } = require('ethers');
const config = require('./config');
const Trader = require('./trader');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const bot = new TelegramBot(config.botToken, { polling: true });
const trader = new Trader(config);

// ---------- global trade config (only the admin can change it) ----------
const state = {
  token: config.defaultToken,
  amountEth: config.defaultAmountEth,
  loops: Number.isFinite(config.defaultLoops) && config.defaultLoops > 0 ? config.defaultLoops : 1,
  decimals: 18,
  symbol: '?',
  running: false,
  stopRequested: false,
  lastReport: null,
};

// ---------- per-chat UI state (single editable panel) ----------
const chats = new Map();
function chat(id) {
  let c = chats.get(id);
  if (!c) {
    c = { panelId: null, step: null, draft: {} };
    chats.set(id, c);
  }
  return c;
}

function isAdmin(id) {
  return String(id) === config.adminId;
}

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtEth(wei) {
  return Number(ethers.formatEther(wei)).toFixed(6);
}

function gasFee(receipt) {
  if (!receipt) return 0n;
  if (receipt.fee !== undefined && receipt.fee !== null) return BigInt(receipt.fee);
  return (receipt.gasUsed || 0n) * (receipt.gasPrice || 0n);
}

// ---------- panel helpers: keep ONE message per chat, replace it in place ----------
async function panel(chatId, text, keyboard) {
  const c = chat(chatId);
  const opts = { parse_mode: 'HTML', disable_web_page_preview: true };
  if (keyboard) opts.reply_markup = { inline_keyboard: keyboard };

  if (c.panelId) {
    try {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: c.panelId,
        ...opts,
      });
      return;
    } catch (err) {
      const msg = err.message || '';
      if (/message is not modified/i.test(msg)) return; // same content, nothing to do
      c.panelId = null; // panel was deleted or too old -> send a fresh one
    }
  }

  const sent = await bot.sendMessage(chatId, text, opts);
  c.panelId = sent.message_id;
}

// ---------- screens ----------
function menuText() {
  return [
    '🤖 <b>BASE VOLUME BOT</b>',
    '',
    '👛 <b>Wallet</b>',
    '<code>' + esc(trader.address) + '</code>',
    '',
    '⚙️ <b>Konfigurasi</b>',
    '<pre>' +
      'Token  : ' + esc(state.token || '—') + '\n' +
      'Amount : ' + esc(state.amountEth) + ' ETH / tx\n' +
      'Loops  : ' + esc(state.loops) +
    '</pre>',
    '',
    '<i>Pilih menu di bawah.</i>',
  ].join('\n');
}

function menuKeyboard() {
  return [
    [
      { text: '⚙️ Setup', callback_data: 'setup' },
      { text: '▶️ Run', callback_data: 'run' },
    ],
    [
      { text: '📊 Status', callback_data: 'status' },
      { text: '💰 Balance', callback_data: 'balance' },
    ],
    [
      { text: '📄 Report', callback_data: 'report' },
      { text: '⏹ Stop', callback_data: 'stop' },
    ],
  ];
}

function statusText() {
  return [
    '📊 <b>STATUS</b>',
    '',
    '<pre>' +
      'Wallet  : ' + esc(trader.address) + '\n' +
      'Token   : ' + esc(state.token || '—') + '\n' +
      'Amount  : ' + esc(state.amountEth) + ' ETH / tx\n' +
      'Loops   : ' + esc(state.loops) + '\n' +
      'Running : ' + (state.running ? 'YA' : 'tidak') +
    '</pre>',
  ].join('\n');
}

async function balanceText() {
  const bal = await trader.ethBalance();
  let tokenLine = '';
  if (state.token && ethers.isAddress(state.token)) {
    const dec = await trader.tokenDecimals(state.token).catch(() => 18);
    const tb = await trader.tokenBalance(state.token).catch(() => 0n);
    tokenLine = '\nToken   : ' + esc(ethers.formatUnits(tb, dec));
  }
  return [
    '💰 <b>BALANCE</b>',
    '',
    '<pre>ETH     : ' + esc(fmtEth(bal)) + tokenLine + '</pre>',
  ].join('\n');
}

function reportText(stats, requestedLoops) {
  const totalVolume = stats.buyVolume + stats.sellVolume;
  const netLoss = stats.buyVolume - stats.sellVolume;
  const totalCost = netLoss + stats.gasTotal;
  return [
    '📄 <b>LAPORAN SELESAI</b>',
    '',
    '<pre>' +
      'Token        : ' + esc(state.symbol || '?') + '\n' +
      'Loop sukses  : ' + stats.loopsDone + '/' + requestedLoops + '\n' +
      (stats.loopsFailed > 0 ? 'Loop gagal   : ' + stats.loopsFailed + '\n' : '') +
      '\n' +
      'Buy volume   : ' + fmtEth(stats.buyVolume) + ' ETH\n' +
      'Sell volume  : ' + fmtEth(stats.sellVolume) + ' ETH\n' +
      'Total volume : ' + fmtEth(totalVolume) + ' ETH\n' +
      '\n' +
      'Fee LP (est) : ' + fmtEth(netLoss) + ' ETH\n' +
      'Gas total    : ' + fmtEth(stats.gasTotal) + ' ETH\n' +
      'Total biaya  : ' + fmtEth(totalCost) + ' ETH' +
    '</pre>',
  ].join('\n');
}

// ---------- setup flow ----------
async function startSetup(chatId) {
  const c = chat(chatId);
  c.step = 'token';
  c.draft = {};
  await panel(
    chatId,
    '⚙️ <b>SETUP</b>  (1/3)\n\nKirim <b>alamat token</b>.\n\n<pre>0x0dd5b481728af5edbb93a4a535689d19cfa525e8</pre>',
    [[{ text: '❌ Batal', callback_data: 'cancel' }]]
  );
}

async function finishSetup(chatId) {
  const c = chat(chatId);
  state.token = c.draft.token;
  state.amountEth = c.draft.amountEth;
  state.loops = c.draft.loops;
  state.decimals = await trader.tokenDecimals(state.token).catch(() => 18);
  state.symbol = await trader.tokenSymbol(state.token).catch(() => '?');
  c.step = null;
  c.draft = {};
  await panel(chatId, menuText(), [
    [{ text: '▶️ Run sekarang', callback_data: 'run' }],
    [{ text: '⚙️ Setup ulang', callback_data: 'setup' }],
  ]);
}

// ---------- run loop ----------
function progressText(i, loops, stats, phase) {
  return [
    '▶️ <b>RUNNING</b>  ' + i + '/' + loops,
    '',
    '<pre>' +
      'Fase        : ' + esc(phase) + '\n' +
      '\n' +
      'Buy volume  : ' + fmtEth(stats.buyVolume) + ' ETH\n' +
      'Sell volume : ' + fmtEth(stats.sellVolume) + ' ETH' +
    '</pre>',
    '',
    '<i>Kirim /stop untuk berhenti.</i>',
  ].join('\n');
}

async function runLoop(chatId) {
  if (state.running) {
    await panel(chatId, '⚠️ Masih jalan. Tunggu selesai atau kirim /stop.', [[{ text: '⏹ Stop', callback_data: 'stop' }]]);
    return;
  }
  if (!state.token || !ethers.isAddress(state.token)) {
    await panel(chatId, '❌ Token belum diset.\n\nJalankan ⚙️ Setup dulu.', [[{ text: '⚙️ Setup', callback_data: 'setup' }]]);
    return;
  }
  const amountEth = String(state.amountEth);
  if (!(Number(amountEth) > 0)) {
    await panel(chatId, '❌ Jumlah ETH tidak valid. Jalankan ⚙️ Setup.', [[{ text: '⚙️ Setup', callback_data: 'setup' }]]);
    return;
  }
  const loops = Number(state.loops);
  if (!Number.isInteger(loops) || loops <= 0) {
    await panel(chatId, '❌ Jumlah loop tidak valid. Jalankan ⚙️ Setup.', [[{ text: '⚙️ Setup', callback_data: 'setup' }]]);
    return;
  }

  state.running = true;
  state.stopRequested = false;
  const token = state.token;
  state.decimals = await trader.tokenDecimals(token).catch(() => 18);
  state.symbol = await trader.tokenSymbol(token).catch(() => '?');

  const stats = {
    loopsDone: 0,
    loopsFailed: 0,
    buyVolume: 0n,
    sellVolume: 0n,
    gasTotal: 0n,
    tokensBought: 0n,
    tokensSold: 0n,
  };

  await panel(chatId, progressText(0, loops, stats, 'mulai...'), [[{ text: '⏹ Stop', callback_data: 'stop' }]]);

  try {
    for (let i = 1; i <= loops; i += 1) {
      if (state.stopRequested) break;

      try {
        // ---- BUY ----
        const before = await trader.tokenBalance(token);
        const { receipt: buyReceipt } = await trader.buy(token, amountEth);
        const after = await trader.tokenBalance(token);
        const received = after - before;

        stats.buyVolume += ethers.parseEther(amountEth);
        stats.gasTotal += gasFee(buyReceipt);
        stats.tokensBought += received;

        await panel(chatId, progressText(i, loops, stats, 'BUY ✅'), [[{ text: '⏹ Stop', callback_data: 'stop' }]]);

        if (received === 0n) {
          stats.loopsFailed += 1;
          break;
        }

        await sleep(config.delayMs);
        if (state.stopRequested) break;

        // ---- SELL ----
        const ethBeforeSell = await trader.ethBalance();
        const { receipt: sellReceipt, approveReceipt } = await trader.sell(token, received);
        const ethAfterSell = await trader.ethBalance();

        const sellGas = gasFee(sellReceipt) + gasFee(approveReceipt);
        const ethOut = ethAfterSell - ethBeforeSell + sellGas;

        stats.sellVolume += ethOut > 0n ? ethOut : 0n;
        stats.gasTotal += sellGas;
        stats.tokensSold += received;
        stats.loopsDone += 1;

        await panel(chatId, progressText(i, loops, stats, 'SELL ✅'), [[{ text: '⏹ Stop', callback_data: 'stop' }]]);

        await sleep(config.delayMs);
      } catch (err) {
        stats.loopsFailed += 1;
        await panel(
          chatId,
          '⚠️ <b>Loop ' + i + ' gagal</b>\n\n<pre>' + esc(err.shortMessage || err.message) + '</pre>',
          [[{ text: '⏹ Stop', callback_data: 'stop' }]]
        );
        await sleep(config.delayMs);
      }
    }
  } finally {
    state.running = false;
    const stopped = state.stopRequested;
    state.stopRequested = false;

    state.lastReport = reportText(stats, loops);
    const footer = stopped ? '\n\n⏹ <i>Dihentikan lebih awal.</i>' : '';
    await panel(chatId, state.lastReport + footer, [
      [{ text: '🔁 Run lagi', callback_data: 'run' }],
      [{ text: '⚙️ Setup', callback_data: 'setup' }],
      [{ text: '🏠 Menu', callback_data: 'menu' }],
    ]);
  }
}

// ---------- commands ----------
async function handleCommand(chatId, command, args) {
  switch (command) {
    case '/start':
    case '/menu':
      chat(chatId).step = null;
      await panel(chatId, menuText(), menuKeyboard());
      break;

    case '/setup':
      await startSetup(chatId);
      break;

    case '/status':
      await panel(chatId, statusText(), menuKeyboard());
      break;

    case '/balance':
      await panel(chatId, await balanceText(), menuKeyboard());
      break;

    case '/report':
      await panel(chatId, state.lastReport || '📄 Belum ada laporan.', menuKeyboard());
      break;

    case '/run':
      if (args.length >= 3) {
        const token = args[0];
        const eth = args[1];
        const loops = Number(args[2]);
        if (ethers.isAddress(token) && Number(eth) > 0 && Number.isInteger(loops) && loops > 0) {
          state.token = ethers.getAddress(token);
          state.amountEth = eth;
          state.loops = loops;
        } else {
          await panel(chatId, '❌ Argumen /run tidak valid.', menuKeyboard());
          break;
        }
      }
      runLoop(chatId);
      break;

    case '/stop':
      state.stopRequested = true;
      await panel(chatId, '⏹ Permintaan stop dikirim...', menuKeyboard());
      break;

    default:
      await panel(chatId, '❓ Perintah tidak dikenal.\n\nPakai tombol Menu di bawah.', menuKeyboard());
  }
}

// ---------- text input (setup steps + commands) ----------
bot.on('message', async (msg) => {
  if (!msg.text || !msg.from) return;
  if (!isAdmin(msg.from.id)) {
    console.log('Unauthorized message from id=' + msg.from.id);
    return;
  }

  const chatId = msg.chat.id;
  const c = chat(chatId);
  const text = msg.text.trim();

  try {
    // --- guided setup steps take priority ---
    if (c.step === 'token') {
      if (!ethers.isAddress(text)) {
        await panel(chatId, '❌ Alamat token tidak valid.\n\nKirim ulang alamat token (0x...).', [[{ text: '❌ Batal', callback_data: 'cancel' }]]);
        return;
      }
      c.draft.token = ethers.getAddress(text);
      c.step = 'amount';
      await panel(chatId, '⚙️ <b>SETUP</b>  (2/3)\n\nKirim <b>jumlah ETH per transaksi</b>.\n\n<pre>0.002</pre>', [[{ text: '❌ Batal', callback_data: 'cancel' }]]);
      return;
    }

    if (c.step === 'amount') {
      const v = Number(text);
      if (!(v > 0)) {
        await panel(chatId, '❌ Jumlah ETH tidak valid.\n\nKirim angka, contoh: <code>0.002</code>', [[{ text: '❌ Batal', callback_data: 'cancel' }]]);
        return;
      }
      c.draft.amountEth = text;
      c.step = 'loops';
      await panel(chatId, '⚙️ <b>SETUP</b>  (3/3)\n\nKirim <b>jumlah loop</b>.\n\n<pre>10</pre>', [[{ text: '❌ Batal', callback_data: 'cancel' }]]);
      return;
    }

    if (c.step === 'loops') {
      const n = Number(text);
      if (!Number.isInteger(n) || n <= 0) {
        await panel(chatId, '❌ Jumlah loop tidak valid.\n\nKirim angka bulat, contoh: <code>10</code>', [[{ text: '❌ Batal', callback_data: 'cancel' }]]);
        return;
      }
      c.draft.loops = n;
      await finishSetup(chatId);
      return;
    }

    // --- commands ---
    if (text.startsWith('/')) {
      const parts = text.split(/\s+/);
      const command = parts[0].replace(/@.*$/, '').toLowerCase();
      await handleCommand(chatId, command, parts.slice(1));
      return;
    }

    // --- anything else: show menu ---
    await panel(chatId, menuText(), menuKeyboard());
  } catch (err) {
    await panel(chatId, '❌ Error: <pre>' + esc(err.shortMessage || err.message) + '</pre>', menuKeyboard());
  } finally {
    // Delete the user's own message so the chat stays clean on both sides.
    // In private chats a bot is allowed to delete incoming messages.
    try {
      await bot.deleteMessage(chatId, msg.message_id);
    } catch (err) {
      // ignore (e.g. too old, or not permitted)
    }
  }
});

// ---------- inline buttons ----------
bot.on('callback_query', async (query) => {
  const chatId = query.message && query.message.chat && query.message.chat.id;
  if (!chatId) return;

  if (!isAdmin(query.from.id)) {
    await bot.answerCallbackQuery(query.id, { text: 'Akses ditolak', show_alert: true });
    return;
  }
  await bot.answerCallbackQuery(query.id);

  try {
    switch (query.data) {
      case 'menu':
        chat(chatId).step = null;
        await panel(chatId, menuText(), menuKeyboard());
        break;
      case 'setup':
        await startSetup(chatId);
        break;
      case 'cancel':
        chat(chatId).step = null;
        chat(chatId).draft = {};
        await panel(chatId, menuText(), menuKeyboard());
        break;
      case 'run':
        runLoop(chatId);
        break;
      case 'stop':
        state.stopRequested = true;
        break;
      case 'status':
        await panel(chatId, statusText(), menuKeyboard());
        break;
      case 'balance':
        await panel(chatId, await balanceText(), menuKeyboard());
        break;
      case 'report':
        await panel(chatId, state.lastReport || '📄 Belum ada laporan.', menuKeyboard());
        break;
      default:
        await panel(chatId, menuText(), menuKeyboard());
    }
  } catch (err) {
    console.error('callback error: ' + (err.message || err));
  }
});

bot.on('polling_error', (err) => {
  console.error('polling_error: ' + err.message);
});

// ---------- startup ----------
async function init() {
  await bot.setMyCommands([
    { command: 'start', description: '🏠 Menu utama' },
    { command: 'setup', description: '⚙️ Set token, ETH, loop' },
    { command: 'run', description: '▶️ Mulai trading' },
    { command: 'stop', description: '⏹ Hentikan' },
    { command: 'status', description: '📊 Status konfigurasi' },
    { command: 'balance', description: '💰 Saldo wallet' },
    { command: 'report', description: '📄 Laporan terakhir' },
  ]);
  await bot.setChatMenuButton({ menu_button: { type: 'commands' } });
  console.log('Bot started. Wallet: ' + trader.address);
}

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

init().catch((err) => {
  console.error('init failed: ' + (err.message || err));
  process.exit(1);
});
