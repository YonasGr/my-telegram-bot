/**
 * CoinMarketCap API proxy - forwards requests to backend for Node.js compatibility
 * Ensures Cloudflare Workers compatibility by removing direct CoinMarketCap API access
 */

import { API_URLS } from '../config/constants.js';

/**
 * Search for a coin by symbol or name via backend
 * @param {object} env - Cloudflare environment (unused, kept for compatibility)
 * @param {string} symbol - Coin symbol or name to search
 * @returns {Promise<object|null>} Coin data or null if not found
 */
export async function searchCoinSymbol(env, symbol) {
  try {
    const params = new URLSearchParams({
      symbol: symbol
    });

    const response = await fetch(`${API_URLS.BACKEND_BASE}/api/coin/search?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TelegramBot-Worker/1.0'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Backend coin search failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success || !data.data) {
      return null;
    }

    return data.data;
  } catch (error) {
    console.error('Worker: Coin search proxy error:', error);
    throw new Error(`Coin search failed: ${error.message}`);
  }
}

/**
 * Get multiple coin prices via backend
 * @param {object} env - Cloudflare environment (unused, kept for compatibility)
 * @param {string[]} coinIds - Array of CoinMarketCap IDs
 * @param {string[]} vsCurrencies - Array of vs currencies (usd, eur, etc)
 * @returns {Promise<object>} Price data object
 */
export async function getMultipleCoinPrices(env, coinIds, vsCurrencies = ['USD']) {
  try {
    const params = new URLSearchParams({
      coinIds: coinIds.join(','),
      vsCurrencies: vsCurrencies.join(',')
    });

    const response = await fetch(`${API_URLS.BACKEND_BASE}/api/coin/prices?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TelegramBot-Worker/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Backend coin prices failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Unknown error from backend');
    }

    return data.data;
  } catch (error) {
    console.error('Worker: Coin prices proxy error:', error);
    throw new Error(`Coin prices failed: ${error.message}`);
  }
}

/**
 * Get detailed coin data via backend
 * @param {object} env - Cloudflare environment (unused, kept for compatibility)
 * @param {string} coinId - CoinMarketCap coin ID
 * @returns {Promise<object>} Detailed coin data
 */
export async function getCoinData(env, coinId) {
  try {
    const params = new URLSearchParams({
      coinId: coinId
    });

    const response = await fetch(`${API_URLS.BACKEND_BASE}/api/coin/data?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TelegramBot-Worker/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Backend coin data failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Unknown error from backend');
    }

    return data.data;
  } catch (error) {
    console.error('Worker: Coin data proxy error:', error);
    throw new Error(`Coin data failed: ${error.message}`);
  }
}

/**
 * Get historical price data via backend
 * @param {object} env - Cloudflare environment (unused, kept for compatibility)
 * @param {string} coinId - CoinMarketCap coin ID
 * @param {number} days - Number of days for chart data
 * @returns {Promise<object>} Market chart data
 */
export async function getCoinMarketChart(env, coinId, days = 7) {
  try {
    const params = new URLSearchParams({
      coinId: coinId,
      days: days.toString()
    });

    const response = await fetch(`${API_URLS.BACKEND_BASE}/api/coin/chart?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TelegramBot-Worker/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Backend coin chart failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Unknown error from backend');
    }

    return data.data;
  } catch (error) {
    console.error('Worker: Coin chart proxy error:', error);
    throw new Error(`Coin chart failed: ${error.message}`);
  }
}

// Legacy function for compatibility - no longer used directly but kept to prevent import errors
export async function fetchCoinMarketCapData(endpoint, params = {}, env = null) {
  throw new Error('fetchCoinMarketCapData is deprecated. Use specific proxy functions instead.');
}