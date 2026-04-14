/**
 * Coin information command handler
 */

import {
  sendMessage,
  sendPhoto,
  sendPhotoBlob,
  deleteMessage,
  sendLoadingMessage,
  updateLoadingMessage,
  createTimeframeKeyboard,
  answerCallbackQuery,
} from '../api/telegram.js';
import { searchCoinSymbol, getCoinData, getCoinMarketChart } from '../api/coinmarketcap.js';
import { fetchChartImage, buildFallbackChartUrl } from '../api/charts.js';
import { validateCoinSymbol } from '../utils/validators.js';
import {
  safeFormatNumber,
  safeFormatLargeNumber,
  safeFormatPercentageChange,
  escapeHTML,
  bold,
} from '../utils/formatters.js';
import { EMOJIS, CHART_CONFIG } from '../config/constants.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Builds the coin info caption for a photo message.
 */
function buildCoinCaption(detailedData, coinData, days) {
  const md = detailedData.market_data;
  const price = md.current_price?.usd;
  const change24h = md.price_change_percentage_24h;
  const marketCap = md.market_cap?.usd;
  const volume24h = md.total_volume?.usd;
  const rank = detailedData.market_cap_rank;
  const supply = md.circulating_supply;

  let caption = `${EMOJIS.COIN} ${bold(`${detailedData.name} (${coinData.symbol.toUpperCase()})`)}

<blockquote>${bold('Price:')} $${safeFormatNumber(price, price > 1 ? 2 : 6)}
${bold('24h Change:')} ${safeFormatPercentageChange(change24h)}
${rank ? `${bold('Rank:')} #${escapeHTML(String(rank))}` : ''}</blockquote>

${bold('Market Statistics:')}
• ${bold('Market Cap:')} $${safeFormatLargeNumber(marketCap)}
• ${bold('24h Volume:')} $${safeFormatLargeNumber(volume24h)}
${supply ? `• ${bold('Circulating Supply:')} ${safeFormatLargeNumber(supply)} ${escapeHTML(coinData.symbol.toUpperCase())}` : ''}`;

  if (md.high_24h?.usd && md.low_24h?.usd) {
    caption += `\n• ${bold('24h High:')} $${safeFormatNumber(md.high_24h.usd, price > 1 ? 2 : 6)}`;
    caption += `\n• ${bold('24h Low:')} $${safeFormatNumber(md.low_24h.usd, price > 1 ? 2 : 6)}`;
  }
  if (md.price_change_percentage_7d) {
    caption += `\n• ${bold('7d Change:')} ${safeFormatPercentageChange(md.price_change_percentage_7d)}`;
  }
  if (md.price_change_percentage_30d) {
    caption += `\n• ${bold('30d Change:')} ${safeFormatPercentageChange(md.price_change_percentage_30d)}`;
  }

  const websiteLink = detailedData.links?.homepage?.[0]
    ? ` · <a href="${detailedData.links.homepage[0]}">Website</a>`
    : '';

  caption += `\n\n${bold('Links:')} <a href="https://coinmarketcap.com/">CoinMarketCap</a>${websiteLink}

${EMOJIS.REFRESH} ${bold(`Live data · ${days === 1 ? '24h' : days + 'd'} chart`)}`;

  return caption;
}

/**
 * Fetches chart image blob from backend, falls back to QuickChart URL.
 * Returns { blob, fallbackUrl } — one of them will be non-null.
 */
async function getChart(prices, coinName, days) {
  try {
    const blob = await fetchChartImage(prices, coinName, days);
    if (blob) return { blob, fallbackUrl: null };
  } catch (err) {
    console.error('Backend chart fetch failed, using fallback:', err.message);
  }
  return { blob: null, fallbackUrl: buildFallbackChartUrl(prices, coinName, days) };
}

// ─── /coin command ────────────────────────────────────────────────────────────

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

${bold('Tips:')} Use coin name or symbol. Use the 1D / 7D / 30D buttons to switch timeframes.

${escapeHTML(validation.error)}`, 'HTML');
      return;
    }

    const loadingMsg = await sendLoadingMessage(env, chatId,
      `${EMOJIS.LOADING} Fetching ${validation.value} data...`);

    try {
      const coinData = await searchCoinSymbol(env, validation.value);
      if (!coinData) {
        const msg = `${EMOJIS.ERROR} ${bold('Coin not found')}

Could not find: ${bold(escapeHTML(validation.value))}

Try the full name (<code>bitcoin</code>, <code>ethereum</code>) or a common symbol (<code>btc</code>, <code>eth</code>).`;
        if (loadingMsg?.result?.message_id) {
          await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, msg, 'HTML');
        } else {
          await sendMessage(env, chatId, msg, 'HTML');
        }
        return;
      }

      const days = CHART_CONFIG.DEFAULT_DAYS;

      const [detailedData, marketChart] = await Promise.all([
        getCoinData(env, coinData.id),
        getCoinMarketChart(env, coinData.id, days),
      ]);

      if (!detailedData?.market_data) throw new Error('Could not fetch coin market data');

      const caption  = buildCoinCaption(detailedData, coinData, days);
      const keyboard = createTimeframeKeyboard('coin', coinData.id, days);
      const { blob, fallbackUrl } = await getChart(marketChart.prices, coinData.name, days);

      // Delete the loading text message before sending the photo
      if (loadingMsg?.result?.message_id) {
        await deleteMessage(env, chatId, loadingMsg.result.message_id);
      }

      if (blob) {
        await sendPhotoBlob(env, chatId, blob, caption, 'HTML', keyboard, fallbackUrl);
      } else {
        await sendPhoto(env, chatId, fallbackUrl, caption, 'HTML', keyboard);
      }

    } catch (apiError) {
      console.error('Coin API error:', apiError);
      const errorMessage = `${EMOJIS.WARNING} ${bold('Could not fetch coin data')}

${escapeHTML(apiError.message)}

${bold('Try:')} Wait a moment and retry, or use <code>/coin bitcoin</code>`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, errorMessage, 'HTML');
      } else {
        await sendMessage(env, chatId, errorMessage, 'HTML');
      }
    }
  } catch (error) {
    console.error('Coin command error:', error);
    await sendMessage(env, chatId,
      `${EMOJIS.ERROR} Error processing coin request: ${escapeHTML(error.message)}`, 'HTML');
  }
}

