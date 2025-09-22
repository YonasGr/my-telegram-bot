/**
 * Coinlayer API wrapper with enhanced error handling and rate limiting
 */

import { API_URLS, CACHE_TTL, RATE_LIMIT } from '../config/constants.js';
import { getWithCache } from '../cache/rateLimiting.js';
import { delay } from '../utils/formatters.js';
import { getRateLimitService } from '../services/rateLimitService.js';

// Coinlayer API key (do not expose in logs)
const COINLAYER_API_KEY = '2724eb8e3b8ef553e5911d46e0f44bec';

/**
 * Enhanced fetchCoinlayerData with professional rate limiting
 * @param {string} endpoint - API endpoint path
 * @param {object} params - Additional query parameters
 * @param {object} env - Cloudflare environment (optional for backwards compatibility)
 * @returns {Promise<object>} API response data
 */
export async function fetchCoinlayerData(endpoint, params = {}, env = null) {
  // If env is provided, use the enhanced rate limiting service
  if (env) {
    const rateLimitService = getRateLimitService(env);
    
    // Implement the fetchCoinlayerData method for the service
    rateLimitService.fetchCoinlayerData = async (endpoint, params) => {
      return await fetchCoinlayerDataDirect(endpoint, params);
    };

    return await rateLimitService.executeWithCircuitBreaker(endpoint, async () => {
      return await rateLimitService.executeRequest(() => fetchCoinlayerDataDirect(endpoint, params));
    });
  }
  
  // Fallback to direct fetch for backwards compatibility
  return await fetchCoinlayerDataDirect(endpoint, params);
}

/**
 * Direct Coinlayer API fetch (internal use)
 * @param {string} endpoint - API endpoint path
 * @param {object} params - Additional query parameters
 * @returns {Promise<object>} API response data
 */
async function fetchCoinlayerDataDirect(endpoint, params = {}) {
  try {
    // Add delay to respect rate limits
    await delay(RATE_LIMIT.COINLAYER_DELAY);

    // Build URL with API key and params
    const url = new URL(`${API_URLS.COINLAYER}/${endpoint}`);
    url.searchParams.set('access_key', COINLAYER_API_KEY);
    
    // Add additional parameters
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    console.log(`Fetching Coinlayer data: ${endpoint}`);
    
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'TelegramBot/1.0',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 429) {
        // Rate limit error
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) : 60;
        throw new Error(`⚠️ Coinlayer API rate limit exceeded. Please try again in ${waitTime} seconds.`);
      } else if (response.status === 404) {
        throw new Error("Cryptocurrency not found");
      } else if (response.status >= 500) {
        throw new Error("Coinlayer service temporarily unavailable");
      } else {
        throw new Error(`Coinlayer API error: ${response.status}`);
      }
    }

    const data = await response.json();
    
    // Check for API-level errors
    if (!data.success && data.error) {
      const error = data.error;
      if (error.code === 104) { // Monthly API limit reached
        throw new Error("⚠️ Monthly API limit reached. Please try again next month.");
      } else if (error.code === 105) { // Invalid API function
        throw new Error("Invalid API request");
      } else if (error.code === 201) { // Invalid currency code
        throw new Error("Cryptocurrency not found");
      } else {
        throw new Error(`Coinlayer API error: ${error.info || 'Unknown error'}`);
      }
    }

    console.log(`Successfully fetched Coinlayer data from: ${endpoint}`);
    return data;

  } catch (error) {
    console.error("Error fetching Coinlayer data:", error);
    
    if (error.message.includes('fetch')) {
      throw new Error("Network error: Could not connect to Coinlayer");
    } else {
      throw error;
    }
  }
}

/**
 * Search for a coin by symbol or name using Coinlayer supported currencies
 * @param {object} env - Cloudflare environment
 * @param {string} symbol - Coin symbol or name to search
 * @returns {Promise<object|null>} Coin data or null if not found
 */
export async function searchCoinSymbol(env, symbol) {
  const rateLimitService = getRateLimitService(env);
  const cacheKey = `coin_search_${symbol.toLowerCase()}`;
  
  return rateLimitService.getCachedDataWithFallback(cacheKey, async () => {
    // Get list of supported currencies from Coinlayer
    const supportedData = await fetchCoinlayerData('list', {}, env);
    
    if (!supportedData.success || !supportedData.crypto) {
      throw new Error("Could not fetch supported currencies");
    }

    const searchTerm = symbol.toLowerCase();
    const cryptos = supportedData.crypto;
    
    // Find matches by symbol or name
    let matches = [];
    for (const [code, info] of Object.entries(cryptos)) {
      if (code.toLowerCase() === searchTerm || 
          info.symbol.toLowerCase() === searchTerm ||
          info.name.toLowerCase().includes(searchTerm)) {
        matches.push({
          id: code.toLowerCase(),
          symbol: info.symbol,
          name: info.name
        });
      }
    }

    // Prioritize exact symbol matches
    const exactSymbolMatch = matches.find(coin => coin.symbol.toLowerCase() === searchTerm);
    if (exactSymbolMatch) return exactSymbolMatch;

    // Then exact ID matches  
    const exactIdMatch = matches.find(coin => coin.id.toLowerCase() === searchTerm);
    if (exactIdMatch) return exactIdMatch;

    // Finally return first match or null
    return matches.length > 0 ? matches[0] : null;
  }, CACHE_TTL.COIN_SEARCH);
}

