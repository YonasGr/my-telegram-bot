# Telegram Bot for Binance P2P ETB

## Overview
This is a Telegram bot that provides Binance P2P Ethiopian Birr (ETB) exchange rates and cryptocurrency conversion functionality. The bot uses a Cloudflare Worker to handle Telegram webhooks and an Express.js backend to proxy Binance P2P API calls.

## Project Architecture
- **Frontend**: Cloudflare Worker (src/index.js) - Handles Telegram bot commands and webhook processing
- **Backend**: Express.js server (backend/server.js) - Proxies Binance P2P API calls to avoid CORS issues
- **Development Environment**: Configured for Replit with proper port and host settings

## Setup in Replit
- **Frontend**: Runs on port 5000 via Wrangler dev server
- **Backend**: Runs on port 3001 for API proxy functionality
- **Dependencies**: All npm packages installed for both root and backend directories
- **Deployment**: Configured for VM deployment with both services

## Recent Changes
- 2025-09-10: Initial setup and configuration for Replit environment
- Configured backend to use correct port binding for Replit
- Updated Cloudflare Worker to use local backend instead of external proxy
- Set up workflows for both frontend and backend services
- Configured deployment settings for production

## Bot Commands
- `/start` - Show welcome message and available commands
- `/p2p` - Display top 10 P2P rates for USDT in ETB
- `/rate <amount> <currency>` - Get P2P rates for specific amount
- `/sell <amount> usdt etb` - Calculate ETB for selling USDT
- `/convert <amount> <from_currency> <to_currency>` - Convert between cryptocurrencies
- `/coin <coin_symbol>` - Get coin information and market data

## Environment Variables Required
- `TELEGRAM_BOT_TOKEN` - Token for the Telegram bot API
- `BOT_CACHE` - KV namespace binding for caching (configured in wrangler.toml)