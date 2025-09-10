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
- Enhanced P2P command with rate limits, payment methods, and trader success rates
- Improved message formatting with emojis and MarkdownV2 support
- Added comprehensive market data to coin command
- Polished all commands with better user experience

## Enhanced Bot Commands
- `/start` - Welcome message with emoji-enhanced command overview
- `/p2p` - Enhanced P2P rates with limits, payment methods, trader stats
- `/rate <amount> <currency>` - Specific amount rates with detailed trader info
- `/sell <amount> usdt etb` - ETB conversion with recommended seller details
- `/convert <amount> <from_currency> <to_currency>` - Crypto conversion with USD values
- `/coin <coin_symbol>` - Comprehensive coin data with market stats and change indicators

## Features Added
- Rate limit information (min/max transaction amounts, payment time limits)
- Trader success rates and monthly order counts
- Payment method display (TeleBirr, Bank transfers, etc.)
- Market data with price changes, volume, and market cap
- Emoji indicators for price movements and status
- Professional message formatting with MarkdownV2 support

## Environment Variables Required
- `TELEGRAM_BOT_TOKEN` - Token for the Telegram bot API
- `BOT_CACHE` - KV namespace binding for caching (configured in wrangler.toml)
