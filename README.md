# 🚀 Cloudflare Worker Telegram Bot

[![Telegram](https://img.shields.io/badge/Telegram-Bot-blue?logo=telegram)](https://t.me/x_Jonah)  [![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)  [![Node.js](https://img.shields.io/badge/Node.js-18.x-green?logo=node.js&logoColor=white)](https://nodejs.org/)  [![CoinMarketCap](https://img.shields.io/badge/API-CoinMarketCap-17A2B8?logo=coinmarketcap)](https://coinmarketcap.com/)  [![Binance](https://img.shields.io/badge/API-Binance-FCD535?logo=binance&logoColor=black)](https://binance.com)  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A **serverless Telegram bot** built with **Cloudflare Workers** that provides real-time cryptocurrency data, Binance P2P trading rates, and CoinMarketCap market insights with **professional candlestick charts** — all directly inside Telegram.


## ✨ Features

- 📊 **Real-time Binance P2P Data**  
  Get live buy/sell offers for popular crypto assets like **USDT, BTC, ETH, BNB** in multiple fiat currencies (ETB, USD, EUR, GBP, NGN, KES, GHS).

- 💱 **Currency Conversion**  
  Convert between crypto ↔ crypto or crypto ↔ fiat with live market data.

- 🪙 **Coin Information**  
  Fetch detailed coin data (price, volume, market cap, supply) with **professional candlestick charts**, moving averages (MA20/50), RSI, MACD, and volume indicators.

- 💰 **Sell Estimator**  
  Quickly calculate how much ETB you’ll get when selling crypto.

- ⚡ **Rate Limiting & Caching**  
  Prevents abuse and improves performance with smart caching and secure API key management.

- 🖼 **Professional Charts**  
  Generates high-quality PNG charts with candlesticks, technical indicators, and customizable timeframes using advanced charting libraries.

---

## 🛠️ Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/start` or `/help` | Show welcome message and list of commands | `/start` |
| `/p2p [asset] [fiat] [type]` | Get Binance P2P rates | `/p2p USDT ETB BUY` |
| `/rate [amount] [currency] [vsCurrency]` | Convert with live rates | `/rate 100 BTC USD` |
| `/sell [amount]` | Estimate ETB for selling crypto | `/sell 50` |
| `/convert [amount] [from] [to]` | Convert between any currencies | `/convert 100 ETH ADA` |
| `/coin [symbol]` | Get detailed market info with chart | `/coin bitcoin` |

---

## 📂 Project Structure

```

├── src/
│   ├── utils/              # Utility functions (formatting, escaping, etc.)
│   ├── cache/              # Caching & rate-limiting helpers
│   ├── api/                # API wrappers (Binance, CoinMarketCap, Professional Charts)
│   ├── commands/           # Telegram command handlers
│   └── worker.js           # Main Cloudflare Worker entry
├── wrangler.toml           # Cloudflare config
├── package.json
└── README.md

````

---

## ⚙️ Environment Variables

Set these in your Cloudflare Worker environment:

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token from [BotFather](https://t.me/BotFather) |
| `COINMARKETCAP_API_KEY` | Your CoinMarketCap Pro API key from [CoinMarketCap](https://pro.coinmarketcap.com/) |
| `BOT_CACHE` | Cloudflare KV namespace binding for caching API responses |

---

````

## 🚀 Deployment

1. **Clone the repo**
   ```bash
   git clone https://github.com/your-username/crypto-telegram-bot.git
   cd crypto-telegram-bot

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure Wrangler**

   ```bash
   wrangler login
   wrangler kv:namespace create BOT_CACHE
   ```

4. **Deploy**

   ```bash
   wrangler deploy
   ```

5. **Set Telegram Webhook**

   ```bash
   curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
        -d "url=https://<your-worker-subdomain>.workers.dev"
   ```
````

## 📸 Example

**Coin Command Response**

```
🪙 Bitcoin (BTC)

💰 Price: $42,000.00
📈 24h Change: 🟢 +3.2%
🏆 Market Cap Rank: #1
📊 Market Stats:
• Market Cap: $820B
• 24h Volume: $25B
• Circulating Supply: 19M BTC
```

![Sample Chart](src/image.png)

---

## 📌 Notes

* Binance P2P requests are proxied through a backend to bypass Cloudflare Worker restrictions.
* CoinMarketCap API provides professional-grade data with **secure API key management** → caching is implemented to optimize performance.
* Charts are generated server-side as high-quality PNG images with **candlesticks, technical indicators, and volume data**.
* All API keys are stored securely in environment variables and never logged or exposed.

---

## 👨‍💻 Author

Built by [@x\_Jonah](https://t.me/x_Jonah)
📢 Updates: [@Jonah\_Notice](https://t.me/Jonah_Notice)

---