/**
 * Get current prices for multiple cryptocurrencies
 * @param {object} env - Cloudflare environment
 * @param {string[]} coinIds - Array of coin symbols
 * @param {string[]} vsCurrencies - Array of target currencies
 * @returns {Promise<object>} Price data
 */
export async function getMultipleCoinPrices(env, coinIds, vsCurrencies) {
  const rateLimitService = getRateLimitService(env);
  
  const coinIdString = coinIds.join(',');
  const vsCurrencyString = vsCurrencies.join(',');
  const cacheKey = `simple_prices_${coinIdString}_${vsCurrencyString}`;
  
  return rateLimitService.getCachedDataWithFallback(cacheKey, async () => {
    // Get live rates from Coinlayer
    const liveData = await fetchCoinlayerData('live', {}, env);
    
    if (!liveData.success || !liveData.rates) {
      throw new Error("Could not fetch live rates");
    }

    // Transform the data to match expected format
    const result = {};
    const rates = liveData.rates;
    
    for (const coinId of coinIds) {
      const coinSymbol = coinId.toUpperCase();
      if (rates[coinSymbol]) {
        result[coinId] = {};
        
        for (const currency of vsCurrencies) {
          const currencyUpper = currency.toUpperCase();
          
          if (currencyUpper === 'USD') {
            // Direct USD rate from Coinlayer
            result[coinId][currency.toLowerCase()] = rates[coinSymbol];
          } else if (rates[currencyUpper]) {
            // Convert through USD: (crypto/USD) / (target/USD)
            result[coinId][currency.toLowerCase()] = rates[coinSymbol] / rates[currencyUpper];
          }
        }
      }
    }
    
    return result;
  }, CACHE_TTL.SIMPLE_PRICES);
}

/**
 * Get detailed coin data (limited by Coinlayer capabilities)
 * @param {object} env - Cloudflare environment
 * @param {string} coinId - Coin identifier
 * @returns {Promise<object>} Detailed coin data
 */
export async function getCoinData(env, coinId) {
  const rateLimitService = getRateLimitService(env);
  const cacheKey = `coin_data_${coinId}`;
  
  return rateLimitService.getCachedDataWithFallback(cacheKey, async () => {
    // Get live rates and supported currencies info
    const [liveData, supportedData] = await Promise.all([
      fetchCoinlayerData('live', {}, env),
      fetchCoinlayerData('list', {}, env)
    ]);
    
    if (!liveData.success || !supportedData.success) {
      throw new Error("Could not fetch coin data");
    }

    const coinSymbol = coinId.toUpperCase();
    const rate = liveData.rates[coinSymbol];
    const coinInfo = supportedData.crypto[coinSymbol];
    
    if (!rate || !coinInfo) {
      throw new Error("Cryptocurrency not found");
    }

    // Create a structure similar to what the previous API provided
    return {
      id: coinId,
      symbol: coinInfo.symbol,
      name: coinInfo.name,
      market_data: {
        current_price: {
          usd: rate
        },
        // Note: Coinlayer doesn't provide these metrics, using null/0
        price_change_percentage_24h: 0,
        market_cap: { usd: 0 },
        total_volume: { usd: 0 },
        circulating_supply: 0,
        max_supply: null
      },
      description: {
        en: `${coinInfo.name} (${coinInfo.symbol}) - Live rate from Coinlayer API`
      },
      links: {
        homepage: [],
        blockchain_site: []
      }
    };
  }, CACHE_TTL.COIN_DATA);
}

/**
 * Get historical market chart data (limited - Coinlayer historical requires paid plan)
 * @param {object} env - Cloudflare environment
 * @param {string} coinId - Coin identifier
 * @param {number} days - Number of days for chart data
 * @returns {Promise<object>} Market chart data
 */
