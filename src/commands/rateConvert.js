/**
 * Rate and Convert command handlers with enhanced rate limiting
 */

import { sendMessage, sendLoadingMessage, updateLoadingMessage } from '../api/telegram.js';
import { searchCoinSymbol, getMultipleCoinPrices } from '../api/coinmarketcap.js';
import { getBestP2PRate } from '../api/binanceP2P.js';
import { validateAmount, validateCurrency, validateConversion } from '../utils/validators.js';
import { safeFormatNumber, bold, escapeHTML, formatNumber } from '../utils/formatters.js';
import { EMOJIS, SUPPORTED_FIATS } from '../config/constants.js';
import { getRateLimitService } from '../services/rateLimitService.js';

/**
 * Handles /rate command for currency conversion
 * @param {object} env - Cloudflare environment
 * @param {string|number} chatId - Chat ID
 * @param {string[]} args - Command arguments
 * @returns {Promise<void>}
 */
export async function handleRate(env, chatId, args) {
  try {
    const amount = args[1] ? parseFloat(args[1]) : null;
    const currency = (args[2] || 'USDT').toUpperCase();
    const vsCurrency = (args[3] || 'USD').toUpperCase();

    // Validate arguments
    if (!amount) {
      const helpMessage = `${EMOJIS.ERROR} ${bold('Rate Command Help')}

${bold(`${EMOJIS.EXCHANGE} Format:`)}
<code>/rate [amount] [currency] [vs_currency]</code>

${bold('📝 Examples:')}
• <code>/rate 100 BTC USD</code> - Convert 100 BTC to USD
• <code>/rate 1000 USDT ETB</code> - USDT to ETB (uses P2P rates)
• <code>/rate 50 ETH EUR</code> - Convert 50 ETH to EUR
• <code>/rate 1 BTC</code> - Default to USD

${bold('💡 Notes:')}
• ETB rates use live P2P data
• Other conversions use CoinMarketCap rates
• Default target currency is USD`;

      await sendMessage(env, chatId, helpMessage, 'HTML');
      return;
    }

    const amountValidation = validateAmount(amount);
    if (!amountValidation.isValid) {
      await sendMessage(env, chatId, `${EMOJIS.ERROR} ${escapeHTML(amountValidation.error)}`, 'HTML');
      return;
    }

    const currencyValidation = validateCurrency(currency);
    const vsCurrencyValidation = validateCurrency(vsCurrency);

    if (!currencyValidation.isValid || !vsCurrencyValidation.isValid) {
      const error = currencyValidation.error || vsCurrencyValidation.error;
      await sendMessage(env, chatId, `${EMOJIS.ERROR} ${error}`, 'HTML');
      return;
    }

    // Send loading message
    const loadingMsg = await sendLoadingMessage(env, chatId, 
      `${EMOJIS.LOADING} Converting ${amount} ${currency} to ${vsCurrency}...`);

    try {
      // Check if this involves P2P fiat currencies (ETB and other supported fiats)
      if (SUPPORTED_FIATS.includes(vsCurrency)) {
        await handleP2PRate(env, chatId, amount, currency, vsCurrency, loadingMsg);
        return;
      }

      // Handle standard crypto-to-crypto/fiat conversion
      await handleStandardRate(env, chatId, amount, currency, vsCurrency, loadingMsg);

    } catch (apiError) {
      console.error("Rate API error:", apiError);
      
      const rateLimitService = getRateLimitService(env);
      const rateLimitMessage = await rateLimitService.getRateLimitMessage();
      
      let errorMessage = `${EMOJIS.WARNING} *Could not fetch conversion rate*

${escapeHTML(apiError.message)}`;

      // Enhanced rate limit messaging
      if (apiError.message.includes('⚠️ CoinMarketCap API rate limit exceeded') || 
          apiError.message.includes('rate limit') ||
          apiError.message.includes('Circuit breaker open') ||
          apiError.message.includes('Service temporarily unavailable')) {
        
        const status = await rateLimitService.getRateLimitStatus();
        
        errorMessage = `${EMOJIS.WARNING} *Service Temporarily Limited*

${rateLimitMessage || apiError.message}

${bold('🔄 Recovery Status:')}
• Service Health: ${status.isHealthy ? '✅ Good' : '⚠️ Degraded'}
• Failures: ${status.failureCount}/5
${status.retryAfter > 0 ? `• Retry After: ${status.retryAfter}s` : '• Ready to retry'}

${bold('💡 What you can do:')}
• Wait ${status.retryAfter || 60} seconds and try again
• Try popular pairs like BTC/USD, ETH/USD
• Use cached data when available
• Check network connection`;
      }

      errorMessage += `

*${EMOJIS.CHART} Try:*
• Wait a moment and retry
• Check currency symbols
• Try popular pairs like BTC/USD
• Use <code>/help</code> for other commands`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, errorMessage, 'HTML');
      } else {
        await sendMessage(env, chatId, errorMessage, 'HTML');
      }
    }

  } catch (error) {
    console.error("Rate command error:", error);
    await sendMessage(env, chatId, `${EMOJIS.ERROR} Error processing request: ${escapeHTML(error.message)}`, 'HTML');
  }
}

