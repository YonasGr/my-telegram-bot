/**
 * Rate and Convert command handlers
 */

import { sendMessage, sendLoadingMessage, updateLoadingMessage } from '../api/telegram.js';
import { searchCoinSymbol, getMultipleCoinPrices } from '../api/coinmarketcap.js';
import { getBestP2PRate } from '../api/binanceP2P.js';
import { validateAmount, validateCurrency, validateConversion } from '../utils/validators.js';
import { safeFormatNumber, bold, escapeHTML } from '../utils/formatters.js';
import { EMOJIS, SUPPORTED_FIATS } from '../config/constants.js';
import { getRateLimitService } from '../services/rateLimitService.js';

export async function handleRate(env, chatId, args) {
  try {
    const amount = args[1] ? parseFloat(args[1]) : null;
    const currency = (args[2] || 'USDT').toUpperCase();
    const vsCurrency = (args[3] || 'USD').toUpperCase();

    if (!amount) {
      const helpMessage = `${EMOJIS.ERROR} ${bold('Rate Command Help')}

${bold(`${EMOJIS.EXCHANGE} Format:`)}
<code>/rate [amount] [currency] [vs_currency]</code>

${bold('Examples:')}
• <code>/rate 100 BTC USD</code>
• <code>/rate 1000 USDT ETB</code>
• <code>/rate 50 ETH EUR</code>

${bold('Notes:')}
• ETB rates use live P2P data
• Other conversions use CoinMarketCap`;

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
      await sendMessage(env, chatId, `${EMOJIS.ERROR} ${escapeHTML(currencyValidation.error || vsCurrencyValidation.error)}`, 'HTML');
      return;
    }

    const loadingMsg = await sendLoadingMessage(env, chatId,
      `${EMOJIS.LOADING} Converting ${amount} ${currency} to ${vsCurrency}...`);

    try {
      if (SUPPORTED_FIATS.includes(vsCurrency)) {
        await handleP2PRate(env, chatId, amount, currency, vsCurrency, loadingMsg);
        return;
      }
      await handleStandardRate(env, chatId, amount, currency, vsCurrency, loadingMsg);
    } catch (apiError) {
      console.error('Rate API error:', apiError);
      const rateLimitService = getRateLimitService(env);
      let errorMessage = `${EMOJIS.WARNING} ${bold('Could not fetch conversion rate')}

${escapeHTML(apiError.message)}`;

      if (apiError.message.includes('rate limit') || apiError.message.includes('Circuit breaker')) {
        const status = await rateLimitService.getRateLimitStatus();
        errorMessage = `${EMOJIS.WARNING} ${bold('Service Temporarily Limited')}

${bold('Recovery Status:')}
• Service Health: ${status.isHealthy ? '✅ Good' : '⚠️ Degraded'}
• Failures: ${status.failureCount}/5
${status.retryAfter > 0 ? `• Retry After: ${status.retryAfter}s` : '• Ready to retry'}`;
      }

      errorMessage += `\n\n${bold('Try:')} Wait a moment and retry, or use popular pairs like BTC/USD`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, errorMessage, 'HTML');
      } else {
        await sendMessage(env, chatId, errorMessage, 'HTML');
      }
    }
  } catch (error) {
    console.error('Rate command error:', error);
    await sendMessage(env, chatId, `${EMOJIS.ERROR} Error processing request: ${escapeHTML(error.message)}`, 'HTML');
  }
}