export async function getCoinMarketChart(env, coinId, days = 7) {
  const rateLimitService = getRateLimitService(env);
  const cacheKey = `coin_chart_${coinId}_${days}`;
  
  return rateLimitService.getCachedDataWithFallback(cacheKey, async () => {
    // Note: Coinlayer free tier doesn't support historical data
    // Return mock data structure for compatibility
    console.log(`Historical data not available for ${coinId} - using current price only`);
    
    const currentPrice = await getMultipleCoinPrices(env, [coinId], ['usd']);
    const price = currentPrice[coinId]?.usd || 0;
    
    // Create mock historical data with current price
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    
    const prices = [];
    for (let i = days; i >= 0; i--) {
      prices.push([now - (i * dayMs), price]);
    }
    
    return {
      prices: prices,
      market_caps: prices.map(([timestamp, price]) => [timestamp, price * 1000000]), // Mock market cap
      total_volumes: prices.map(([timestamp, price]) => [timestamp, price * 100000]) // Mock volume
    };
  }, CACHE_TTL.CHART_DATA);
}

/**
 * Get trending coins (not available in Coinlayer - return popular coins)
 * @param {object} env - Cloudflare environment
 * @returns {Promise<object>} Trending coins data
 */
export async function getTrendingCoins(env) {
  const rateLimitService = getRateLimitService(env);
  const cacheKey = 'trending_coins';
  
  return rateLimitService.getCachedDataWithFallback(cacheKey, async () => {
    // Return popular cryptocurrencies since Coinlayer doesn't have trending
    const popularCoins = ['BTC', 'ETH', 'BNB', 'ADA', 'SOL', 'DOT', 'DOGE'];
    const prices = await getMultipleCoinPrices(env, popularCoins.map(c => c.toLowerCase()), ['usd']);
    
    const coins = popularCoins.map(symbol => {
      const coinId = symbol.toLowerCase();
      return {
        item: {
          id: coinId,
          coin_id: coinId,
          name: symbol, // Simplified name
          symbol: symbol,
          market_cap_rank: 1,
          thumb: ``,
          price_btc: prices[coinId]?.usd || 0
        }
      };
    });

    return {
      coins: coins
    };
  }, 1800); // 30 minutes cache for trending
}

/**
 * Search coins by query (simplified for Coinlayer)
 * @param {object} env - Cloudflare environment
 * @param {string} query - Search query
 * @returns {Promise<object>} Search results
 */
export async function searchCoins(env, query) {
  const rateLimitService = getRateLimitService(env);
  const cacheKey = `coin_search_query_${query.toLowerCase()}`;
  
  return rateLimitService.getCachedDataWithFallback(cacheKey, async () => {
    const coin = await searchCoinSymbol(env, query);
    
    return {
      coins: coin ? [coin] : []
    };
  }, 3600);
}

/**
 * Get top coins by market cap (simplified for Coinlayer)
 * @param {object} env - Cloudflare environment
 * @param {number} perPage - Number of coins per page
 * @param {number} page - Page number
 * @returns {Promise<object[]>} Market data for top coins
 */
export async function getTopCoins(env, perPage = 10, page = 1) {
  const rateLimitService = getRateLimitService(env);
  const cacheKey = `top_coins_${perPage}_${page}`;
  
  return rateLimitService.getCachedDataWithFallback(cacheKey, async () => {
    // Return popular coins since Coinlayer doesn't have market cap ranking
    const popularCoins = ['bitcoin', 'ethereum', 'binancecoin', 'cardano', 'solana', 'polkadot', 'dogecoin', 'chainlink', 'litecoin', 'polygon'];
    const requestedCoins = popularCoins.slice((page - 1) * perPage, page * perPage);
    
    const prices = await getMultipleCoinPrices(env, requestedCoins, ['usd']);
    
    return requestedCoins.map((coinId, index) => ({
      id: coinId,
      symbol: coinId.substr(0, 3).toUpperCase(),
      name: coinId.charAt(0).toUpperCase() + coinId.slice(1),
      current_price: prices[coinId]?.usd || 0,
      market_cap_rank: (page - 1) * perPage + index + 1,
      price_change_percentage_24h: 0, // Not available in Coinlayer free tier
      market_cap: 0, // Not available in Coinlayer free tier
      total_volume: 0 // Not available in Coinlayer free tier
    }));
  }, 1800); // 30 minutes cache
}

/**
 * Get global market data (not available in Coinlayer)
 * @param {object} env - Cloudflare environment
 * @returns {Promise<object>} Global market data
 */
export async function getGlobalMarketData(env) {
  const rateLimitService = getRateLimitService(env);
  const cacheKey = 'global_market_data';
  
  return rateLimitService.getCachedDataWithFallback(cacheKey, async () => {
    // Return mock global data since not available in Coinlayer
    return {
      data: {
        active_cryptocurrencies: 100,
        markets: 500,
        total_market_cap: { usd: 1000000000 },
        total_volume: { usd: 50000000 },
        market_cap_percentage: { btc: 45, eth: 20 }
      }
    };
  }, 3600); // 1 hour cache for global data
}