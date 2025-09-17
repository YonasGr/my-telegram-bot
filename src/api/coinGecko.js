/**
 * CoinGecko API wrapper with enhanced error handling and rate limiting
 */

import { API_URLS, CACHE_TTL, RATE_LIMIT } from '../config/constants.js';
import { getCoinGeckoWithCache } from '../cache/rateLimiting.js';

/**
 * Fetches data from CoinGecko API with proper throttling and error handling
 * @param {string} endpoint - API endpoint path
 * @returns {Promise<object>} API response data
 */
export async function fetchCoinGeckoData(endpoint) {
  try {
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
 * Searches for a coin by symbol or name with enhanced caching
 * @param {object} env - Cloudflare environment
 * @param {string} symbol - Coin symbol or name to search
 * @returns {Promise<object|null>} Coin data or null if not found
 */
export async function searchCoinSymbol(env, symbol) {
  try {
    const endpoint = `/coins/list`;
    
    const coinList = await getCoinGeckoWithCache(env, endpoint, 
      () => fetchCoinGeckoData(endpoint), 
      CACHE_TTL.COIN_SEARCH
    );
    
    if (!Array.isArray(coinList)) {
      throw new Error('Invalid coin list response from CoinGecko');
    }

    const searchTerm = symbol.toLowerCase().trim();
    
    // Search by exact symbol match first
    let match = coinList.find(coin => 
      coin.symbol && coin.symbol.toLowerCase() === searchTerm
    );
    
    // If no exact symbol match, search by name
    if (!match) {
      match = coinList.find(coin => 
        coin.name && coin.name.toLowerCase().includes(searchTerm)
      );
    }
    
    // If still no match, try partial symbol match
    if (!match) {
      match = coinList.find(coin => 
        coin.symbol && coin.symbol.toLowerCase().includes(searchTerm)
      );
    }

    console.log(`Coin search for "${symbol}":`, match ? `Found ${match.name} (${match.symbol})` : 'Not found');
    return match || null;

  } catch (error) {
    console.error(`Error searching coin symbol "${symbol}":`, error);
    throw error;
  }
}

/**
 * Gets detailed coin data with enhanced caching
 * @param {object} env - Cloudflare environment
 * @param {string} coinId - CoinGecko coin ID
 * @returns {Promise<object>} Detailed coin data
 */
export async function getCoinData(env, coinId) {
  const endpoint = `/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
  
  return getCoinGeckoWithCache(env, endpoint,
    () => fetchCoinGeckoData(endpoint),
    CACHE_TTL.COIN_DATA
  );
}

/**
 * Gets coin market chart data with enhanced caching
 * @param {object} env - Cloudflare environment
 * @param {string} coinId - CoinGecko coin ID
 * @param {string} vsCurrency - Target currency
 * @param {number} days - Number of days of data
 * @returns {Promise<object>} Chart data
 */
export async function getCoinMarketChart(env, coinId, vsCurrency = 'usd', days = 7) {
  const endpoint = `/coins/${coinId}/market_chart?vs_currency=${vsCurrency}&days=${days}`;
  
  return getCoinGeckoWithCache(env, endpoint,
    () => fetchCoinGeckoData(endpoint),
    CACHE_TTL.CHART_DATA
  );
}

/**
 * Gets simple price data for multiple coins with enhanced caching
 * @param {object} env - Cloudflare environment
 * @param {string[]} coinIds - Array of coin IDs
 * @param {string[]} vsCurrencies - Array of currencies to get prices in
 * @returns {Promise<object>} Price data
 */
export async function getMultipleCoinPrices(env, coinIds, vsCurrencies = ['usd'], includeChange = true) {
  const coinIdsStr = Array.isArray(coinIds) ? coinIds.join(',') : coinIds;
  const vsCurrenciesStr = Array.isArray(vsCurrencies) ? vsCurrencies.join(',') : vsCurrencies;
  const changeParam = includeChange ? '&include_24hr_change=true' : '';
  
  const endpoint = `/simple/price?ids=${encodeURIComponent(coinIdsStr)}&vs_currencies=${vsCurrenciesStr}${changeParam}`;
  
  return getCoinGeckoWithCache(env, endpoint,
    () => fetchCoinGeckoData(endpoint),
    RATE_LIMIT.COINGECKO_CACHE_MIN // Use minimum required cache time
  );
}

/**
 * Gets trending coins with enhanced caching
 * @param {object} env - Cloudflare environment
 * @returns {Promise<object>} Trending coins data
 */
export async function getTrendingCoins(env) {
  const endpoint = '/search/trending';
  
  return getCoinGeckoWithCache(env, endpoint,
    () => fetchCoinGeckoData(endpoint),
    1800 // 30 minutes cache for trending
  );
}

/**
 * Gets global crypto market data with enhanced caching
 * @param {object} env - Cloudflare environment
 * @returns {Promise<object>} Global market data
 */
export async function getGlobalMarketData(env) {
  const endpoint = '/global';
  
  return getCoinGeckoWithCache(env, endpoint,
    () => fetchCoinGeckoData(endpoint),
    3600 // 1 hour cache for global data
  );
}

/**
 * Searches coins by query string with enhanced caching
 * @param {object} env - Cloudflare environment
 * @param {string} query - Search query
 * @returns {Promise<object>} Search results
 */
export async function searchCoins(env, query) {
  const endpoint = `/search?query=${encodeURIComponent(query)}`;
  
  return getCoinGeckoWithCache(env, endpoint,
    () => fetchCoinGeckoData(endpoint),
    3600 // 1 hour cache for search results
  );
}

/**
 * Gets market data for top coins with enhanced caching
 * @param {object} env - Cloudflare environment
 * @param {number} perPage - Number of coins per page
 * @param {number} page - Page number
 * @returns {Promise<object[]>} Market data for top coins
 */
export async function getTopCoins(env, perPage = 10, page = 1) {
  const endpoint = `/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=false`;
  
  return getCoinGeckoWithCache(env, endpoint,
    () => fetchCoinGeckoData(endpoint),
    1800 // 30 minutes cache for top coins
  );
}