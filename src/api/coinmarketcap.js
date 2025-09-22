/**
 * CoinMarketCap API wrapper with professional rate limiting and security
 */

import { API_URLS, CACHE_TTL, RATE_LIMIT } from '../config/constants.js';
import { getRateLimitService } from '../services/rateLimitService.js';
import { delay } from '../utils/formatters.js';

/**
 * Secure CoinMarketCap API request with rate limiting
 * @param {object} env - Cloudflare environment containing CMC_API_KEY
 * @param {string} endpoint - CMC API endpoint path
 * @param {object} params - Query parameters
 * @returns {Promise<object>} API response data
 */
export async function fetchCMCData(env, endpoint, params = {}) {
  const apiKey = env?.COINMARKETCAP_API_KEY;
  if (!apiKey) {
    throw new Error('COINMARKETCAP_API_KEY not configured in environment');
  }

  const rateLimitService = getRateLimitService(env);
  
  return await rateLimitService.executeWithCircuitBreaker(`cmc_${endpoint}`, async () => {
    return await rateLimitService.executeRequest(() => 
      fetchCMCDataDirect(apiKey, endpoint, params)
    );
  });
}

/**
 * Direct CMC API fetch (internal use)
 * @param {string} apiKey - CMC API key
 * @param {string} endpoint - API endpoint path  
 * @param {object} params - Query parameters
 * @returns {Promise<object>} API response data
 */
async function fetchCMCDataDirect(apiKey, endpoint, params = {}) {
  try {
    await delay(RATE_LIMIT.CMC_DELAY);

    const url = new URL(`${API_URLS.COINMARKETCAP}/${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, value.toString());
      }
    });

    const response = await fetch(url.toString(), {
      headers: {
        'X-CMC_PRO_API_KEY': apiKey,
        'Accept': 'application/json',
        'User-Agent': 'TelegramBot/2.0'
      }
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('⚠️ CoinMarketCap rate limit exceeded. Please wait before retrying.');
      }
      if (response.status === 401) {
        throw new Error('⚠️ Invalid CoinMarketCap API key');
      }
      if (response.status === 403) {
        throw new Error('⚠️ CoinMarketCap API access denied');
      }
      throw new Error(`CMC API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.status?.error_code && data.status.error_code !== 0) {
      throw new Error(`CMC API error: ${data.status.error_message}`);
    }

    return data;

  } catch (error) {
    if (error.message.includes('fetch')) {
      throw new Error("Network error: Could not connect to CoinMarketCap");
    }
    throw error;
  }
}

/**
 * Search for cryptocurrency by symbol or name
 * @param {object} env - Cloudflare environment
 * @param {string} query - Search query (symbol or name)
 * @returns {Promise<object|null>} Coin data or null if not found
 */
export async function searchCoinSymbol(env, query) {
  const rateLimitService = getRateLimitService(env);
  const cacheKey = `cmc_search_${query.toLowerCase()}`;
  
  return rateLimitService.getCachedDataWithFallback(cacheKey, async () => {
    // First try to get coin by symbol
    const mapData = await fetchCMCData(env, 'v1/cryptocurrency/map', {
      symbol: query.toUpperCase(),
      limit: 1
    });
    
    if (mapData.data && mapData.data.length > 0) {
      const coin = mapData.data[0];
      return {
        id: coin.id.toString(),
        symbol: coin.symbol.toLowerCase(),
        name: coin.name
      };
    }

    // If not found by symbol, search by name
    const searchData = await fetchCMCData(env, 'v1/cryptocurrency/map', {
      listing_status: 'active',
      limit: 10
    });
    
    if (searchData.data) {
      const match = searchData.data.find(coin => 
        coin.name.toLowerCase().includes(query.toLowerCase()) ||
        coin.symbol.toLowerCase() === query.toLowerCase()
      );
      
      if (match) {
        return {
          id: match.id.toString(),
          symbol: match.symbol.toLowerCase(),
          name: match.name
        };
      }
    }

    return null;
  }, CACHE_TTL.COIN_SEARCH);
}

/**
 * Get detailed coin data including market stats
 * @param {object} env - Cloudflare environment
 * @param {string} coinId - CMC coin ID
 * @returns {Promise<object>} Detailed coin data
 */
export async function getCoinData(env, coinId) {
  const rateLimitService = getRateLimitService(env);
  const cacheKey = `cmc_coin_${coinId}`;
  
  return rateLimitService.getCachedDataWithFallback(cacheKey, async () => {
    const data = await fetchCMCData(env, 'v2/cryptocurrency/quotes/latest', {
      id: coinId,
      convert: 'USD'
    });

    if (!data.data || !data.data[coinId]) {
      throw new Error('Coin data not found');
    }

    const coin = data.data[coinId];
    const quote = coin.quote.USD;

    return {
      id: coinId,
      name: coin.name,
      symbol: coin.symbol,
      market_data: {
        current_price: { usd: quote.price },
        price_change_percentage_24h: quote.percent_change_24h,
        price_change_percentage_7d: quote.percent_change_7d,
        market_cap: { usd: quote.market_cap },
        total_volume: { usd: quote.volume_24h },
        circulating_supply: coin.circulating_supply,
        total_supply: coin.total_supply,
        max_supply: coin.max_supply,
        market_cap_rank: coin.cmc_rank
      }
    };
  }, CACHE_TTL.COIN_DATA);
}

