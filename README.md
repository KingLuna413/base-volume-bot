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
| `/stop` | Stop the loop |

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