// ─── Timeframe button callback ────────────────────────────────────────────────

export async function handleCoinCallback(env, callbackQuery) {
  const { id: callbackId, data, message } = callbackQuery;
  const chatId    = message.chat.id;
  const messageId = message.message_id;

  // Acknowledge the button press immediately so Telegram stops the spinner
  await answerCallbackQuery(env, callbackId, '');

  try {
    // callback_data format: coin_<coinId>_<days>
    const parts = data.split('_');
    if (parts.length !== 3 || parts[0] !== 'coin') {
      console.error('Invalid coin callback data:', data);
      return;
    }

    const [, coinId, daysStr] = parts;
    const days = parseInt(daysStr, 10);

    // Fetch fresh data for the new timeframe
    const [coinData, detailedData, marketChart] = await Promise.all([
      searchCoinSymbol(env, coinId),
      getCoinData(env, coinId),
      getCoinMarketChart(env, coinId, days),
    ]);

    if (!coinData || !detailedData || !marketChart) {
      throw new Error('Could not fetch updated coin data');
    }

    const caption  = buildCoinCaption(detailedData, coinData, days);
    const keyboard = createTimeframeKeyboard('coin', coinId, days);
    const { blob, fallbackUrl } = await getChart(marketChart.prices, coinData.name, days);

    // Telegram does not allow editing a photo message's media via editMessageMedia
    // from a URL after it was uploaded as a file — so we delete + resend.
    await deleteMessage(env, chatId, messageId);

    if (blob) {
      await sendPhotoBlob(env, chatId, blob, caption, 'HTML', keyboard, fallbackUrl);
    } else {
      await sendPhoto(env, chatId, fallbackUrl, caption, 'HTML', keyboard);
    }

  } catch (error) {
    console.error('Coin callback error:', error);
    // Don't delete the message on error — just notify via callback answer
    await answerCallbackQuery(env, callbackId, '⚠️ Error updating chart. Try again.', true);
  }
}
