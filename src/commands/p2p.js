/**
 * P2P command handler with enhanced features
 */

import { sendMessage, sendLoadingMessage, updateLoadingMessage, createTradeTypeKeyboard } from '../api/telegram.js';
import { getP2PDataWithCache, formatP2PResponse } from '../api/binanceP2P.js';
import { validateP2PArgs } from '../utils/validators.js';
import { EMOJIS } from '../config/constants.js';

/**
 * Handles /p2p command for Binance P2P rates
 * @param {object} env - Cloudflare environment
 * @param {string|number} chatId - Chat ID
 * @param {string[]} args - Command arguments
 * @returns {Promise<void>}
 */
export async function handleP2P(env, chatId, args) {
  try {
    // Validate and parse arguments
    const { asset, fiat, tradeType, rows, errors } = validateP2PArgs(args);
    
    if (errors.length > 0) {
      const errorMessage = `${EMOJIS.ERROR} *P2P Command Errors:*

${errors.map(err => `• ${err}`).join('\n')}

*${EMOJIS.MONEY} Correct format:*
\`/p2p [asset] [fiat] [type] [rows]\`

*📝 Examples:*
• \`/p2p\` \\- Default USDT/ETB BUY rates
• \`/p2p USDT ETB SELL\` \\- USDT selling rates in ETB
• \`/p2p BTC USD BUY 15\` \\- Bitcoin buying rates, 15 results

*Supported:*
• *Assets:* USDT, BTC, ETH, BNB, BUSD
• *Fiats:* ETB, USD, EUR, GBP, NGN, KES, GHS
• *Types:* BUY, SELL`;

      await sendMessage(env, chatId, errorMessage, 'MarkdownV2');
      return;
    }

    // Send loading message
    const loadingMsg = await sendLoadingMessage(env, chatId, 
      `${EMOJIS.LOADING} Fetching ${tradeType} rates for ${asset}/${fiat}...`);

    try {
      // Fetch P2P data
      const data = await getP2PDataWithCache(env, asset, fiat, tradeType, rows, 1);
      
      if (!data?.data?.data || data.data.data.length === 0) {
        const noDataMessage = `${EMOJIS.ERROR} *No ${tradeType} offers found*

No active ${tradeType.toLowerCase()} offers for *${asset}/${fiat}* right now\\.

${EMOJIS.CHART} *Suggestions:*
• Try a different trade type \\(${tradeType === 'BUY' ? 'SELL' : 'BUY'}\\)
• Check popular pairs like USDT/ETB
• Try again in a few minutes

*${EMOJIS.REFRESH} Quick switch:*`;

        const keyboard = createTradeTypeKeyboard('p2p', asset, fiat);
        
        if (loadingMsg?.result?.message_id) {
          await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, noDataMessage, 'MarkdownV2', keyboard);
        } else {
          await sendMessage(env, chatId, noDataMessage, 'MarkdownV2', keyboard);
        }
        return;
      }

      // Format and send response
      const response = formatP2PResponse(data, asset, fiat, tradeType, 5);
      
      // Add interactive keyboard for switching trade types
      const keyboard = createTradeTypeKeyboard('p2p', asset, fiat);
      const enhancedResponse = `${response}

*${EMOJIS.REFRESH} Quick Actions:*`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, enhancedResponse, 'MarkdownV2', keyboard);
      } else {
        await sendMessage(env, chatId, enhancedResponse, 'MarkdownV2', keyboard);
      }

      // Log successful request
      console.log(`P2P request completed: ${asset}/${fiat} ${tradeType}, ${data.data.data.length} results`);

    } catch (apiError) {
      console.error("P2P API error:", apiError);
      
      let errorMessage = `${EMOJIS.WARNING} *Service Temporarily Unavailable*

Could not fetch P2P data right now\\.`;

      if (apiError.message.includes('rate limit')) {
        errorMessage += `\n\n${EMOJIS.LOADING} *Rate limited\\!* Please wait a moment and try again\\.`;
      } else if (apiError.message.includes('timeout')) {
        errorMessage += `\n\n${EMOJIS.REFRESH} *Service timeout\\!* The P2P service is busy\\. Please try again\\.`;
      } else if (apiError.message.includes('Network error')) {
        errorMessage += `\n\n${EMOJIS.ERROR} *Network error\\!* Please check your connection and try again\\.`;
      } else {
        errorMessage += `\n\n${EMOJIS.ERROR} Error: ${apiError.message}`;
      }

      errorMessage += `\n\n*${EMOJIS.CHART} You can try:*
• Wait a few seconds and retry
• Try a different asset/fiat pair
• Use \`/help\` for other commands`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, errorMessage, 'MarkdownV2');
      } else {
        await sendMessage(env, chatId, errorMessage, 'MarkdownV2');
      }
    }

  } catch (error) {
    console.error("P2P command error:", error);
    
    const errorMessage = `${EMOJIS.ERROR} *Command Processing Error*

An unexpected error occurred while processing your P2P request\\.

*${EMOJIS.WAVE} Please try:*
• \`/help\` \\- View command help
• \`/p2p USDT ETB BUY\` \\- Try default request
• Contact support if this persists

*Error details:* ${error.message}`;

    await sendMessage(env, chatId, errorMessage, 'MarkdownV2');
  }
}

/**
 * Handles P2P callback queries from inline keyboards
 * @param {object} env - Cloudflare environment
 * @param {object} callbackQuery - Telegram callback query
 * @returns {Promise<void>}
 */
export async function handleP2PCallback(env, callbackQuery) {
  const { data, message } = callbackQuery;
  const chatId = message.chat.id;
  const messageId = message.message_id;
  
  try {
    // Parse callback data: p2p_ASSET_FIAT_TRADETYPE
    const parts = data.split('_');
    if (parts.length !== 4 || parts[0] !== 'p2p') {
      console.error('Invalid P2P callback data:', data);
      return;
    }

    const [, asset, fiat, tradeType] = parts;
    
    // Update message with loading state
    await updateLoadingMessage(env, chatId, messageId, 
      `${EMOJIS.LOADING} Fetching ${tradeType} rates for ${asset}/${fiat}...`);

    // Fetch new data
    const newData = await getP2PDataWithCache(env, asset, fiat, tradeType, 10, 1);
    
    if (!newData?.data?.data || newData.data.data.length === 0) {
      const noDataMessage = `${EMOJIS.ERROR} *No ${tradeType} offers found*

No active ${tradeType.toLowerCase()} offers for *${asset}/${fiat}* right now\\.

*${EMOJIS.REFRESH} Try different options:*`;
      
      const keyboard = createTradeTypeKeyboard('p2p', asset, fiat);
      await updateLoadingMessage(env, chatId, messageId, noDataMessage, 'MarkdownV2', keyboard);
      return;
    }

    // Format and update message
    const response = formatP2PResponse(newData, asset, fiat, tradeType, 5);
    const keyboard = createTradeTypeKeyboard('p2p', asset, fiat);
    const enhancedResponse = `${response}

*${EMOJIS.REFRESH} Quick Actions:*`;

    await updateLoadingMessage(env, chatId, messageId, enhancedResponse, 'MarkdownV2', keyboard);

  } catch (error) {
    console.error("P2P callback error:", error);
    
    await updateLoadingMessage(env, chatId, messageId, 
      `${EMOJIS.ERROR} Error updating P2P data\\. Please try the command again\\.`, 'MarkdownV2');
  }
}