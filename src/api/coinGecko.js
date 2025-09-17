/**
 * CoinGecko API wrapper with enhanced error handling and rate limiting
 */

import { API_URLS, CACHE_TTL, RATE_LIMIT } from '../config/constants.js';
import { getWithCache } from '../cache/rateLimiting.js';
import { delay } from '../utils/formatters.js';

/**
 * Fetches data from CoinGecko API with rate limiting
 * @param {string} endpoint - API endpoint path
 * @returns {Promise<object>} API response data
 */
export async function fetchCoinGeckoData(endpoint) {
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
        throw new Error("⚠️ CoinGecko API rate limit exceeded. Please try again in a minute.");
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
 * Searches for a coin by symbol or name
 * @param {object} env - Cloudflare environment
 * @param {string} symbol - Coin symbol or name to search
 * @returns {Promise<object|null>} Coin data or null if not found
 */
export async function searchCoinSymbol(env, symbol) {
  const cacheKey = `coin_search_${symbol.toLowerCase()}`;
  
  return getWithCache(env, cacheKey, async () => {
    const coinList = await fetchCoinGeckoData('/coins/list');
    
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
  }, CACHE_TTL.COIN_SEARCH);
}

/**
 * Gets detailed coin data
 * @param {object} env - Cloudflare environment
 * @param {string} coinId - CoinGecko coin ID
 * @returns {Promise<object>} Detailed coin data
 */
export async function getCoinData(env, coinId) {
  const cacheKey = `coin_data_${coinId}`;
  
  return getWithCache(env, cacheKey, () => {
    return fetchCoinGeckoData(
      `/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`
    );
  }, CACHE_TTL.COIN_DATA);
}

/**
 * Gets coin market chart data
 * @param {object} env - Cloudflare environment
 * @param {string} coinId - CoinGecko coin ID
 * @param {number} days - Number of days for chart data
 * @returns {Promise<object>} Market chart data
 */
export async function getCoinMarketChart(env, coinId, days = 7) {
  const cacheKey = `coin_chart_${coinId}_${days}`;
  
  return getWithCache(env, cacheKey, () => {
    return fetchCoinGeckoData(`/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`);
  }, CACHE_TTL.CHART_DATA);
}

/**
 * Gets simple price data for multiple coins
 * @param {object} env - Cloudflare environment
 * @param {string[]} coinIds - Array of coin IDs
 * @param {string[]} vsCurrencies - Array of currencies to get prices in
 * @returns {Promise<object>} Price data
 */
export async function getMultipleCoinPrices(env, coinIds, vsCurrencies) {
  const coinIdString = coinIds.join(',');
  const vsCurrencyString = vsCurrencies.join(',');
  const cacheKey = `simple_prices_${coinIdString}_${vsCurrencyString}`;
  
  return getWithCache(env, cacheKey, async () => {
    const endpoint = `/simple/price?ids=${coinIdString}&vs_currencies=${vsCurrencyString}&include_24hr_change=true`;
    return await fetchCoinGeckoData(endpoint);
  }, CACHE_TTL.SIMPLE_PRICES);
}

/**
 * Gets trending coins
 * @param {object} env - Cloudflare environment
 * @returns {Promise<object>} Trending coins data
 */
export async function getTrendingCoins(env) {
  const cacheKey = 'trending_coins';
  
  return getWithCache(env, cacheKey, () => {
    return fetchCoinGeckoData('/search/trending');
  }, 1800); // 30 minutes cache for trending
}

/**
 * Gets global crypto market data
 * @param {object} env - Cloudflare environment
 * @returns {Promise<object>} Global market data
 */
export async function getGlobalMarketData(env) {
  const cacheKey = 'global_market_data';
  
  return getWithCache(env, cacheKey, () => {
    return fetchCoinGeckoData('/global');
  }, 3600); // 1 hour cache for global data
}

/**
 * Searches coins by query string
 * @param {object} env - Cloudflare environment
 * @param {string} query - Search query
 * @returns {Promise<object>} Search results
 */
export async function searchCoins(env, query) {
  const cacheKey = `coin_search_query_${query.toLowerCase()}`;
  
  return getWithCache(env, cacheKey, () => {
    return fetchCoinGeckoData(`/search?query=${encodeURIComponent(query)}`);
  }, 3600);
}

/**
 * Gets market data for top coins
 * @param {object} env - Cloudflare environment
 * @param {number} perPage - Number of coins per page
 * @param {number} page - Page number
 * @returns {Promise<object[]>} Market data for top coins
 */
export async function getTopCoins(env, perPage = 10, page = 1) {
  const cacheKey = `top_coins_${perPage}_${page}`;
  
  return getWithCache(env, cacheKey, () => {
    return fetchCoinGeckoData(
      `/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=false`
    );
  }, 1800); // 30 minutes cache
}