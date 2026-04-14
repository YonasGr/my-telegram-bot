/**
 * Coin information command handler
 */

import { sendMessage, sendPhoto, sendLoadingMessage, updateLoadingMessage, createTimeframeKeyboard } from '../api/telegram.js';
import { searchCoinSymbol, getCoinData, getCoinMarketChart } from '../api/coinmarketcap.js';
import { generateChartImageUrl } from '../api/charts.js';
import { validateCoinSymbol } from '../utils/validators.js';
import {
  safeFormatNumber,
  safeFormatLargeNumber,
  safeFormatPercentageChange,
  escapeHTML,
  bold
} from '../utils/formatters.js';
import { EMOJIS, CHART_CONFIG } from '../config/constants.js';

export async function handleCoin(env, chatId, args) {
  try {
    const coinSymbol = args[1];

    const validation = validateCoinSymbol(coinSymbol);
    if (!validation.isValid) {
      await sendMessage(env, chatId, `${EMOJIS.ERROR} ${bold('Coin Command Help')}

${bold(`${EMOJIS.COIN} Format:`)}
<code>/coin [symbol]</code>

${bold('Examples:')}
• <code>/coin bitcoin</code>
• <code>/coin eth</code>
• <code>/coin cardano</code>

${bold('Tips:')} Use coin name or symbol. Charts support 1d/7d/30d via inline buttons.

${escapeHTML(validation.error)}`, 'HTML');
      return;
    }

    const loadingMsg = await sendLoadingMessage(env, chatId,
      `${EMOJIS.LOADING} Fetching ${validation.value} data and generating chart...`);

    try {
      const coinData = await searchCoinSymbol(env, validation.value);
      if (!coinData) {
        const msg = `${EMOJIS.ERROR} ${bold('Coin not found')}

Could not find: ${bold(escapeHTML(validation.value))}

Try the full name (<code>bitcoin</code>, <code>ethereum</code>), a common symbol (<code>btc</code>, <code>eth</code>), or check spelling.`;
        if (loadingMsg?.result?.message_id) {
          await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, msg, 'HTML');
        } else {
          await sendMessage(env, chatId, msg, 'HTML');
        }
        return;
      }

      const [detailedData, marketChart] = await Promise.all([
        getCoinData(env, coinData.id),
        getCoinMarketChart(env, coinData.id, CHART_CONFIG.DEFAULT_DAYS)
      ]);

      if (!detailedData?.market_data) throw new Error('Could not fetch coin market data');

      const marketData = detailedData.market_data;
      const currentPrice = marketData.current_price?.usd;
      const priceChange24h = marketData.price_change_percentage_24h;
      const marketCap = marketData.market_cap?.usd;
      const volume24h = marketData.total_volume?.usd;
      const marketCapRank = detailedData.market_cap_rank;
      const circulatingSupply = marketData.circulating_supply;

      const chartUrl = await generateChartImageUrl(
        marketChart.prices,
        coinData.name,
        CHART_CONFIG.DEFAULT_DAYS
      );

      let coinMessage = `${EMOJIS.COIN} ${bold(`${detailedData.name} (${coinData.symbol.toUpperCase()})`)}

<blockquote>${bold('Price:')} $${safeFormatNumber(currentPrice, currentPrice > 1 ? 2 : 6)}
${bold('24h Change:')} ${safeFormatPercentageChange(priceChange24h)}
${marketCapRank ? `${bold('Rank:')} #${escapeHTML(String(marketCapRank))}` : ''}</blockquote>

${bold('Market Statistics:')}
• ${bold('Market Cap:')} $${safeFormatLargeNumber(marketCap)}
• ${bold('24h Volume:')} $${safeFormatLargeNumber(volume24h)}
${circulatingSupply ? `• ${bold('Circulating Supply:')} ${safeFormatLargeNumber(circulatingSupply)} ${escapeHTML(coinData.symbol.toUpperCase())}` : ''}`;

      if (marketData.high_24h?.usd && marketData.low_24h?.usd) {
        coinMessage += `\n• ${bold('24h High:')} $${safeFormatNumber(marketData.high_24h.usd, currentPrice > 1 ? 2 : 6)}`;
        coinMessage += `\n• ${bold('24h Low:')} $${safeFormatNumber(marketData.low_24h.usd, currentPrice > 1 ? 2 : 6)}`;
      }
      if (marketData.price_change_percentage_7d) {
        coinMessage += `\n• ${bold('7d Change:')} ${safeFormatPercentageChange(marketData.price_change_percentage_7d)}`;
      }
      if (marketData.price_change_percentage_30d) {
        coinMessage += `\n• ${bold('30d Change:')} ${safeFormatPercentageChange(marketData.price_change_percentage_30d)}`;
      }

      const websiteLink = detailedData.links?.homepage?.[0]
        ? ` · <a href="${detailedData.links.homepage[0]}">Website</a>`
        : '';

      const finalMessage = `${coinMessage}

${bold('Links:')} <a href="https://coinmarketcap.com/">CoinMarketCap</a>${websiteLink}

${EMOJIS.REFRESH} ${bold('Live data · Use buttons to change timeframe')}`;

      const keyboard = createTimeframeKeyboard('coin', coinData.id);

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id,
          `${EMOJIS.SUCCESS} Data fetched! Sending chart...`, 'HTML');
      }
      await sendPhoto(env, chatId, chartUrl, finalMessage, 'HTML', keyboard);

    } catch (apiError) {
      console.error('Coin API error:', apiError);

      let errorMessage = `${EMOJIS.WARNING} ${bold('Could not fetch coin data')}

${escapeHTML(apiError.message)}

${bold('Try:')} Wait a moment and retry, or use popular coins like <code>/coin bitcoin</code>`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, errorMessage, 'HTML');
      } else {
        await sendMessage(env, chatId, errorMessage, 'HTML');
      }
    }
  } catch (error) {
    console.error('Coin command error:', error);
    await sendMessage(env, chatId, `${EMOJIS.ERROR} Error processing coin request: ${escapeHTML(error.message)}`, 'HTML');
  }
}

export async function handleCoinCallback(env, callbackQuery) {
  const { data, message } = callbackQuery;
  const chatId = message.chat.id;
  const messageId = message.message_id;

  try {
    const parts = data.split('_');
    if (parts.length !== 3 || parts[0] !== 'coin') return;

    const [, coinId, days] = parts;
    const daysInt = parseInt(days);

    await updateLoadingMessage(env, chatId, messageId,
      `${EMOJIS.LOADING} Generating ${days}-day chart...`);

    const [coinData, detailedData, marketChart] = await Promise.all([
      searchCoinSymbol(env, coinId),
      getCoinData(env, coinId),
      getCoinMarketChart(env, coinId, daysInt)
    ]);

    if (!coinData || !detailedData || !marketChart) throw new Error('Could not fetch updated coin data');

    const chartUrl = await generateChartImageUrl(marketChart.prices, coinData.name, daysInt);

    const marketData = detailedData.market_data;
    const currentPrice = marketData.current_price?.usd;
    const priceChange24h = marketData.price_change_percentage_24h;
    const marketCap = marketData.market_cap?.usd;
    const volume24h = marketData.total_volume?.usd;

    const updatedMessage = `${EMOJIS.COIN} ${bold(`${detailedData.name} (${coinData.symbol.toUpperCase()})`)}

<blockquote>${bold('Price:')} $${safeFormatNumber(currentPrice, currentPrice > 1 ? 2 : 6)}
${bold('24h Change:')} ${safeFormatPercentageChange(priceChange24h)}</blockquote>

• ${bold('Market Cap:')} $${safeFormatLargeNumber(marketCap)}
• ${bold('24h Volume:')} $${safeFormatLargeNumber(volume24h)}

${EMOJIS.REFRESH} ${bold(`Live data · ${days}-day chart`)}`;

    await sendPhoto(env, chatId, chartUrl, updatedMessage, 'HTML', createTimeframeKeyboard('coin', coinId));

  } catch (error) {
    console.error('Coin callback error:', error);
    await updateLoadingMessage(env, chatId, messageId,
      `${EMOJIS.ERROR} Error updating chart. Please try the command again.`, 'HTML');
  }
}