/**
 * Handles P2P rate conversion (involving supported fiat currencies)
 * @param {object} env - Cloudflare environment
 * @param {string|number} chatId - Chat ID
 * @param {number} amount - Amount to convert
 * @param {string} currency - Source currency
 * @param {string} vsCurrency - Target currency (fiat)
 * @param {object} loadingMsg - Loading message to update
 * @returns {Promise<void>}
 */
async function handleP2PRate(env, chatId, amount, currency, vsCurrency, loadingMsg) {
  try {
    // Get P2P rate for the currency pair
    const p2pRate = await getBestP2PRate(env, currency, vsCurrency, 'BUY');
    
    if (!p2pRate) {
      const noRateMessage = `${EMOJIS.ERROR} *No P2P rates available*

Could not find ${currency}/${vsCurrency} P2P rates right now.

*${EMOJIS.CHART} Suggestions:*
• Try USDT which has the most liquidity
• Check supported pairs: <code>/p2p</code> command
• Try again in a few minutes`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, noRateMessage, 'HTML');
      } else {
        await sendMessage(env, chatId, noRateMessage, 'HTML');
      }
      return;
    }

    const result = amount * p2pRate.price;
    
    const rateMessage = `${EMOJIS.EXCHANGE} *P2P Rate Conversion*

*${amount} ${currency}* ≈ *${safeFormatNumber(result, 2)} ${vsCurrency}*

*📊 P2P Rate Details:*
• *Current Rate:* 1 ${currency} = ${safeFormatNumber(p2pRate.price, 2)} ${vsCurrency}
• *Best Trader:* ${escapeHTML(p2pRate.trader.name)}
• *Available:* ${safeFormatNumber(p2pRate.availableAmount)} ${currency}
• *Trade Limits:* ${safeFormatNumber(p2pRate.minAmount)} - ${safeFormatNumber(p2pRate.maxAmount)} ${vsCurrency}
• *Success Rate:* ${safeFormatNumber(p2pRate.trader.successRate, 1)}% (${escapeHTML(p2pRate.trader.orders.toString())} orders)

${p2pRate.paymentMethods.length > 0 ? `*🏦 Payment Methods:* ${escapeHTML(p2pRate.paymentMethods.join(", "))}` : ''}

${EMOJIS.REFRESH} *Live P2P data from Binance*`;

    if (loadingMsg?.result?.message_id) {
      await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, rateMessage, 'HTML');
    } else {
      await sendMessage(env, chatId, rateMessage, 'HTML');
    }

  } catch (error) {
    throw new Error(`P2P rate error: ${error.message}`);
  }
}

/**
 * Handles standard rate conversion using CoinMarketCap
 * @param {object} env - Cloudflare environment
 * @param {string|number} chatId - Chat ID
 * @param {number} amount - Amount to convert
 * @param {string} currency - Source currency
 * @param {string} vsCurrency - Target currency
 * @param {object} loadingMsg - Loading message to update
 * @returns {Promise<void>}
 */
