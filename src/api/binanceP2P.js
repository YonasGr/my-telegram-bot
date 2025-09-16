/**
 * Binance P2P API wrapper with enhanced error handling and validation
 */

import { API_URLS, CACHE_TTL } from '../config/constants.js';
import { getWithCache } from '../cache/rateLimiting.js';
import { escapeMarkdownV2 } from '../utils/formatters.js';

/**
 * Fetches P2P data from Binance backend
 * @param {string} asset - Crypto asset (e.g., 'USDT')
 * @param {string} fiat - Fiat currency (e.g., 'ETB')
 * @param {string} tradeType - 'BUY' or 'SELL'
 * @param {number} rows - Number of results to fetch
 * @param {number} page - Page number
 * @returns {Promise<object>} P2P data
 */
export async function fetchP2PData(asset = 'USDT', fiat = 'ETB', tradeType = 'BUY', rows = 10, page = 1) {
  try {
    const requestBody = {
      asset: asset.toUpperCase(),
      fiat: fiat.toUpperCase(),
      tradeType: tradeType.toUpperCase(),
      rows: Math.min(Math.max(rows, 1), 20),
      page: Math.min(Math.max(page, 1), 100)
    };

    console.log(`Fetching P2P data: ${JSON.stringify(requestBody)}`);

    const response = await fetch(API_URLS.BINANCE_BACKEND, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "User-Agent": "TelegramBot/1.0"
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Backend API error ${response.status}:`, errorText);
      throw new Error(`Backend API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // Validate response structure
    if (!data || !data.data || !Array.isArray(data.data.data)) {
      throw new Error('Invalid response format from Binance backend');
    }

    console.log(`Successfully fetched ${data.data.data.length} P2P offers`);
    return data;

  } catch (error) {
    console.error("Error fetching P2P data:", error);
    
    // Provide more specific error messages
    if (error.message.includes('fetch')) {
      throw new Error('Network error: Could not connect to P2P service');
    } else if (error.message.includes('Backend API error: 400')) {
      throw new Error('Invalid P2P request parameters');
    } else if (error.message.includes('Backend API error: 429')) {
      throw new Error('P2P service rate limit exceeded, please try again later');
    } else if (error.message.includes('Backend API error: 504')) {
      throw new Error('P2P service timeout, please try again');
    } else {
      throw new Error('Could not fetch P2P data: ' + error.message);
    }
  }
}

/**
 * Fetches P2P data with caching
 * @param {object} env - Cloudflare environment
 * @param {string} asset - Crypto asset
 * @param {string} fiat - Fiat currency
 * @param {string} tradeType - Trade type
 * @param {number} rows - Number of results
 * @param {number} page - Page number
 * @returns {Promise<object>} Cached or fresh P2P data
 */
export async function getP2PDataWithCache(env, asset, fiat, tradeType, rows = 10, page = 1) {
  const cacheKey = `p2p_${asset}_${fiat}_${tradeType}_${rows}_${page}`;
  
  return getWithCache(env, cacheKey, () => {
    return fetchP2PData(asset, fiat, tradeType, rows, page);
  }, CACHE_TTL.P2P_DATA);
}

/**
 * Gets the best P2P rate for an asset/fiat pair
 * @param {object} env - Cloudflare environment
 * @param {string} asset - Crypto asset
 * @param {string} fiat - Fiat currency
 * @param {string} tradeType - Trade type
 * @returns {Promise<object|null>} Best rate data or null
 */
export async function getBestP2PRate(env, asset, fiat, tradeType) {
  try {
    const data = await getP2PDataWithCache(env, asset, fiat, tradeType, 5, 1);
    
    if (!data?.data?.data || data.data.data.length === 0) {
      return null;
    }

    const bestOffer = data.data.data[0];
    return {
      price: parseFloat(bestOffer.adv.price),
      availableAmount: parseFloat(bestOffer.adv.surplusAmount),
      minAmount: parseFloat(bestOffer.adv.minSingleTransAmount),
      maxAmount: parseFloat(bestOffer.adv.maxSingleTransAmount),
      trader: {
        name: bestOffer.advertiser.nickName,
        orders: bestOffer.advertiser.monthOrderCount,
        successRate: bestOffer.advertiser.monthFinishRate * 100
      },
      paymentMethods: bestOffer.adv.tradeMethods?.map(m => m.tradeMethodName) || []
    };
  } catch (error) {
    console.error("Error getting best P2P rate:", error);
    return null;
  }
}

/**
 * Formats P2P response for Telegram message
 * @param {object} data - P2P data from API
 * @param {string} asset - Asset symbol
 * @param {string} fiat - Fiat currency
 * @param {string} tradeType - Trade type
 * @param {number} maxResults - Maximum results to show
 * @returns {string} Formatted message
 */
export function formatP2PResponse(data, asset, fiat, tradeType, maxResults = 5) {
  if (!data?.data?.data || data.data.data.length === 0) {
    return `❌ No ${tradeType} ads found for ${asset}/${fiat}`;
  }

  const offers = data.data.data.slice(0, maxResults);
  let message = `💰 *Binance P2P ${tradeType} ${asset} for ${fiat}*\n\n`;

  offers.forEach((ad, index) => {
    const advertiser = ad.advertiser;
    const adv = ad.adv;
    
    // Use proper escaping for trader names
    const traderName = escapeMarkdownV2(advertiser.nickName);
    const price = escapeMarkdownV2(adv.price.toString());
    const available = escapeMarkdownV2(adv.surplusAmount.toString());
    const minAmount = escapeMarkdownV2(adv.minSingleTransAmount.toString());
    const maxAmount = escapeMarkdownV2(adv.maxSingleTransAmount.toString());
    const orders = escapeMarkdownV2(advertiser.monthOrderCount.toString());
    const successRate = escapeMarkdownV2((advertiser.monthFinishRate * 100).toFixed(1));

    message += `*${index + 1}\\. ${traderName}*\n`;
    message += `   💵 *Price:* ${price} ${fiat}\n`;
    message += `   📦 *Available:* ${available} ${asset}\n`;
    message += `   📊 *Limits:* ${minAmount} \\- ${maxAmount} ${fiat}\n`;
    message += `   ⭐️ *Orders:* ${orders} \\(${successRate}% success\\)\n`;

    if (adv.tradeMethods?.length > 0) {
      const methods = adv.tradeMethods
        .map(m => escapeMarkdownV2(m.tradeMethodName))
        .join(", ");
      message += `   🏦 *Methods:* ${methods}\n`;
    }

    message += "\n";
  });

  message += `🔄 *Live data from Binance P2P*`;
  return message;
}