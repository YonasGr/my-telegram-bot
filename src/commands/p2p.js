/**
 * P2P command handler with enhanced features
 */

import { sendMessage, sendLoadingMessage, updateLoadingMessage, createTradeTypeKeyboard } from '../api/telegram.js';
import { getP2PDataWithCache, formatP2PResponse } from '../api/binanceP2P.js';
import { validateP2PArgs } from '../utils/validators.js';
import { bold, escapeHTML } from '../utils/formatters.js';
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
      const errorMessage = `${EMOJIS.ERROR} ${bold('P2P Command Errors:')}

${errors.map(err => `• ${escapeHTML(err)}`).join('\n')}

${bold(`${EMOJIS.MONEY} Correct format:`)}
<code>/p2p [asset] [fiat] [type] [rows]<code>

${bold('📝 Examples:')}
• <code>/p2p<code> - Default USDT/ETB BUY rates
• <code>/p2p USDT ETB SELL<code> - USDT selling rates in ETB
• <code>/p2p BTC USD BUY 15<code> - Bitcoin buying rates, 15 results

${bold('Supported:')}
• ${bold('Assets:')} USDT, BTC, ETH, BNB, BUSD
• ${bold('Fiats:')} ETB, USD, EUR, GBP, NGN, KES, GHS
• ${bold('Types:')} BUY, SELL`;

      await sendMessage(env, chatId, errorMessage, 'HTML');
      return;
    }

    // Send loading message
    const loadingMsg = await sendLoadingMessage(env, chatId, 
      `${EMOJIS.LOADING} Fetching ${tradeType} rates for ${asset}/${fiat}...`);

    try {
      // Fetch P2P data
      const data = await getP2PDataWithCache(env, asset, fiat, tradeType, rows, 1);
      
      if (!data?.data?.data || data.data.data.length === 0) {
        const noDataMessage = `${EMOJIS.ERROR} ${bold(`No ${tradeType} offers found`)}

No active ${tradeType.toLowerCase()} offers for ${bold(`${asset}/${fiat}`)} right now.

${bold(`${EMOJIS.CHART} Suggestions:`)}
• Try a different trade type (${tradeType === 'BUY' ? 'SELL' : 'BUY'})
• Check popular pairs like USDT/ETB
• Try again in a few minutes

${bold(`${EMOJIS.REFRESH} Quick switch:`)}`;

        const keyboard = createTradeTypeKeyboard('p2p', asset, fiat);
        
        if (loadingMsg?.result?.message_id) {
          await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, noDataMessage, 'HTML', keyboard);
        } else {
          await sendMessage(env, chatId, noDataMessage, 'HTML', keyboard);
        }
        return;
      }

      // Format and send response
      const response = formatP2PResponse(data, asset, fiat, tradeType, 5);
      
      // Add interactive keyboard for switching trade types
      const keyboard = createTradeTypeKeyboard('p2p', asset, fiat);
      const enhancedResponse = `${response}

${bold(`${EMOJIS.REFRESH} Quick Actions:`)}`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, enhancedResponse, 'HTML', keyboard);
      } else {
        await sendMessage(env, chatId, enhancedResponse, 'HTML', keyboard);
      }

      // Log successful request
      console.log(`P2P request completed: ${asset}/${fiat} ${tradeType}, ${data.data.data.length} results`);

    } catch (apiError) {
      console.error("P2P API error:", apiError);
      
      let errorMessage = `${EMOJIS.WARNING} ${bold('Service Temporarily Unavailable')}

Could not fetch P2P data right now.`;

      if (apiError.message.includes('rate limit')) {
        errorMessage += `\n\n${EMOJIS.LOADING} ${bold('Rate limited!')} Please wait a moment and try again.`;
      } else if (apiError.message.includes('timeout')) {
        errorMessage += `\n\n${EMOJIS.REFRESH} ${bold('Service timeout!')} The P2P service is busy. Please try again.`;
      } else if (apiError.message.includes('Network error')) {
        errorMessage += `\n\n${EMOJIS.ERROR} ${bold('Network error!')} Please check your connection and try again.`;
      } else {
        errorMessage += `\n\n${EMOJIS.ERROR} Error: ${escapeHTML(apiError.message)}`;
      }

      errorMessage += `\n\n${bold(`${EMOJIS.CHART} You can try:`)}
• Wait a few seconds and retry
• Try a different asset/fiat pair
• Use <code>/help<code> for other commands`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, errorMessage, 'HTML');
      } else {
        await sendMessage(env, chatId, errorMessage, 'HTML');
      }
    }

  } catch (error) {
    console.error("P2P command error:", error);
    
    const errorMessage = `${EMOJIS.ERROR} ${bold('Command Processing Error')}

An unexpected error occurred while processing your P2P request.

${bold(`${EMOJIS.WAVE} Please try:`)}
• <code>/help<code> - View command help
• <code>/p2p USDT ETB BUY<code> - Try default request
• Contact support if this persists

${bold('Error details:')} ${escapeHTML(error.message)}`;

    await sendMessage(env, chatId, errorMessage, 'HTML');
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
      const noDataMessage = `${EMOJIS.ERROR} ${bold(`No ${tradeType} offers found`)}

No active ${tradeType.toLowerCase()} offers for ${bold(`${asset}/${fiat}`)} right now.

${bold(`${EMOJIS.REFRESH} Try different options:`)}`;
      
      const keyboard = createTradeTypeKeyboard('p2p', asset, fiat);
      await updateLoadingMessage(env, chatId, messageId, noDataMessage, 'HTML', keyboard);
      return;
    }

    // Format and update message
    const response = formatP2PResponse(newData, asset, fiat, tradeType, 5);
    const keyboard = createTradeTypeKeyboard('p2p', asset, fiat);
    const enhancedResponse = `${response}

${bold(`${EMOJIS.REFRESH} Quick Actions:`)}`;

    await updateLoadingMessage(env, chatId, messageId, enhancedResponse, 'HTML', keyboard);

  } catch (error) {
    console.error("P2P callback error:", error);
    
    await updateLoadingMessage(env, chatId, messageId, 
      `${EMOJIS.ERROR} Error updating P2P data. Please try the command again.`, 'HTML');
  }
}