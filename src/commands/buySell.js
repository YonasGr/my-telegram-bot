/**
 * Buy and Sell command handlers for P2P trading
 */

import { sendMessage, sendLoadingMessage, updateLoadingMessage } from '../api/telegram.js';
import { getP2PDataWithCache, getBestP2PRate } from '../api/binanceP2P.js';
import { validateAmount, validateP2PRate } from '../utils/validators.js';
import { safeFormatNumber, bold, escapeMarkdownV2, formatNumber } from '../utils/formatters.js';
import { EMOJIS } from '../config/constants.js';

/**
 * Handles /buy command for finding best crypto buying rates
 * @param {object} env - Cloudflare environment
 * @param {string|number} chatId - Chat ID
 * @param {string[]} args - Command arguments [amount, asset, fiat]
 * @returns {Promise<void>}
 */
export async function handleBuy(env, chatId, args) {
  try {
    // Default values
    const amount = args[1] ? parseFloat(args[1]) : null;
    const asset = (args[2] || 'USDT').toUpperCase();
    const fiat = (args[3] || 'ETB').toUpperCase();

    // Validate arguments
    if (!amount) {
      const helpMessage = `${EMOJIS.ERROR} ${bold('Buy Command Help')}

${bold(`${EMOJIS.MONEY} Format:`)}
\`/buy [amount] [asset] [fiat]\`

${bold('📝 Examples:')}
• \`/buy 100 USDT ETB\` \\- Buy 100 USDT with ETB
• \`/buy 0.01 BTC USD\` \\- Buy 0\\.01 BTC with USD
• \`/buy 500 USDT\` \\- Buy 500 USDT with ETB \\(default\\)

${bold('💡 Notes:')}
• Amount is required
• Default asset: USDT
• Default fiat: ETB
• Uses live Binance P2P rates`;

      await sendMessage(env, chatId, helpMessage, 'MarkdownV2');
      return;
    }

    const amountValidation = validateAmount(amount);
    if (!amountValidation.isValid) {
      await sendMessage(env, chatId, `${EMOJIS.ERROR} ${escapeMarkdownV2(amountValidation.error)}`, 'MarkdownV2');
      return;
    }

    const rateValidation = validateP2PRate(amount, asset, fiat);
    if (!rateValidation.isValid) {
      const errorMessage = `${EMOJIS.ERROR} *Buy Request Errors:*

${rateValidation.errors.map(err => `• ${err}`).join('\n')}

*${EMOJIS.CHART} Supported:*
• *Assets:* USDT, BTC, ETH, BNB, BUSD  
• *Fiats:* ETB, USD, EUR, GBP, NGN, KES, GHS`;

      await sendMessage(env, chatId, errorMessage, 'MarkdownV2');
      return;
    }

    // Send loading message
    const loadingMsg = await sendLoadingMessage(env, chatId, 
      `${EMOJIS.LOADING} Finding best rates to buy ${amount} ${asset} with ${fiat}...`);

    try {
      // Get P2P data for buying (user wants to buy crypto, so they look at SELL offers from traders)
      const data = await getP2PDataWithCache(env, asset, fiat, 'SELL', 20, 1);

      if (!data?.data?.data || data.data.data.length === 0) {
        const noDataMessage = `${EMOJIS.ERROR} *No buying options available*

No active offers to buy *${asset}* with *${fiat}* right now\\.

*${EMOJIS.CHART} Try:*
• Different asset \\(USDT is most liquid\\)
• Popular fiat pairs \\(ETB, USD\\)
• Check again in a few minutes`;

        if (loadingMsg?.result?.message_id) {
          await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, noDataMessage, 'MarkdownV2');
        } else {
          await sendMessage(env, chatId, noDataMessage, 'MarkdownV2');
        }
        return;
      }

      // Find best rates and calculate costs
      const offers = data.data.data.slice(0, 5);
      const bestOffer = offers[0];
      const fifthBestOffer = offers[4] || offers[offers.length - 1];
      
      const bestRate = parseFloat(bestOffer.adv.price);
      const conservativeRate = parseFloat(fifthBestOffer.adv.price);
      const averageRate = offers.reduce((sum, offer) => sum + parseFloat(offer.adv.price), 0) / offers.length;
      
      const bestCost = amount * bestRate;
      const conservativeCost = amount * conservativeRate;
      const averageCost = amount * averageRate;

      let buyMessage = `${EMOJIS.MONEY} *Buy ${amount} ${asset} with ${fiat}*

*💰 Cost Analysis:*
• *Best rate:* ${safeFormatNumber(bestCost, 2)} ${fiat} \\(${safeFormatNumber(bestRate, 2)} per ${asset}\\)
• *Conservative:* ${safeFormatNumber(conservativeCost, 2)} ${fiat} \\(${safeFormatNumber(conservativeRate, 2)} per ${asset}\\)
• *Average rate:* ${safeFormatNumber(averageCost, 2)} ${fiat} \\(${safeFormatNumber(averageRate, 2)} per ${asset}\\)

*🏆 Best Offer:*
👤 *Trader:* ${escapeMarkdownV2(bestOffer.advertiser.nickName)}
📊 *Available:* ${safeFormatNumber(bestOffer.adv.surplusAmount)} ${asset}
📈 *Limits:* ${safeFormatNumber(bestOffer.adv.minSingleTransAmount)} \\- ${safeFormatNumber(bestOffer.adv.maxSingleTransAmount)} ${fiat}
⭐ *Orders:* ${escapeMarkdownV2(bestOffer.advertiser.monthOrderCount.toString())} \\(${safeFormatNumber(bestOffer.advertiser.monthFinishRate * 100, 1)}% success\\)`;

      // Add payment methods if available
      if (bestOffer.adv.tradeMethods?.length > 0) {
        const methods = bestOffer.adv.tradeMethods.map(m => m.tradeMethodName).join(", ");
        buyMessage += `\n🏦 *Methods:* ${methods}`;
      }

      const finalMessage = `${buyMessage}

${EMOJIS.CHART} *Market Insight:*
Price difference between best and 5th offer: ${safeFormatNumber(((conservativeRate - bestRate) / bestRate) * 100, 1)}%

${EMOJIS.REFRESH} *Live data from Binance P2P*`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, finalMessage, 'MarkdownV2');
      } else {
        await sendMessage(env, chatId, finalMessage, 'MarkdownV2');
      }

    } catch (apiError) {
      console.error("Buy API error:", apiError);
      
      let errorMessage = `${EMOJIS.WARNING} *Could not fetch buying rates*

${escapeMarkdownV2(apiError.message)}`;

      if (apiError.message.includes('rate limit')) {
        errorMessage = `${EMOJIS.WARNING} *Service Rate Limited*

⚠️ P2P service rate limit exceeded\\. Please try again in a minute\\.

${bold('Rate limits help:')}
• Keep service fast and reliable
• Prevent system overload  
• Ensure fair access for all users`;
      }

      errorMessage += `

*${EMOJIS.CHART} Suggestions:*
• Wait a moment and try again
• Try \`/p2p ${asset} ${fiat} SELL\` for detailed view
• Use popular pairs like USDT/ETB`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, errorMessage, 'MarkdownV2');
      } else {
        await sendMessage(env, chatId, errorMessage, 'MarkdownV2');
      }
    }

  } catch (error) {
    console.error("Buy command error:", error);
    await sendMessage(env, chatId, `${EMOJIS.ERROR} Error processing buy request: ${escapeMarkdownV2(error.message)}`, 'MarkdownV2');
  }
}

