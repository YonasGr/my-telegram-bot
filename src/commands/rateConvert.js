/**
 * Rate and Convert command handlers
 */

import { sendMessage, sendLoadingMessage, updateLoadingMessage, sendMessageSafe } from '../api/telegram.js';
import { searchCoinSymbol, getMultipleCoinPrices } from '../api/coinGecko.js';
import { getBestP2PRate } from '../api/binanceP2P.js';
import { validateAmount, validateCurrency, validateConversion } from '../utils/validators.js';
import { safeFormatNumber, bold, escapeMarkdownV2, formatNumber, safe } from '../utils/formatters.js';
import { EMOJIS, SUPPORTED_FIATS } from '../config/constants.js';

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
\`/rate [amount] [currency] [vs_currency]\`

${bold('📝 Examples:')}
• \`/rate 100 BTC USD\` \\- Convert 100 BTC to USD
• \`/rate 1000 USDT ETB\` \\- USDT to ETB \\(uses P2P rates\\)
• \`/rate 50 ETH EUR\` \\- Convert 50 ETH to EUR
• \`/rate 1 BTC\` \\- Default to USD

${bold('💡 Notes:')}
• ETB rates use live P2P data
• Other conversions use CoinGecko rates
• Default target currency is USD`;

      await sendMessageSafe(env, chatId, helpMessage);
      return;
    }

    const amountValidation = validateAmount(amount);
    if (!amountValidation.isValid) {
      await sendMessageSafe(env, chatId, `${EMOJIS.ERROR} ${safe.any(amountValidation.error)}`);
      return;
    }

    const currencyValidation = validateCurrency(currency);
    const vsCurrencyValidation = validateCurrency(vsCurrency);

    if (!currencyValidation.isValid || !vsCurrencyValidation.isValid) {
      const error = currencyValidation.error || vsCurrencyValidation.error;
      await sendMessageSafe(env, chatId, `${EMOJIS.ERROR} ${error}`);
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
      
      let errorMessage = `${EMOJIS.WARNING} *Could not fetch conversion rate*

${safe.any(apiError.message)}`;

      if (apiError.message.includes('⚠️ CoinGecko API rate limit exceeded')) {
        errorMessage = `${EMOJIS.WARNING} *Rate Limit Reached*

⚠️ CoinGecko API rate limit exceeded\\. Please try again in a minute\\.

${bold('Why rate limits exist:')}
• Ensures fair access for all users
• Prevents service overload
• Maintains data quality

${bold('What you can do:')}
• Wait 60 seconds and try again
• Use cached data if available
• Try simpler queries first`;
      } else if (apiError.message.includes('rate limit')) {
        errorMessage = `${EMOJIS.WARNING} *Service Busy*

⚠️ CoinGecko API rate limit exceeded\\. Please try again in a minute\\.`;
      }

      errorMessage += `

*${EMOJIS.CHART} Try:*
• Wait a moment and retry
• Check currency symbols
• Try popular pairs like BTC/USD
• Use \`/help\` for other commands`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, errorMessage, 'MarkdownV2');
      } else {
        await sendMessageSafe(env, chatId, errorMessage);
      }
    }

  } catch (error) {
    console.error("Rate command error:", error);
    await sendMessageSafe(env, chatId, `${EMOJIS.ERROR} Error processing request: ${safe.any(error.message)}`);
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

Could not find ${currency}/${vsCurrency} P2P rates right now\\.

*${EMOJIS.CHART} Suggestions:*
• Try USDT which has the most liquidity
• Check supported pairs: \`/p2p\` command
• Try again in a few minutes`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, noRateMessage, 'MarkdownV2');
      } else {
        await sendMessageSafe(env, chatId, noRateMessage);
      }
      return;
    }

    const result = amount * p2pRate.price;
    
    const rateMessage = `${EMOJIS.EXCHANGE} *P2P Rate Conversion*

*${amount} ${currency}* ≈ *${safeFormatNumber(result, 2)} ${vsCurrency}*

*📊 P2P Rate Details:*
• *Current Rate:* 1 ${currency} = ${safeFormatNumber(p2pRate.price, 2)} ${vsCurrency}
• *Best Trader:* ${safe.any(p2pRate.trader.name)}
• *Available:* ${safeFormatNumber(p2pRate.availableAmount)} ${currency}
• *Trade Limits:* ${safeFormatNumber(p2pRate.minAmount)} \\- ${safeFormatNumber(p2pRate.maxAmount)} ${vsCurrency}
• *Success Rate:* ${safeFormatNumber(p2pRate.trader.successRate, 1)}% \\(${safe.any(p2pRate.trader.orders.toString())} orders\\)

${p2pRate.paymentMethods.length > 0 ? `*🏦 Payment Methods:* ${safe.any(p2pRate.paymentMethods.join(", "))}` : ''}

${EMOJIS.REFRESH} *Live P2P data from Binance*`;

    if (loadingMsg?.result?.message_id) {
      await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, rateMessage, 'MarkdownV2');
    } else {
      await sendMessageSafe(env, chatId, rateMessage);
    }

  } catch (error) {
    throw new Error(`P2P rate error: ${error.message}`);
  }
}

