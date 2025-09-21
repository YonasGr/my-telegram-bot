/**
 * CoinGecko API wrapper with enhanced error handling and rate limiting
 */

import { API_URLS, CACHE_TTL, RATE_LIMIT } from '../config/constants.js';
import { getWithCache } from '../cache/rateLimiting.js';
import { delay } from '../utils/formatters.js';
import { getRateLimitService } from '../services/rateLimitService.js';

/**
 * Enhanced fetchCoinGeckoData with professional rate limiting
 * @param {string} endpoint - API endpoint path
 * @param {object} env - Cloudflare environment (optional for backwards compatibility)
 * @returns {Promise<object>} API response data
 */
export async function fetchCoinGeckoData(endpoint, env = null) {
  // If env is provided, use the enhanced rate limiting service
  if (env) {
    const rateLimitService = getRateLimitService(env);
    
    // Implement the fetchCoinGeckoData method for the service
    rateLimitService.fetchCoinGeckoData = async (endpoint) => {
      return await fetchCoinGeckoDataDirect(endpoint);
    };

    return await rateLimitService.executeWithCircuitBreaker(endpoint, async () => {
      return await rateLimitService.executeRequest(() => fetchCoinGeckoDataDirect(endpoint));
    });
  }
  
  // Fallback to direct fetch for backwards compatibility
  return await fetchCoinGeckoDataDirect(endpoint);
}

/**
 * Direct CoinGecko API fetch (internal use)
 * @param {string} endpoint - API endpoint path
 * @returns {Promise<object>} API response data
 */
async function fetchCoinGeckoDataDirect(endpoint) {
  try {
    // Add delay to respect rate limits
    await delay(RATE_LIMIT.COINGECKO_DELAY);

    console.log(`Fetching CoinGecko data: ${endpoint}`);
    
    const response = await fetch(`${API_URLS.COINGECKO}${endpoint}`, {
      headers: {
        'User-Agent': 'TelegramBot/1.0',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 429) {
        // Enhanced rate limit error with retry suggestion
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) : 60;
        throw new Error(`⚠️ CoinGecko API rate limit exceeded. Please try again in ${waitTime} seconds.`);
      } else if (response.status === 404) {
        throw new Error("Cryptocurrency not found");
      } else if (response.status >= 500) {
        throw new Error("CoinGecko service temporarily unavailable");
      } else {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }
    }

    const data = await response.json();
    console.log(`Successfully fetched CoinGecko data from: ${endpoint}`);
    return data;

  } catch (error) {
    console.error("Error fetching CoinGecko data:", error);
    
    if (error.message.includes('fetch')) {
      throw new Error("Network error: Could not connect to CoinGecko");
    } else {
      throw error;
    }
  }
}

/**
 * Enhanced coin search with fallback caching
 * @param {object} env - Cloudflare environment
 * @param {string} symbol - Coin symbol or name to search
 * @returns {Promise<object|null>} Coin data or null if not found
 */
export async function searchCoinSymbol(env, symbol) {
  const rateLimitService = getRateLimitService(env);
  const cacheKey = `coin_search_${symbol.toLowerCase()}`;
  
  return rateLimitService.getCachedDataWithFallback(cacheKey, async () => {
    const requestKey = `coin_list_search`;
    return rateLimitService.deduplicateRequest(requestKey, async () => {
      const coinList = await fetchCoinGeckoData('/coins/list', env);
      
      const searchTerm = symbol.toLowerCase();
      const matches = coinList.filter(coin =>
        coin.symbol.toLowerCase() === searchTerm ||
        coin.id.toLowerCase() === searchTerm ||
        coin.name.toLowerCase().includes(searchTerm)
      );

      // Prioritize exact symbol matches
      const exactSymbolMatch = matches.find(coin => coin.symbol.toLowerCase() === searchTerm);
      if (exactSymbolMatch) return exactSymbolMatch;

      // Then exact ID matches  
      const exactIdMatch = matches.find(coin => coin.id.toLowerCase() === searchTerm);
      if (exactIdMatch) return exactIdMatch;

      // Finally return first match or null
      return matches.length > 0 ? matches[0] : null;
    });
  }, CACHE_TTL.COIN_SEARCH);
}

/**
 * Enhanced coin data fetching with rate limiting
 * @param {object} env - Cloudflare environment
 * @param {string} coinId - CoinGecko coin ID
 * @returns {Promise<object>} Detailed coin data
 */
export async function getCoinData(env, coinId) {
  const rateLimitService = getRateLimitService(env);
  const cacheKey = `coin_data_${coinId}`;
  
  // Use longer cache for popular coins
  const ttl = rateLimitService.getCacheTTLForCoin(coinId) === CACHE_TTL.POPULAR_PRICES 
    ? CACHE_TTL.COIN_DATA * 2 
    : CACHE_TTL.COIN_DATA;
  
  return rateLimitService.getCachedDataWithFallback(cacheKey, () => {
    return fetchCoinGeckoData(
      `/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`,
      env
    );
  }, ttl);
}