async function handleStandardRate(env, chatId, amount, currency, vsCurrency, loadingMsg) {
  try {
    // Search for the coin
    const coinData = await searchCoinSymbol(env, currency);
    if (!coinData) {
      throw new Error(`Could not find currency: ${currency}`);
    }

    // Get price data
    const prices = await getMultipleCoinPrices(env, [coinData.id], [vsCurrency.toLowerCase()]);
    const price = prices?.[coinData.id]?.[vsCurrency.toLowerCase()];
    const priceChange24h = prices?.[coinData.id]?.[`${vsCurrency.toLowerCase()}_24h_change`];

    if (price === undefined) {
      throw new Error(`Could not get price for ${currency}/${vsCurrency}`);
    }

    const result = amount * price;
    const changeIndicator = priceChange24h !== undefined 
      ? `(${priceChange24h >= 0 ? '+' : ''}${safeFormatNumber(priceChange24h, 2)}% 24h)` 
      : '';

    const rateMessage = `${EMOJIS.EXCHANGE} *Real-time Rate Conversion*

*${amount} ${currency}* ≈ *${safeFormatNumber(result, vsCurrency === 'USD' ? 2 : 6)} ${vsCurrency}*

*📊 Market Rate:*
• *Current Price:* 1 ${currency} = ${safeFormatNumber(price, 6)} ${vsCurrency}
${priceChange24h !== undefined ? `• *24h Change:* ${priceChange24h >= 0 ? '🟢' : '🔴'} ${priceChange24h >= 0 ? '+' : ''}${safeFormatNumber(priceChange24h, 2)}%` : ''}

*${EMOJIS.COIN} Coin Info:*
• *Full Name:* ${escapeHTML(coinData.name)}
• *Symbol:* ${escapeHTML(coinData.symbol.toUpperCase())}

${EMOJIS.REFRESH} *Live data from CoinMarketCap*`;

    if (loadingMsg?.result?.message_id) {
      await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, rateMessage, 'HTML');
    } else {
      await sendMessage(env, chatId, rateMessage, 'HTML');
    }

  } catch (error) {
    if (error.message.includes('⚠️ CoinMarketCap API rate limit exceeded') || error.message.includes('rate limit')) {
      throw new Error('⚠️ CoinMarketCap API rate limit exceeded. Please try again in a minute.');
    }
    throw new Error(`Standard rate error: ${error.message}`);
  }
}

/**
 * Handles /convert command for any-to-any currency conversion
 * @param {object} env - Cloudflare environment
 * @param {string|number} chatId - Chat ID
 * @param {string[]} args - Command arguments
 * @returns {Promise<void>}
 */
export async function handleConvert(env, chatId, args) {
  try {
    const amount = args[1] ? parseFloat(args[1]) : null;
    const fromCurrency = args[2];
    const toCurrency = args[3];

    // Validate arguments
    if (!amount || !fromCurrency || !toCurrency) {
      const helpMessage = `${EMOJIS.ERROR} *Convert Command Help*

*${EMOJIS.EXCHANGE} Format:*
<code>/convert [amount] [from] [to]</code>

*📝 Examples:*
• <code>/convert 100 ETH ADA</code> - Crypto to crypto
• <code>/convert 1000 ETB USDT</code> - Fiat to crypto (P2P rates)
• <code>/convert 1 BTC EUR</code> - Crypto to fiat
• <code>/convert 50 USDT ETB</code> - Crypto to fiat (P2P rates)

*💡 Notes:*
• All parameters required
• ETB conversions use P2P data
• Supports crypto ↔ crypto and crypto ↔ fiat
• Live market rates from CoinMarketCap & Binance`;

      await sendMessage(env, chatId, helpMessage, 'HTML');
      return;
    }

    const validation = validateConversion(amount, fromCurrency, toCurrency);
    if (!validation.isValid) {
      const errorMessage = `${EMOJIS.ERROR} *Conversion Errors:*

${validation.errors.map(err => `• ${err}`).join('\n')}`;

      await sendMessage(env, chatId, errorMessage, 'HTML');
      return;
    }

    // Send loading message
    const loadingMsg = await sendLoadingMessage(env, chatId, 
      `${EMOJIS.LOADING} Converting ${amount} ${fromCurrency.toUpperCase()} to ${toCurrency.toUpperCase()}...`);

    try {
      await performConversion(env, chatId, amount, fromCurrency, toCurrency, loadingMsg);

    } catch (apiError) {
      console.error("Convert API error:", apiError);
      
      let errorMessage = `${EMOJIS.WARNING} *Conversion failed*

${escapeHTML(apiError.message)}`;

      if (apiError.message.includes('⚠️ CoinMarketCap API rate limit exceeded') || apiError.message.includes('rate limit')) {
        errorMessage = `${EMOJIS.WARNING} *Rate Limit Reached*

⚠️ CoinMarketCap API rate limit exceeded. Please try again in a minute.

${bold('Tip:')} Rate limits help keep the service fast and reliable for everyone.`;
      }

      errorMessage += `

*${EMOJIS.CHART} Try:*
• Check currency names/symbols
• Use popular pairs like ETH/BTC
• Wait a moment and retry
• ETB pairs: use USDT/ETB, BTC/ETB etc`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, errorMessage, 'HTML');
      } else {
        await sendMessage(env, chatId, errorMessage, 'HTML');
      }
    }

  } catch (error) {
    console.error("Convert command error:", error);
    await sendMessage(env, chatId, `${EMOJIS.ERROR} Error processing request: ${escapeHTML(error.message)}`, 'HTML');
  }
}