/**
 * Handles standard rate conversion using CoinGecko
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
      ? `\\(${priceChange24h >= 0 ? '+' : ''}${safeFormatNumber(priceChange24h, 2)}% 24h\\)` 
      : '';

    const rateMessage = `${EMOJIS.EXCHANGE} *Real\\-time Rate Conversion*

*${amount} ${currency}* ≈ *${safeFormatNumber(result, vsCurrency === 'USD' ? 2 : 6)} ${vsCurrency}*

*📊 Market Rate:*
• *Current Price:* 1 ${currency} = ${safeFormatNumber(price, 6)} ${vsCurrency}
${priceChange24h !== undefined ? `• *24h Change:* ${priceChange24h >= 0 ? '🟢' : '🔴'} ${priceChange24h >= 0 ? '+' : ''}${safeFormatNumber(priceChange24h, 2)}%` : ''}

*${EMOJIS.COIN} Coin Info:*
• *Full Name:* ${safe.any(coinData.name)}
• *Symbol:* ${safe.any(coinData.symbol.toUpperCase())}

${EMOJIS.REFRESH} *Live data from CoinGecko*`;

    if (loadingMsg?.result?.message_id) {
      await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, rateMessage, 'MarkdownV2');
    } else {
      await sendMessageSafe(env, chatId, rateMessage);
    }

  } catch (error) {
    if (error.message.includes('⚠️ CoinGecko API rate limit exceeded') || error.message.includes('rate limit')) {
      throw new Error('⚠️ CoinGecko API rate limit exceeded. Please try again in a minute.');
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
\`/convert [amount] [from] [to]\`

*📝 Examples:*
• \`/convert 100 ETH ADA\` \\- Crypto to crypto
• \`/convert 1000 ETB USDT\` \\- Fiat to crypto \\(P2P rates\\)
• \`/convert 1 BTC EUR\` \\- Crypto to fiat
• \`/convert 50 USDT ETB\` \\- Crypto to fiat \\(P2P rates\\)

*💡 Notes:*
• All parameters required
• ETB conversions use P2P data
• Supports crypto ↔ crypto and crypto ↔ fiat
• Live market rates from CoinGecko & Binance`;

      await sendMessageSafe(env, chatId, helpMessage);
      return;
    }

    const validation = validateConversion(amount, fromCurrency, toCurrency);
    if (!validation.isValid) {
      const errorMessage = `${EMOJIS.ERROR} *Conversion Errors:*

${validation.errors.map(err => `• ${err}`).join('\n')}`;

      await sendMessageSafe(env, chatId, errorMessage);
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

${safe.any(apiError.message)}`;

      if (apiError.message.includes('⚠️ CoinGecko API rate limit exceeded') || apiError.message.includes('rate limit')) {
        errorMessage = `${EMOJIS.WARNING} *Rate Limit Reached*

⚠️ CoinGecko API rate limit exceeded\\. Please try again in a minute\\.

${bold('Tip:')} Rate limits help keep the service fast and reliable for everyone\\.`;
      }

      errorMessage += `

*${EMOJIS.CHART} Try:*
• Check currency names/symbols
• Use popular pairs like ETH/BTC
• Wait a moment and retry
• ETB pairs: use USDT/ETB, BTC/ETB etc`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, errorMessage, 'MarkdownV2');
      } else {
        await sendMessageSafe(env, chatId, errorMessage);
      }
    }

  } catch (error) {
    console.error("Convert command error:", error);
    await sendMessageSafe(env, chatId, `${EMOJIS.ERROR} Error processing request: ${safe.any(error.message)}`);
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

  // Handle CoinGecko rates
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

  // Fetch CoinGecko prices if needed
  if (coinIdsToFetch.length > 0) {
    const prices = await getMultipleCoinPrices(env, coinIdsToFetch, ['usd']);
    if (!prices || Object.keys(prices).length === 0) {
      throw new Error('⚠️ CoinGecko API rate limit exceeded. Please try again in a minute.');
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
  \\- 1 ${fromCurrency.toUpperCase()} = $${safeFormatNumber(fromPriceUSD, 6)}
  \\- 1 ${toCurrency.toUpperCase()} = $${safeFormatNumber(toPriceUSD, 6)}

*${EMOJIS.CHART} Data Sources:*
${isFromP2P ? `• ${fromCurrency.toUpperCase()}: Binance P2P rates` : `• ${fromCurrency.toUpperCase()}: CoinGecko market data`}
${isToP2P ? `• ${toCurrency.toUpperCase()}: Binance P2P rates` : `• ${toCurrency.toUpperCase()}: CoinGecko market data`}

${EMOJIS.REFRESH} *Live data from multiple sources*`;

  if (loadingMsg?.result?.message_id) {
    await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, convertMessage, 'MarkdownV2');
  } else {
    await sendMessageSafe(env, chatId, convertMessage);
  }
}