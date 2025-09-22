/**
 * Coin information command handler with enhanced features
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

/**
 * Handles /coin command for cryptocurrency information
 * @param {object} env - Cloudflare environment
 * @param {string|number} chatId - Chat ID
 * @param {string[]} args - Command arguments
 * @returns {Promise<void>}
 */
export async function handleCoin(env, chatId, args) {
  try {
    const coinSymbol = args[1];
    
    // Validate coin symbol
    const validation = validateCoinSymbol(coinSymbol);
    if (!validation.isValid) {
      const helpMessage = `${EMOJIS.ERROR} *Coin Command Help*

*${EMOJIS.COIN} Format:*
<code>/coin [symbol]</code>

*📝 Examples:*
• <code>/coin bitcoin</code> - Bitcoin information with charts
• <code>/coin eth</code> - Ethereum data
• <code>/coin cardano</code> - Cardano (ADA) info
• <code>/coin btc</code> - Bitcoin by symbol

*💡 Tips:*
• Use coin name or symbol
• Charts support 1d/7d/30d timeframes
• Click chart buttons for different periods
• All data is live from CoinMarketCap

${validation.error}`;

      await sendMessage(env, chatId, helpMessage, 'HTML');
      return;
    }

    // Send loading message
    const loadingMsg = await sendLoadingMessage(env, chatId, 
      `${EMOJIS.LOADING} Fetching ${validation.value} data and generating chart...`);

    try {
      // Search for the coin
      const coinData = await searchCoinSymbol(env, validation.value);
      if (!coinData) {
        const notFoundMessage = `${EMOJIS.ERROR} ${bold('Coin not found')}

Could not find cryptocurrency: ${bold(escapeHTML(validation.value))}

${bold(`${EMOJIS.CHART} Suggestions:`)}
• Try the full name: <code>bitcoin</code>, <code>ethereum</code>
• Use common symbols: <code>btc</code>, <code>eth</code>, <code>ada</code>
• Check spelling and try again
• Use <code>/help</code> for other commands`;

        if (loadingMsg?.result?.message_id) {
          await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, notFoundMessage, 'HTML');
        } else {
          await sendMessage(env, chatId, notFoundMessage, 'HTML');
        }
        return;
      }

      // Fetch detailed data and chart data in parallel
      const [detailedData, marketChart] = await Promise.all([
        getCoinData(env, coinData.id),
        getCoinMarketChart(env, coinData.id, CHART_CONFIG.DEFAULT_DAYS)
      ]);

      if (!detailedData?.market_data) {
        throw new Error('Could not fetch coin market data');
      }

      // Extract market data
      const marketData = detailedData.market_data;
      const currentPrice = marketData.current_price?.usd;
      const priceChange24h = marketData.price_change_percentage_24h;
      const marketCap = marketData.market_cap?.usd;
      const volume24h = marketData.total_volume?.usd;
      const marketCapRank = detailedData.market_cap_rank;
      const circulatingSupply = marketData.circulating_supply;

      // Generate chart
      const chartUrl = await generateChartImageUrl(
        marketChart.prices, 
        coinData.name, 
        CHART_CONFIG.DEFAULT_DAYS,
        { showTitle: true, showGrid: true }
      );

      // Create comprehensive coin information message
      let coinMessage = `${EMOJIS.COIN} ${bold(`${detailedData.name} (${coinData.symbol.toUpperCase()})`)}

${bold('💰 Price Information:')}
• ${bold('Current Price:')} $${safeFormatNumber(currentPrice, currentPrice > 1 ? 2 : 6)}
• ${bold('24h Change:')} ${safeFormatPercentageChange(priceChange24h)}
${marketCapRank ? `• ${bold('Market Cap Rank:')} #${escapeHTML(marketCapRank.toString())}` : ''}

${bold('📊 Market Statistics:')}
• ${bold('Market Cap:')} $${safeFormatLargeNumber(marketCap)}
• ${bold('24h Volume:')} $${safeFormatLargeNumber(volume24h)}
${circulatingSupply ? `• ${bold('Circulating Supply:')} ${safeFormatLargeNumber(circulatingSupply)} ${escapeHTML(coinData.symbol.toUpperCase())}` : ''}

${bold('📈 Additional Data:')}`;

      // Add additional price data if available
      if (marketData.high_24h && marketData.low_24h) {
        coinMessage += `\n• ${bold('24h High:')} $${safeFormatNumber(marketData.high_24h.usd, currentPrice > 1 ? 2 : 6)}`;
        coinMessage += `\n• ${bold('24h Low:')} $${safeFormatNumber(marketData.low_24h.usd, currentPrice > 1 ? 2 : 6)}`;
      }

      if (marketData.price_change_percentage_7d) {
        coinMessage += `\n• ${bold('7d Change:')} ${safeFormatPercentageChange(marketData.price_change_percentage_7d)}`;
      }

      if (marketData.price_change_percentage_30d) {
        coinMessage += `\n• ${bold('30d Change:')} ${safeFormatPercentageChange(marketData.price_change_percentage_30d)}`;
      }

      // Add links section
      const websiteLink = detailedData.links?.homepage?.[0] 
        ? ` • [Website](${detailedData.links.homepage[0]})` 
        : '';
      
      const finalMessage = `${coinMessage}

${bold(`${EMOJIS.LINK} Links:`)}
• [CoinMarketCap Data](https://coinmarketcap.com/)${websiteLink}

${bold(`${EMOJIS.CHART} Interactive Chart (${CHART_CONFIG.DEFAULT_DAYS} days)`)}
${EMOJIS.REFRESH} ${bold('Use buttons below to change timeframe')}

${EMOJIS.REFRESH} ${bold('Live data from CoinMarketCap')}`;

      // Create timeframe selection keyboard
      const keyboard = createTimeframeKeyboard('coin', coinData.id);

      // Send chart with comprehensive information
      if (loadingMsg?.result?.message_id) {
        // Update loading message to final result, then send chart
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, 
          `${EMOJIS.SUCCESS} Data fetched\\! Sending chart...`, 'HTML');
        await sendPhoto(env, chatId, chartUrl, finalMessage, 'HTML', keyboard);
      } else {
        await sendPhoto(env, chatId, chartUrl, finalMessage, 'HTML', keyboard);
      }

      console.log(`Coin data sent successfully for: ${coinData.name} (${coinData.symbol})`);

    } catch (apiError) {
      console.error("Coin API error:", apiError);
      
      let errorMessage = `${EMOJIS.WARNING} ${bold('Could not fetch coin data')}`;

      if (apiError.message.includes('⚠️ CoinMarketCap API rate limit exceeded')) {
        errorMessage += `\n\n${apiError.message}\n\n${bold('Please wait about a minute before trying again.')}\n\n${EMOJIS.LOADING} ${bold('Rate limiting helps keep the service available for everyone.')}`;
      } else if (apiError.message.includes('rate limit')) {
        errorMessage += `\n\n⚠️ CoinMarketCap API rate limit exceeded. Please try again in a minute.`;
      } else if (apiError.message.includes('not found')) {
        errorMessage += `\n\n${EMOJIS.ERROR} ${bold('Cryptocurrency not found!')} Please check the name/symbol and try again.`;
      } else if (apiError.message.includes('Network error')) {
        errorMessage += `\n\n${EMOJIS.ERROR} ${bold('Network error!')} Could not connect to data service.`;
      } else {
        errorMessage += `\n\n${EMOJIS.ERROR} ${escapeHTML(apiError.message)}`;
      }

      errorMessage += `\n\n${bold(`${EMOJIS.CHART} Try:`)}
• Wait a moment and retry
• Use popular coins: <code>/coin bitcoin</code>
• Check spelling: <code>/coin ethereum</code>
• Use symbols: <code>/coin btc</code>`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, errorMessage, 'HTML');
      } else {
        await sendMessage(env, chatId, errorMessage, 'HTML');
      }
    }

  } catch (error) {
    console.error("Coin command error:", error);
    await sendMessage(env, chatId, `${EMOJIS.ERROR} Error processing coin request: ${escapeHTML(error.message)}`, 'HTML');
  }
}

/**
 * Handles coin callback queries for chart timeframe changes
 * @param {object} env - Cloudflare environment
 * @param {object} callbackQuery - Telegram callback query
 * @returns {Promise<void>}
 */
export async function handleCoinCallback(env, callbackQuery) {
  const { data, message } = callbackQuery;
  const chatId = message.chat.id;
  const messageId = message.message_id;

  try {
    // Parse callback data: coin_COINID_DAYS
    const parts = data.split('_');
    if (parts.length !== 3 || parts[0] !== 'coin') {
      console.error('Invalid coin callback data:', data);
      return;
    }

    const [, coinId, days] = parts;
    const daysInt = parseInt(days);

    // Update with loading state
    await updateLoadingMessage(env, chatId, messageId, 
      `${EMOJIS.LOADING} Generating ${days}-day chart...`);

    // Fetch fresh chart data for the requested timeframe
    const [coinData, detailedData, marketChart] = await Promise.all([
      searchCoinSymbol(env, coinId), // This should be cached
      getCoinData(env, coinId),
      getCoinMarketChart(env, coinId, daysInt)
    ]);

    if (!coinData || !detailedData || !marketChart) {
      throw new Error('Could not fetch updated coin data');
    }

    // Generate new chart
    const chartUrl = await generateChartImageUrl(
      marketChart.prices, 
      coinData.name, 
      daysInt,
      { showTitle: true, showGrid: true }
    );

    // Extract market data for updated message
    const marketData = detailedData.market_data;
    const currentPrice = marketData.current_price?.usd;
    const priceChange24h = marketData.price_change_percentage_24h;
    const marketCap = marketData.market_cap?.usd;
    const volume24h = marketData.total_volume?.usd;

    // Create updated message
    const updatedMessage = `${EMOJIS.COIN} ${bold(`${detailedData.name} (${coinData.symbol.toUpperCase()})`)}

${bold('💰 Current Price:')} $${safeFormatNumber(currentPrice, currentPrice > 1 ? 2 : 6)}
${bold('📈 24h Change:')} ${safeFormatPercentageChange(priceChange24h)}
${bold('📊 Market Cap:')} $${safeFormatLargeNumber(marketCap)}
${bold('💱 24h Volume:')} $${safeFormatLargeNumber(volume24h)}

${bold(`${EMOJIS.CHART} Interactive Chart (${days} days)`)}
${EMOJIS.REFRESH} ${bold('Use buttons below to change timeframe')}

${EMOJIS.REFRESH} ${bold('Live data from CoinMarketCap')}`;

    // Update keyboard with current selection
    const keyboard = createTimeframeKeyboard('coin', coinId);

    // Send new photo with updated caption
    await sendPhoto(env, chatId, chartUrl, updatedMessage, 'HTML', keyboard);

  } catch (error) {
    console.error("Coin callback error:", error);
    
    await updateLoadingMessage(env, chatId, messageId, 
      `${EMOJIS.ERROR} Error updating chart. Please try the command again.`, 'HTML');
  }
}