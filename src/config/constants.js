/**
 * Configuration constants for the Telegram Crypto Bot
 */

export const API_URLS = {
  BINANCE_BACKEND: 'https://my-telegram-bot-backend.onrender.com/binancep2p',
  COINGECKO: 'https://api.coingecko.com/api/v3',
  CHART_IMAGE: 'https://quickchart.io/chart',
  TELEGRAM_BOT: 'https://api.telegram.org/bot'
};

export const SUPPORTED_ASSETS = ['USDT', 'BTC', 'ETH', 'BNB', 'BUSD'];

export const SUPPORTED_FIATS = ['ETB', 'USD', 'EUR', 'GBP', 'NGN', 'KES', 'GHS'];

export const TRADE_TYPES = ['BUY', 'SELL'];

export const CACHE_TTL = {
  COIN_SEARCH: 86400, // 24 hours
  COIN_DATA: 3600,    // 1 hour
  CHART_DATA: 3600,   // 1 hour
  SIMPLE_PRICES: 60,  // 1 minute - minimum 60s as required
  P2P_DATA: 300       // 5 minutes
};

export const RATE_LIMIT = {
  DEFAULT_LIMIT: 10,
  DEFAULT_WINDOW: 60, // seconds
  COINGECKO_DELAY: 1500, // 1.5 seconds minimum between calls as required
  COINGECKO_CACHE_MIN: 60 // minimum 60 seconds cache
};

export const CHART_CONFIG = {
  DEFAULT_DAYS: 7,
  AVAILABLE_TIMEFRAMES: ['1', '7', '30'],
  DEFAULT_WIDTH: 800,
  DEFAULT_HEIGHT: 400,
  BACKGROUND_COLOR: 'rgba(17,17,17,0.9)',
  LINE_COLOR: '#00ff88',
  FILL_COLOR: 'rgba(0, 255, 136, 0.1)'
};

export const PAGINATION = {
  MAX_P2P_ROWS: 20,
  DEFAULT_P2P_ROWS: 10,
  MAX_PAGE: 100
};

export const COMMANDS = {
  START: ['/start', '/help'],
  P2P: '/p2p',
  RATE: '/rate', 
  SELL: '/sell',
  BUY: '/buy',
  CONVERT: '/convert',
  COIN: '/coin'
};

export const EMOJIS = {
  LOADING: '⏳',
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  MONEY: '💰',
  CHART: '📊',
  COIN: '🪙',
  EXCHANGE: '💱',
  TREND_UP: '🟢',
  TREND_DOWN: '🔴',
  STAR: '⭐️',
  BANK: '🏦',
  REFRESH: '🔄',
  PACKAGE: '📦',
  TROPHY: '🏆',
  WAVE: '👋',
  ROCKET: '🚀',
  LINK: '🔗'
};