/**
 * Enhanced multiple coin prices with smart caching and rate limiting
 * @param {object} env - Cloudflare environment
 * @param {string[]} coinIds - Array of coin IDs
 * @param {string[]} vsCurrencies - Array of currencies to get prices in
 * @returns {Promise<object>} Price data
 */
export async function getMultipleCoinPrices(env, coinIds, vsCurrencies) {
  const rateLimitService = getRateLimitService(env);
  
  // Check if we should use fallback cache due to service issues
  const shouldUseFallback = await rateLimitService.shouldUseFallbackCache('/simple/price');
  if (shouldUseFallback) {
    console.log('Using fallback caching strategy due to service issues');
  }
  
  const coinIdString = coinIds.join(',');
  const vsCurrencyString = vsCurrencies.join(',');
  const cacheKey = `simple_prices_${coinIdString}_${vsCurrencyString}`;
  
  // Determine cache TTL based on coin popularity
  const hasPopularCoins = coinIds.some(id => rateLimitService.getCacheTTLForCoin(id) === CACHE_TTL.POPULAR_PRICES);
  const ttl = hasPopularCoins ? CACHE_TTL.POPULAR_PRICES : CACHE_TTL.SIMPLE_PRICES;
  
  if (shouldUseFallback) {
    return rateLimitService.getCachedDataWithFallback(cacheKey, async () => {
      return rateLimitService.batchPriceRequests(coinIds, vsCurrencies);
    }, ttl);
  }
  
  return getWithCache(env, cacheKey, async () => {
    // Use deduplication for concurrent identical requests
    const requestKey = `prices_${coinIdString}_${vsCurrencyString}`;
    return rateLimitService.deduplicateRequest(requestKey, async () => {
      return rateLimitService.batchPriceRequests(coinIds, vsCurrencies);
    });
  }, ttl);
}

/**
 * Enhanced market chart data with rate limiting
 * @param {object} env - Cloudflare environment
 * @param {string} coinId - CoinGecko coin ID
 * @param {number} days - Number of days for chart data
 * @returns {Promise<object>} Market chart data
 */
export async function getCoinMarketChart(env, coinId, days = 7) {
  const rateLimitService = getRateLimitService(env);
  const cacheKey = `coin_chart_${coinId}_${days}`;
  
  return rateLimitService.getCachedDataWithFallback(cacheKey, () => {
    return fetchCoinGeckoData(`/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`, env);
  }, CACHE_TTL.CHART_DATA);
}

/**
 * Enhanced trending coins with caching
 * @param {object} env - Cloudflare environment
 * @returns {Promise<object>} Trending coins data
 */
export async function getTrendingCoins(env) {
  const rateLimitService = getRateLimitService(env);
  const cacheKey = 'trending_coins';
  
  return rateLimitService.getCachedDataWithFallback(cacheKey, () => {
    return fetchCoinGeckoData('/search/trending', env);
  }, 1800); // 30 minutes cache for trending
}

/**
 * Enhanced global market data with caching
 * @param {object} env - Cloudflare environment
 * @returns {Promise<object>} Global market data
 */
export async function getGlobalMarketData(env) {
  const rateLimitService = getRateLimitService(env);
  const cacheKey = 'global_market_data';
  
  return rateLimitService.getCachedDataWithFallback(cacheKey, () => {
    return fetchCoinGeckoData('/global', env);
  }, 3600); // 1 hour cache for global data
}

/**
 * Enhanced coin search with caching
 * @param {object} env - Cloudflare environment
 * @param {string} query - Search query
 * @returns {Promise<object>} Search results
 */
export async function searchCoins(env, query) {
  const rateLimitService = getRateLimitService(env);
  const cacheKey = `coin_search_query_${query.toLowerCase()}`;
  
  return rateLimitService.getCachedDataWithFallback(cacheKey, () => {
    return fetchCoinGeckoData(`/search?query=${encodeURIComponent(query)}`, env);
  }, 3600);
}

/**
 * Enhanced top coins with caching
 * @param {object} env - Cloudflare environment
 * @param {number} perPage - Number of coins per page
 * @param {number} page - Page number
 * @returns {Promise<object[]>} Market data for top coins
 */
export async function getTopCoins(env, perPage = 10, page = 1) {
  const rateLimitService = getRateLimitService(env);
  const cacheKey = `top_coins_${perPage}_${page}`;
  
  return rateLimitService.getCachedDataWithFallback(cacheKey, () => {
    return fetchCoinGeckoData(
      `/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=false`,
      env
    );
  }, 1800); // 30 minutes cache
}