/**
 * Configuration constants for the Telegram Crypto Bot
 */

export const API_URLS = {
  BACKEND_BASE: 'https://my-telegram-bot-backend.onrender.com',
  BINANCE_BACKEND: 'https://my-telegram-bot-backend.onrender.com/binancep2p',
  COINMARKETCAP: 'https://pro-api.coinmarketcap.com',
  CHART_IMAGE: 'https://quickchart.io/chart',
  TELEGRAM_BOT: 'https://api.telegram.org/bot'
};

export const SUPPORTED_ASSETS = ['USDT', 'BTC', 'ETH', 'BNB', 'BUSD'];

export const SUPPORTED_FIATS = ['ETB', 'USD', 'EUR', 'GBP', 'NGN', 'KES', 'GHS'];

// Popular trading pairs that benefit from extended caching and priority handling (CoinMarketCap IDs)
export const POPULAR_COINS = ['1', '1027', '825', '1839', '2010', '5426', '74'];

export const TRADE_TYPES = ['BUY', 'SELL'];

export const CACHE_TTL = {
  COIN_SEARCH: 86400, // 24 hours
  COIN_DATA: 3600,    // 1 hour
  CHART_DATA: 3600,   // 1 hour
  SIMPLE_PRICES: 60,  // 1 minute
  P2P_DATA: 300,      // 5 minutes
  // Enhanced caching for popular pairs
  POPULAR_PRICES: 300, // 5 minutes for BTC, ETH, USDT, etc.
  FALLBACK_PRICES: 3600, // 1 hour fallback cache
  RATE_LIMIT_STATUS: 300, // 5 minutes for rate limit tracking
  REQUEST_QUEUE: 60   // 1 minute for queue status
};

export const RATE_LIMIT = {
  DEFAULT_LIMIT: 10,
  DEFAULT_WINDOW: 60, // seconds
  COINMARKETCAP_DELAY: 250, // milliseconds delay between CoinMarketCap requests (free tier: 10,000/month)
  // Enhanced rate limiting configuration
  COINMARKETCAP_MAX_RETRIES: 5,
  COINMARKETCAP_INITIAL_BACKOFF: 1000, // 1 second
  COINMARKETCAP_MAX_BACKOFF: 32000, // 32 seconds
  COINMARKETCAP_BACKOFF_MULTIPLIER: 2,
  COINMARKETCAP_JITTER_MAX: 1000, // max random jitter in ms
  QUEUE_MAX_SIZE: 100,
  QUEUE_TIMEOUT: 30000, // 30 seconds max wait in queue
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: 5,
  CIRCUIT_BREAKER_RECOVERY_TIMEOUT: 60000 // 1 minute
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