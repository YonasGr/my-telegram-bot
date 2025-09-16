/**
 * Coin information command handler with enhanced features
 */

import { sendMessage, sendPhoto, sendLoadingMessage, updateLoadingMessage, createTimeframeKeyboard } from '../api/telegram.js';
import { searchCoinSymbol, getCoinData, getCoinMarketChart } from '../api/coinGecko.js';
import { generateChartImageUrl } from '../api/charts.js';
import { validateCoinSymbol } from '../utils/validators.js';
import { formatNumber, formatLargeNumber, formatPercentageChange } from '../utils/formatters.js';
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
\`/coin [symbol]\`

*📝 Examples:*
• \`/coin bitcoin\` \\- Bitcoin information with charts
• \`/coin eth\` \\- Ethereum data
• \`/coin cardano\` \\- Cardano \\(ADA\\) info
• \`/coin btc\` \\- Bitcoin by symbol

*💡 Tips:*
• Use coin name or symbol
• Charts support 1d/7d/30d timeframes
• Click chart buttons for different periods
• All data is live from CoinGecko

${validation.error}`;

      await sendMessage(env, chatId, helpMessage, 'MarkdownV2');
      return;
    }

    // Send loading message
    const loadingMsg = await sendLoadingMessage(env, chatId, 
      `${EMOJIS.LOADING} Fetching ${validation.value} data and generating chart...`);

    try {
      // Search for the coin
      const coinData = await searchCoinSymbol(env, validation.value);
      if (!coinData) {
        const notFoundMessage = `${EMOJIS.ERROR} *Coin not found*

Could not find cryptocurrency: *${validation.value}*

*${EMOJIS.CHART} Suggestions:*
• Try the full name: \`bitcoin\`, \`ethereum\`
• Use common symbols: \`btc\`, \`eth\`, \`ada\`
• Check spelling and try again
• Use \`/help\` for other commands`;

        if (loadingMsg?.result?.message_id) {
          await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, notFoundMessage, 'MarkdownV2');
        } else {
          await sendMessage(env, chatId, notFoundMessage, 'MarkdownV2');
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
      const chartUrl = generateChartImageUrl(
        marketChart.prices, 
        coinData.name, 
        CHART_CONFIG.DEFAULT_DAYS,
        { showTitle: true, showGrid: true }
      );

      // Create comprehensive coin information message
      let coinMessage = `${EMOJIS.COIN} *${detailedData.name} \\(${coinData.symbol.toUpperCase()}\\)*

*💰 Price Information:*
• *Current Price:* $${formatNumber(currentPrice, currentPrice > 1 ? 2 : 6)}
• *24h Change:* ${formatPercentageChange(priceChange24h)}
${marketCapRank ? `• *Market Cap Rank:* #${marketCapRank}` : ''}

*📊 Market Statistics:*
• *Market Cap:* $${formatLargeNumber(marketCap)}
• *24h Volume:* $${formatLargeNumber(volume24h)}
${circulatingSupply ? `• *Circulating Supply:* ${formatLargeNumber(circulatingSupply)} ${coinData.symbol.toUpperCase()}` : ''}

*📈 Additional Data:*`;

      // Add additional price data if available
      if (marketData.high_24h && marketData.low_24h) {
        coinMessage += `\n• *24h High:* $${formatNumber(marketData.high_24h.usd, currentPrice > 1 ? 2 : 6)}`;
        coinMessage += `\n• *24h Low:* $${formatNumber(marketData.low_24h.usd, currentPrice > 1 ? 2 : 6)}`;
      }

      if (marketData.price_change_percentage_7d) {
        coinMessage += `\n• *7d Change:* ${formatPercentageChange(marketData.price_change_percentage_7d)}`;
      }

      if (marketData.price_change_percentage_30d) {
        coinMessage += `\n• *30d Change:* ${formatPercentageChange(marketData.price_change_percentage_30d)}`;
      }

      // Add links section
      const finalMessage = `${coinMessage}

*${EMOJIS.LINK} Links:*
• [CoinGecko](https://www.coingecko.com/en/coins/${coinData.id})${detailedData.links?.homepage?.[0] ? ` • [Website](${detailedData.links.homepage[0]})` : ''}

*${EMOJIS.CHART} Interactive Chart \\(${CHART_CONFIG.DEFAULT_DAYS} days\\)*
${EMOJIS.REFRESH} *Use buttons below to change timeframe*

${EMOJIS.REFRESH} *Live data from CoinGecko*`;

      // Create timeframe selection keyboard
      const keyboard = createTimeframeKeyboard('coin', coinData.id);

      // Send chart with comprehensive information
      if (loadingMsg?.result?.message_id) {
        // Update loading message to final result, then send chart
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, 
          `${EMOJIS.SUCCESS} Data fetched\\! Sending chart\\.\\.\\.`, 'MarkdownV2');
        await sendPhoto(env, chatId, chartUrl, finalMessage, 'MarkdownV2', keyboard);
      } else {
        await sendPhoto(env, chatId, chartUrl, finalMessage, 'MarkdownV2', keyboard);
      }

      console.log(`Coin data sent successfully for: ${coinData.name} (${coinData.symbol})`);

    } catch (apiError) {
      console.error("Coin API error:", apiError);
      
      let errorMessage = `${EMOJIS.WARNING} *Could not fetch coin data*`;

      if (apiError.message.includes('rate limit')) {
        errorMessage += `\n\n${EMOJIS.LOADING} *Rate limited\\!* CoinGecko API is busy\\. Please wait a minute and try again\\.`;
      } else if (apiError.message.includes('not found')) {
        errorMessage += `\n\n${EMOJIS.ERROR} *Cryptocurrency not found\\!* Please check the name/symbol and try again\\.`;
      } else if (apiError.message.includes('Network error')) {
        errorMessage += `\n\n${EMOJIS.ERROR} *Network error\\!* Could not connect to data service\\.`;
      } else {
        errorMessage += `\n\n${EMOJIS.ERROR} ${apiError.message}`;
      }

      errorMessage += `\n\n*${EMOJIS.CHART} Try:*
• Wait a moment and retry
• Use popular coins: \`/coin bitcoin\`
• Check spelling: \`/coin ethereum\`
• Use symbols: \`/coin btc\``;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, errorMessage, 'MarkdownV2');
      } else {
        await sendMessage(env, chatId, errorMessage, 'MarkdownV2');
      }
    }

  } catch (error) {
    console.error("Coin command error:", error);
    await sendMessage(env, chatId, `${EMOJIS.ERROR} Error processing coin request: ${error.message}`, 'MarkdownV2');
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
      `${EMOJIS.LOADING} Generating ${days}\\-day chart...`);

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
    const chartUrl = generateChartImageUrl(
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
    const updatedMessage = `${EMOJIS.COIN} *${detailedData.name} \\(${coinData.symbol.toUpperCase()}\\)*

*💰 Current Price:* $${formatNumber(currentPrice, currentPrice > 1 ? 2 : 6)}
*📈 24h Change:* ${formatPercentageChange(priceChange24h)}
*📊 Market Cap:* $${formatLargeNumber(marketCap)}
*💱 24h Volume:* $${formatLargeNumber(volume24h)}

*${EMOJIS.CHART} Interactive Chart \\(${days} days\\)*
${EMOJIS.REFRESH} *Use buttons below to change timeframe*

${EMOJIS.REFRESH} *Live data from CoinGecko*`;

    // Update keyboard with current selection
    const keyboard = createTimeframeKeyboard('coin', coinId);

    // Send new photo with updated caption
    await sendPhoto(env, chatId, chartUrl, updatedMessage, 'MarkdownV2', keyboard);

  } catch (error) {
    console.error("Coin callback error:", error);
    
    await updateLoadingMessage(env, chatId, messageId, 
      `${EMOJIS.ERROR} Error updating chart\\. Please try the command again\\.`, 'MarkdownV2');
  }
}