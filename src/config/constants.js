/**
 * Configuration constants for the Telegram Crypto Bot
 */

export const API_URLS = {
  BINANCE_BACKEND: 'https://my-telegram-bot-backend.onrender.com/binancep2p',
  COINMARKETCAP: 'https://pro-api.coinmarketcap.com',
  CHART_IMAGE: 'https://quickchart.io/chart',
  TELEGRAM_BOT: 'https://api.telegram.org/bot'
};

export const SUPPORTED_ASSETS = ['USDT', 'BTC', 'ETH', 'BNB', 'BUSD'];

export const SUPPORTED_FIATS = ['ETB', 'USD', 'EUR', 'GBP', 'NGN', 'KES', 'GHS'];

// Popular trading pairs that benefit from extended caching and priority handling
export const POPULAR_COINS = ['bitcoin', 'ethereum', 'tether', 'binancecoin', 'cardano', 'solana', 'dogecoin'];

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
  CMC_DELAY: 200, // milliseconds delay between CMC requests (10,000 calls/month basic plan)
  // Enhanced rate limiting configuration
  CMC_MAX_RETRIES: 3,
  CMC_INITIAL_BACKOFF: 2000, // 2 seconds
  CMC_MAX_BACKOFF: 16000, // 16 seconds
  CMC_BACKOFF_MULTIPLIER: 2,
  CMC_JITTER_MAX: 1000, // max random jitter in ms
  QUEUE_MAX_SIZE: 100,
  QUEUE_TIMEOUT: 30000, // 30 seconds max wait in queue
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: 5,
  CIRCUIT_BREAKER_RECOVERY_TIMEOUT: 60000 // 1 minute
};

export const CHART_CONFIG = {
  DEFAULT_DAYS: 7,
  AVAILABLE_TIMEFRAMES: ['1', '7', '30'],
  DEFAULT_WIDTH: 1200,
  DEFAULT_HEIGHT: 600,
  BACKGROUND_COLOR: 'rgba(17,17,17,0.95)',
  LINE_COLOR: '#00ff88',
  FILL_COLOR: 'rgba(0, 255, 136, 0.1)',
  // Professional charting options
  THEMES: {
    DARK: {
      background: '#1a1a1a',
      text: '#ffffff',
      grid: 'rgba(255, 255, 255, 0.1)',
      candleUp: '#00ff88',
      candleDown: '#ff4757',
      volume: 'rgba(100, 149, 237, 0.7)',
      ma20: '#ffa502',
      ma50: '#ff6348',
      rsi: '#70a1ff',
      macd: '#5352ed'
    },
    LIGHT: {
      background: '#ffffff',
      text: '#333333',
      grid: 'rgba(0, 0, 0, 0.1)',
      candleUp: '#26a69a',
      candleDown: '#ef5350',
      volume: 'rgba(33, 150, 243, 0.7)',
      ma20: '#ff9800',
      ma50: '#f44336',
      rsi: '#2196f3',
      macd: '#9c27b0'
    }
  },
  INDICATORS: {
    RSI_PERIOD: 14,
    MACD_FAST: 12,
    MACD_SLOW: 26,
    MACD_SIGNAL: 9,
    MA_PERIODS: [20, 50]
  }
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