async function handleP2PRate(env, chatId, amount, currency, vsCurrency, loadingMsg) {
  const p2pRate = await getBestP2PRate(env, currency, vsCurrency, 'BUY');

  if (!p2pRate) {
    const msg = `${EMOJIS.ERROR} ${bold('No P2P rates available')}

Could not find ${bold(currency)}/${bold(vsCurrency)} P2P rates right now.
Try USDT which has the most liquidity, or check again in a few minutes.`;
    if (loadingMsg?.result?.message_id) {
      await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, msg, 'HTML');
    } else {
      await sendMessage(env, chatId, msg, 'HTML');
    }
    return;
  }

  const result = amount * p2pRate.price;

  const rateMessage = `${EMOJIS.EXCHANGE} ${bold('P2P Rate Conversion')}

<blockquote>${bold(amount + ' ' + currency)} ≈ ${bold(safeFormatNumber(result, 2) + ' ' + vsCurrency)}</blockquote>

${bold('P2P Rate Details:')}
• ${bold('Rate:')} 1 ${currency} = ${safeFormatNumber(p2pRate.price, 2)} ${vsCurrency}
• ${bold('Best Trader:')} ${escapeHTML(p2pRate.trader.name)}
• ${bold('Available:')} ${safeFormatNumber(p2pRate.availableAmount)} ${currency}
• ${bold('Limits:')} ${safeFormatNumber(p2pRate.minAmount)} – ${safeFormatNumber(p2pRate.maxAmount)} ${vsCurrency}
• ${bold('Success Rate:')} ${safeFormatNumber(p2pRate.trader.successRate, 1)}% (${escapeHTML(String(p2pRate.trader.orders))} orders)
${p2pRate.paymentMethods.length > 0 ? `• ${bold('Payment:')} ${escapeHTML(p2pRate.paymentMethods.join(', '))}` : ''}

${EMOJIS.REFRESH} ${bold('Live P2P data from Binance')}`;

  if (loadingMsg?.result?.message_id) {
    await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, rateMessage, 'HTML');
  } else {
    await sendMessage(env, chatId, rateMessage, 'HTML');
  }
}

async function handleStandardRate(env, chatId, amount, currency, vsCurrency, loadingMsg) {
  const coinData = await searchCoinSymbol(env, currency);
  if (!coinData) throw new Error(`Could not find currency: ${currency}`);

  const prices = await getMultipleCoinPrices(env, [coinData.id], [vsCurrency.toLowerCase()]);
  const price = prices?.[coinData.id]?.[vsCurrency.toLowerCase()];
  const priceChange24h = prices?.[coinData.id]?.[`${vsCurrency.toLowerCase()}_24h_change`];

  if (price === undefined) throw new Error(`Could not get price for ${currency}/${vsCurrency}`);

  const result = amount * price;

  const rateMessage = `${EMOJIS.EXCHANGE} ${bold('Real-time Rate Conversion')}

<blockquote>${bold(amount + ' ' + currency)} ≈ ${bold(safeFormatNumber(result, vsCurrency === 'USD' ? 2 : 6) + ' ' + vsCurrency)}</blockquote>

${bold('Market Rate:')}
• ${bold('Price:')} 1 ${currency} = ${safeFormatNumber(price, 6)} ${vsCurrency}
${priceChange24h !== undefined ? `• ${bold('24h Change:')} ${priceChange24h >= 0 ? '🟢' : '🔴'} ${priceChange24h >= 0 ? '+' : ''}${safeFormatNumber(priceChange24h, 2)}%` : ''}

${bold('Coin:')} ${escapeHTML(coinData.name)} (${escapeHTML(coinData.symbol.toUpperCase())})

${EMOJIS.REFRESH} ${bold('Live data from CoinMarketCap')}`;

  if (loadingMsg?.result?.message_id) {
    await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, rateMessage, 'HTML');
  } else {
    await sendMessage(env, chatId, rateMessage, 'HTML');
  }
}

export async function handleConvert(env, chatId, args) {
  try {
    const amount = args[1] ? parseFloat(args[1]) : null;
    const fromCurrency = args[2];
    const toCurrency = args[3];

    if (!amount || !fromCurrency || !toCurrency) {
      const helpMessage = `${EMOJIS.ERROR} ${bold('Convert Command Help')}

${bold(`${EMOJIS.EXCHANGE} Format:`)}
<code>/convert [amount] [from] [to]</code>

${bold('Examples:')}
• <code>/convert 100 ETH ADA</code>
• <code>/convert 1000 ETB USDT</code>
• <code>/convert 1 BTC EUR</code>
• <code>/convert 50 USDT ETB</code>

${bold('Notes:')}
• ETB conversions use live P2P data
• Supports crypto ↔ crypto and crypto ↔ fiat`;

      await sendMessage(env, chatId, helpMessage, 'HTML');
      return;
    }

    const validation = validateConversion(amount, fromCurrency, toCurrency);
    if (!validation.isValid) {
      await sendMessage(env, chatId,
        `${EMOJIS.ERROR} ${bold('Conversion Errors:')}\n\n${validation.errors.map(e => `• ${escapeHTML(e)}`).join('\n')}`,
        'HTML');
      return;
    }

    const loadingMsg = await sendLoadingMessage(env, chatId,
      `${EMOJIS.LOADING} Converting ${amount} ${fromCurrency.toUpperCase()} to ${toCurrency.toUpperCase()}...`);

    try {
      await performConversion(env, chatId, amount, fromCurrency, toCurrency, loadingMsg);
    } catch (apiError) {
      console.error('Convert API error:', apiError);
      let errorMessage = `${EMOJIS.WARNING} ${bold('Conversion failed')}

${escapeHTML(apiError.message)}

${bold('Try:')} Check currency names/symbols, use popular pairs like ETH/BTC, or wait and retry.`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, errorMessage, 'HTML');
      } else {
        await sendMessage(env, chatId, errorMessage, 'HTML');
      }
    }
  } catch (error) {
    console.error('Convert command error:', error);
    await sendMessage(env, chatId, `${EMOJIS.ERROR} Error processing request: ${escapeHTML(error.message)}`, 'HTML');
  }
}