/**
 * Handles /sell command for finding best crypto selling rates  
 * @param {object} env - Cloudflare environment
 * @param {string|number} chatId - Chat ID
 * @param {string[]} args - Command arguments [amount, asset, fiat]
 * @returns {Promise<void>}
 */
export async function handleSell(env, chatId, args) {
  try {
    // Parse arguments - handle both old format (/sell 50) and new format (/sell 50 USDT ETB)
    const amount = args[1] ? parseFloat(args[1]) : null;
    const asset = (args[2] || 'USDT').toUpperCase();
    const fiat = (args[3] || 'ETB').toUpperCase();

    // Validate arguments
    if (!amount) {
      const helpMessage = `${EMOJIS.ERROR} *Sell Command Help*

*${EMOJIS.MONEY} Format:*
\`/sell [amount] [asset] [fiat]\`

*📝 Examples:*
• \`/sell 100 USDT ETB\` \\- Sell 100 USDT for ETB
• \`/sell 0.01 BTC USD\` \\- Sell 0\\.01 BTC for USD  
• \`/sell 50\` \\- Sell 50 USDT for ETB \\(legacy format\\)

*💡 Notes:*
• Amount is required
• Default asset: USDT
• Default fiat: ETB
• Uses live Binance P2P rates`;

      await sendMessage(env, chatId, helpMessage, 'MarkdownV2');
      return;
    }

    const amountValidation = validateAmount(amount);
    if (!amountValidation.isValid) {
      await sendMessage(env, chatId, `${EMOJIS.ERROR} ${escapeMarkdownV2(amountValidation.error)}`, 'MarkdownV2');
      return;
    }

    const rateValidation = validateP2PRate(amount, asset, fiat);
    if (!rateValidation.isValid) {
      const errorMessage = `${EMOJIS.ERROR} *Sell Request Errors:*

${rateValidation.errors.map(err => `• ${err}`).join('\n')}

*${EMOJIS.CHART} Supported:*
• *Assets:* USDT, BTC, ETH, BNB, BUSD
• *Fiats:* ETB, USD, EUR, GBP, NGN, KES, GHS`;

      await sendMessage(env, chatId, errorMessage, 'MarkdownV2');
      return;
    }

    // Send loading message
    const loadingMsg = await sendLoadingMessage(env, chatId, 
      `${EMOJIS.LOADING} Finding best rates to sell ${amount} ${asset} for ${fiat}...`);

    try {
      // Get P2P data for selling (user wants to sell crypto, so they look at BUY offers from traders)
      const data = await getP2PDataWithCache(env, asset, fiat, 'BUY', 20, 1);

      if (!data?.data?.data || data.data.data.length === 0) {
        const noDataMessage = `${EMOJIS.ERROR} *No selling options available*

No active offers to sell *${asset}* for *${fiat}* right now\\.

*${EMOJIS.CHART} Try:*
• Different asset \\(USDT is most liquid\\)
• Popular fiat pairs \\(ETB, USD\\)
• Check again in a few minutes`;

        if (loadingMsg?.result?.message_id) {
          await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, noDataMessage, 'MarkdownV2');
        } else {
          await sendMessage(env, chatId, noDataMessage, 'MarkdownV2');
        }
        return;
      }

      // Calculate earnings based on different offers
      const offers = data.data.data.slice(0, 5);
      const bestOffer = offers[0];
      const fifthBestOffer = offers[4] || offers[offers.length - 1];
      
      const bestRate = parseFloat(bestOffer.adv.price);
      const conservativeRate = parseFloat(fifthBestOffer.adv.price); 
      const averageRate = offers.reduce((sum, offer) => sum + parseFloat(offer.adv.price), 0) / offers.length;
      
      const bestEarnings = amount * bestRate;
      const conservativeEarnings = amount * conservativeRate;
      const averageEarnings = amount * averageRate;

      let sellMessage = `${EMOJIS.MONEY} *Sell ${amount} ${asset} for ${fiat}*

*💰 Earnings Analysis:*
• *Best rate:* ${safeFormatNumber(bestEarnings, 2)} ${fiat} \\(${safeFormatNumber(bestRate, 2)} per ${asset}\\)
• *Conservative:* ${safeFormatNumber(conservativeEarnings, 2)} ${fiat} \\(${safeFormatNumber(conservativeRate, 2)} per ${asset}\\)  
• *Average rate:* ${safeFormatNumber(averageEarnings, 2)} ${fiat} \\(${safeFormatNumber(averageRate, 2)} per ${asset}\\)

*🏆 Best Offer:*
👤 *Trader:* ${escapeMarkdownV2(bestOffer.advertiser.nickName)}
📊 *Wants:* ${safeFormatNumber(bestOffer.adv.surplusAmount)} ${asset}
📈 *Limits:* ${safeFormatNumber(bestOffer.adv.minSingleTransAmount)} \\- ${safeFormatNumber(bestOffer.adv.maxSingleTransAmount)} ${fiat}
⭐ *Orders:* ${escapeMarkdownV2(bestOffer.advertiser.monthOrderCount.toString())} \\(${safeFormatNumber(bestOffer.advertiser.monthFinishRate * 100, 1)}% success\\)`;

      // Add payment methods if available
      if (bestOffer.adv.tradeMethods?.length > 0) {
        const methods = bestOffer.adv.tradeMethods.map(m => m.tradeMethodName).join(", ");
        sellMessage += `\n🏦 *Methods:* ${methods}`;
      }

      const finalMessage = `${sellMessage}

${EMOJIS.CHART} *Market Insight:*
Price difference between best and 5th offer: ${safeFormatNumber(((bestRate - conservativeRate) / bestRate) * 100, 1)}%

${EMOJIS.REFRESH} *Live data from Binance P2P*`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, finalMessage, 'MarkdownV2');
      } else {
        await sendMessage(env, chatId, finalMessage, 'MarkdownV2');
      }

    } catch (apiError) {
      console.error("Sell API error:", apiError);
      
      let errorMessage = `${EMOJIS.WARNING} *Could not fetch selling rates*

${escapeMarkdownV2(apiError.message)}`;

      if (apiError.message.includes('rate limit')) {
        errorMessage = `${EMOJIS.WARNING} *Service Rate Limited*

⚠️ P2P service rate limit exceeded\\. Please try again in a minute\\.

${bold('Rate limits help:')}
• Keep service fast and reliable
• Prevent system overload
• Ensure fair access for all users`;
      }

      errorMessage += `

*${EMOJIS.CHART} Suggestions:*
• Wait a moment and try again
• Try \`/p2p ${asset} ${fiat} BUY\` for detailed view  
• Use popular pairs like USDT/ETB`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, errorMessage, 'MarkdownV2');
      } else {
        await sendMessage(env, chatId, errorMessage, 'MarkdownV2');
      }
    }

  } catch (error) {
    console.error("Sell command error:", error);
    await sendMessage(env, chatId, `${EMOJIS.ERROR} Error processing sell request: ${escapeMarkdownV2(error.message)}`, 'MarkdownV2');
  }
}