/**
 * Performs the actual currency conversion
 * @param {object} env - Cloudflare environment
 * @param {string|number} chatId - Chat ID
 * @param {number} amount - Amount to convert
 * @param {string} fromCurrency - Source currency
 * @param {string} toCurrency - Target currency
 * @param {object} loadingMsg - Loading message to update
 * @returns {Promise<void>}
 */
async function performConversion(env, chatId, amount, fromCurrency, toCurrency, loadingMsg) {
  const fromSymbol = fromCurrency.toLowerCase();
  const toSymbol = toCurrency.toLowerCase();

  let fromPriceUSD, toPriceUSD;
  let isFromP2P = false, isToP2P = false;

  // Handle P2P rates for ETB and other supported fiats
  if (fromSymbol === 'etb' || SUPPORTED_FIATS.includes(fromSymbol.toUpperCase())) {
    const p2pRate = await getBestP2PRate(env, 'USDT', fromSymbol.toUpperCase(), 'BUY');
    if (p2pRate) {
      fromPriceUSD = 1 / p2pRate.price; // ETB to USD
      isFromP2P = true;
    }
  }

  if (toSymbol === 'etb' || SUPPORTED_FIATS.includes(toSymbol.toUpperCase())) {
    const p2pRate = await getBestP2PRate(env, 'USDT', toSymbol.toUpperCase(), 'SELL');
    if (p2pRate) {
      toPriceUSD = p2pRate.price; // USD to ETB
      isToP2P = true;
    }
  }

  // Handle CoinMarketCap rates
  const coinIdsToFetch = [];
  let fromCoinId, toCoinId;

  if (fromPriceUSD === undefined) {
    const fromCoin = await searchCoinSymbol(env, fromSymbol);
    if (!fromCoin) throw new Error(`Unknown currency: ${fromCurrency}`);
    fromCoinId = fromCoin.id;
    coinIdsToFetch.push(fromCoinId);
  }

  if (toPriceUSD === undefined) {
    const toCoin = await searchCoinSymbol(env, toSymbol);
    if (!toCoin) throw new Error(`Unknown currency: ${toCurrency}`);
    toCoinId = toCoin.id;
    if (fromCoinId !== toCoinId) {
      coinIdsToFetch.push(toCoinId);
    }
  }

  // Fetch CoinMarketCap prices if needed
  if (coinIdsToFetch.length > 0) {
    const prices = await getMultipleCoinPrices(env, coinIdsToFetch, ['usd']);
    if (!prices || Object.keys(prices).length === 0) {
      throw new Error('⚠️ CoinMarketCap API rate limit exceeded. Please try again in a minute.');
    }

    if (fromPriceUSD === undefined) fromPriceUSD = prices[fromCoinId]?.usd;
    if (toPriceUSD === undefined) toPriceUSD = prices[toCoinId]?.usd;
  }

  // Final validation
  if (fromPriceUSD === undefined || toPriceUSD === undefined) {
    throw new Error(`Could not find prices for ${fromCurrency} or ${toCurrency}`);
  }

  // Calculate conversion
  const result = (amount * fromPriceUSD) / toPriceUSD;
  const conversionRate = fromPriceUSD / toPriceUSD;

  const convertMessage = `${EMOJIS.EXCHANGE} *Currency Conversion*

*${amount} ${fromCurrency.toUpperCase()}* ≈ *${safeFormatNumber(result, 6)} ${toCurrency.toUpperCase()}*

*📊 Conversion Details:*
• *Rate:* 1 ${fromCurrency.toUpperCase()} = ${safeFormatNumber(conversionRate, 6)} ${toCurrency.toUpperCase()}
• *USD Values:*
  - 1 ${fromCurrency.toUpperCase()} = $${safeFormatNumber(fromPriceUSD, 6)}
  - 1 ${toCurrency.toUpperCase()} = $${safeFormatNumber(toPriceUSD, 6)}

*${EMOJIS.CHART} Data Sources:*
${isFromP2P ? `• ${fromCurrency.toUpperCase()}: Binance P2P rates` : `• ${fromCurrency.toUpperCase()}: CoinMarketCap market data`}
${isToP2P ? `• ${toCurrency.toUpperCase()}: Binance P2P rates` : `• ${toCurrency.toUpperCase()}: CoinMarketCap market data`}

${EMOJIS.REFRESH} *Live data from multiple sources*`;

  if (loadingMsg?.result?.message_id) {
    await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, convertMessage, 'HTML');
  } else {
    await sendMessage(env, chatId, convertMessage, 'HTML');
  }
}