# Base Volume Bot

Telegram-controlled Uniswap V3 buy/sell loop bot on **Base**.

> ⚠️ **Only for your own token and a burner wallet.** Never put a wallet that holds real funds on a server.

## What it does

- Connects to Telegram; only the configured admin user ID can use it.
- Buys your token with a fixed amount of ETH, then sells the tokens back, repeated N times.
- Targets Uniswap V3 pools with the **1% fee tier** (ape.store style tokens).
- Router: Uniswap V3 SwapRouter02 `0x2626664c2603336E57B271c5C0b26F421741e481`.

## Requirements

- Node.js 18+
- A Base RPC endpoint (Alchemy / Infura / QuickNode recommended)
- A burner wallet private key
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

## Local setup

```bash
npm install
cp .env.example .env
# edit .env
npm start
```

## Telegram commands

| Command | Description |
|---|---|
| `/status` | Show current config |
| `/balance` | Show ETH and token balance |
| `/set <token> <eth> <loops>` | Set token, ETH per tx, number of loops |
| `/run` | Start the loop |
| `/run <token> <eth> <loops>` | Start directly with args |
| `/report` | Show the last run report |
| `/stop` | Stop the loop |

## Run report

When a run finishes the bot sends a summary:

```
Laporan Selesai

Token        : COOL CAT
Loop sukses  : 10/10

Buy volume   : 0.020000 ETH
Sell volume  : 0.019608 ETH
Total volume : 0.039608 ETH

Fee LP (est) : 0.000392 ETH
Gas total    : 0.000012 ETH
Total biaya  : 0.000404 ETH

Token dibeli : 10840000.0
Token dijual : 10840000.0
```

- **Total volume** = buy volume + sell volume (this is the volume that counts on-chain).
- **Fee LP (est)** = buy volume − sell volume, i.e. the 1% pool fee taken on each swap.
- **Gas total** = real gas paid, read from the transaction receipts.
- **Total biaya** = fee + gas.

## Environment variables

| Name | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token from BotFather |
| `TELEGRAM_ADMIN_ID` | Your Telegram user ID (only this ID can control the bot) |
| `RPC_URL` | Base RPC endpoint |
| `PRIVATE_KEY` | Burner wallet private key |
| `TOKEN_ADDRESS` | Optional default token |
| `TRADE_AMOUNT_ETH` | Default ETH per transaction |
| `TRADE_LOOPS` | Default number of loops |
| `SLIPPAGE_BPS` | Slippage in basis points (1500 = 15%) |
| `DELAY_MS` | Delay between transactions in ms |
| `GAS_LIMIT` | Gas limit per swap |

## Safety

- Use a **burner wallet** only.
- Never commit `.env`.
- Keep the repository private.
- The bot ignores every Telegram user except `TELEGRAM_ADMIN_ID`.