async function performConversion(env, chatId, amount, fromCurrency, toCurrency, loadingMsg) {
  const fromSymbol = fromCurrency.toLowerCase();
  const toSymbol = toCurrency.toLowerCase();

  let fromPriceUSD, toPriceUSD;
  let isFromP2P = false, isToP2P = false;

  if (SUPPORTED_FIATS.includes(fromSymbol.toUpperCase())) {
    const p2pRate = await getBestP2PRate(env, 'USDT', fromSymbol.toUpperCase(), 'BUY');
    if (p2pRate) { fromPriceUSD = 1 / p2pRate.price; isFromP2P = true; }
  }

  if (SUPPORTED_FIATS.includes(toSymbol.toUpperCase())) {
    const p2pRate = await getBestP2PRate(env, 'USDT', toSymbol.toUpperCase(), 'SELL');
    if (p2pRate) { toPriceUSD = p2pRate.price; isToP2P = true; }
  }

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
    if (fromCoinId !== toCoinId) coinIdsToFetch.push(toCoinId);
  }

  if (coinIdsToFetch.length > 0) {
    const prices = await getMultipleCoinPrices(env, coinIdsToFetch, ['usd']);
    if (!prices || Object.keys(prices).length === 0) {
      throw new Error('Could not fetch prices. Please try again in a moment.');
    }
    if (fromPriceUSD === undefined) fromPriceUSD = prices[fromCoinId]?.usd;
    if (toPriceUSD === undefined) toPriceUSD = prices[toCoinId]?.usd;
  }

  if (fromPriceUSD === undefined || toPriceUSD === undefined) {
    throw new Error(`Could not find prices for ${fromCurrency} or ${toCurrency}`);
  }

  const result = (amount * fromPriceUSD) / toPriceUSD;
  const conversionRate = fromPriceUSD / toPriceUSD;

  const convertMessage = `${EMOJIS.EXCHANGE} ${bold('Currency Conversion')}

<blockquote>${bold(amount + ' ' + fromCurrency.toUpperCase())} ≈ ${bold(safeFormatNumber(result, 6) + ' ' + toCurrency.toUpperCase())}</blockquote>

${bold('Conversion Details:')}
• ${bold('Rate:')} 1 ${fromCurrency.toUpperCase()} = ${safeFormatNumber(conversionRate, 6)} ${toCurrency.toUpperCase()}
• ${bold('USD Values:')}
  – 1 ${fromCurrency.toUpperCase()} = $${safeFormatNumber(fromPriceUSD, 6)}
  – 1 ${toCurrency.toUpperCase()} = $${safeFormatNumber(toPriceUSD, 6)}

${bold('Data Sources:')}
• ${fromCurrency.toUpperCase()}: ${isFromP2P ? 'Binance P2P rates' : 'CoinMarketCap'}
• ${toCurrency.toUpperCase()}: ${isToP2P ? 'Binance P2P rates' : 'CoinMarketCap'}

${EMOJIS.REFRESH} ${bold('Live data')}`;

  if (loadingMsg?.result?.message_id) {
    await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, convertMessage, 'HTML');
  } else {
    await sendMessage(env, chatId, convertMessage, 'HTML');
  }
}