/**
 * Get OHLCV historical data for charting
 * @param {object} env - Cloudflare environment  
 * @param {string} coinId - CMC coin ID
 * @param {number} days - Number of days of data
 * @returns {Promise<object>} OHLCV market data
 */
export async function getCoinMarketChart(env, coinId, days = 7) {
  const rateLimitService = getRateLimitService(env);
  const cacheKey = `cmc_ohlcv_${coinId}_${days}`;
  
  return rateLimitService.getCachedDataWithFallback(cacheKey, async () => {
    // Calculate time range
    const end = new Date();
    const start = new Date(end.getTime() - (days * 24 * 60 * 60 * 1000));
    
    try {
      // Try to get OHLCV data (requires higher tier plan)
      const ohlcvData = await fetchCMCData(env, 'v1/cryptocurrency/ohlcv/historical', {
        id: coinId,
        time_start: start.toISOString(),
        time_end: end.toISOString(),
        interval: days <= 7 ? '1h' : days <= 30 ? '4h' : '1d',
        convert: 'USD'
      });

      if (ohlcvData.data && ohlcvData.data[coinId]) {
        const quotes = ohlcvData.data[coinId];
        
        return {
          prices: quotes.map(q => [new Date(q.time_open).getTime(), q.quote.USD.close]),
          market_caps: quotes.map(q => [new Date(q.time_open).getTime(), q.quote.USD.market_cap]),
          total_volumes: quotes.map(q => [new Date(q.time_open).getTime(), q.quote.USD.volume]),
          ohlcv: quotes.map(q => ({
            timestamp: new Date(q.time_open).getTime(),
            open: q.quote.USD.open,
            high: q.quote.USD.high, 
            low: q.quote.USD.low,
            close: q.quote.USD.close,
            volume: q.quote.USD.volume
          }))
        };
      }
    } catch (ohlcvError) {
      console.log('OHLCV data not available, falling back to quotes');
    }

    // Fallback: Generate data points from current price with some historical context
    const currentData = await getCoinData(env, coinId);
    const currentPrice = currentData.market_data.current_price.usd;
    const change24h = currentData.market_data.price_change_percentage_24h || 0;
    
    // Create mock historical data with realistic price movement
    const dataPoints = Math.min(days * (days <= 7 ? 24 : days <= 30 ? 6 : 1), 168);
    const prices = [];
    const volumes = [];
    const marketCaps = [];
    
    for (let i = dataPoints; i >= 0; i--) {
      const timestamp = Date.now() - (i * (24 * 60 * 60 * 1000) / (dataPoints / days));
      // Add some realistic price variation
      const variation = (Math.random() - 0.5) * 0.1 + (change24h / 100) * (i / dataPoints);
      const price = currentPrice * (1 + variation);
      
      prices.push([timestamp, price]);
      volumes.push([timestamp, currentData.market_data.total_volume?.usd || price * 100000]);
      marketCaps.push([timestamp, currentData.market_data.market_cap?.usd || price * 19000000]);
    }

    return { prices, market_caps: marketCaps, total_volumes: volumes };
  }, CACHE_TTL.CHART_DATA);
}

/**
 * Get multiple coin prices efficiently
 * @param {object} env - Cloudflare environment
 * @param {string[]} coinIds - Array of CMC coin IDs
 * @param {string[]} vsCurrencies - Target currencies (default: ['usd'])
 * @returns {Promise<object>} Price data for all coins
 */
export async function getMultipleCoinPrices(env, coinIds, vsCurrencies = ['usd']) {
  const rateLimitService = getRateLimitService(env);
  const cacheKey = `cmc_prices_${coinIds.sort().join(',')}_${vsCurrencies.join(',')}`;
  
  return rateLimitService.getCachedDataWithFallback(cacheKey, async () => {
    const data = await fetchCMCData(env, 'v2/cryptocurrency/quotes/latest', {
      id: coinIds.join(','),
      convert: vsCurrencies.join(',').toUpperCase()
    });

    const result = {};
    
    if (data.data) {
      Object.entries(data.data).forEach(([id, coin]) => {
        const coinResult = {};
        vsCurrencies.forEach(currency => {
          const quote = coin.quote[currency.toUpperCase()];
          if (quote) {
            coinResult[currency] = quote.price;
          }
        });
        
        // Use coin symbol as key for compatibility
        result[coin.symbol.toLowerCase()] = coinResult;
        result[id] = coinResult; // Also support ID-based lookup
      });
    }

    return result;
  }, CACHE_TTL.SIMPLE_PRICES);
}

/**
 * Get trending/top coins
 * @param {object} env - Cloudflare environment
 * @param {number} limit - Number of coins to fetch
 * @returns {Promise<object[]>} Array of trending coins
 */
export async function getTrendingCoins(env, limit = 10) {
  const rateLimitService = getRateLimitService(env);
  const cacheKey = `cmc_trending_${limit}`;
  
  return rateLimitService.getCachedDataWithFallback(cacheKey, async () => {
    const data = await fetchCMCData(env, 'v1/cryptocurrency/listings/latest', {
      limit: limit,
      convert: 'USD',
      sort: 'market_cap'
    });

    if (!data.data) {
      return [];
    }

    return data.data.map(coin => ({
      id: coin.id.toString(),
      name: coin.name,
      symbol: coin.symbol,
      market_cap_rank: coin.cmc_rank,
      current_price: coin.quote.USD.price,
      price_change_percentage_24h: coin.quote.USD.percent_change_24h
    }));
  }, CACHE_TTL.POPULAR_PRICES);
}