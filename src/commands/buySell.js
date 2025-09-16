/**
 * Buy and Sell command handlers for P2P trading
 */

import { sendMessage, sendLoadingMessage, updateLoadingMessage } from '../api/telegram.js';
import { getP2PDataWithCache, getBestP2PRate } from '../api/binanceP2P.js';
import { validateAmount, validateP2PRate } from '../utils/validators.js';
import { formatNumber } from '../utils/formatters.js';
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
      const helpMessage = `${EMOJIS.ERROR} *Buy Command Help*

*${EMOJIS.MONEY} Format:*
\`/buy [amount] [asset] [fiat]\`

*📝 Examples:*
• \`/buy 100 USDT ETB\` \\- Buy 100 USDT with ETB
• \`/buy 0.01 BTC USD\` \\- Buy 0\\.01 BTC with USD
• \`/buy 500 USDT\` \\- Buy 500 USDT with ETB \\(default\\)

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
      await sendMessage(env, chatId, `${EMOJIS.ERROR} ${amountValidation.error}`, 'MarkdownV2');
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

      const buyMessage = `${EMOJIS.MONEY} *Buy ${amount} ${asset} with ${fiat}*

*💰 Cost Analysis:*
• *Best rate:* ${formatNumber(bestCost, 2)} ${fiat} \\(${formatNumber(bestRate, 2)} per ${asset}\\)
• *Conservative:* ${formatNumber(conservativeCost, 2)} ${fiat} \\(${formatNumber(conservativeRate, 2)} per ${asset}\\)
• *Average rate:* ${formatNumber(averageCost, 2)} ${fiat} \\(${formatNumber(averageRate, 2)} per ${asset}\\)

*🏆 Best Offer:*
👤 *Trader:* ${bestOffer.advertiser.nickName.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&')}
📊 *Available:* ${bestOffer.adv.surplusAmount} ${asset}
📈 *Limits:* ${bestOffer.adv.minSingleTransAmount} \\- ${bestOffer.adv.maxSingleTransAmount} ${fiat}
⭐ *Orders:* ${bestOffer.advertiser.monthOrderCount} \\(${(bestOffer.advertiser.monthFinishRate * 100).toFixed(1)}% success\\)`;

      // Add payment methods if available
      if (bestOffer.adv.tradeMethods?.length > 0) {
        const methods = bestOffer.adv.tradeMethods.map(m => m.tradeMethodName).join(", ");
        buyMessage += `\n🏦 *Methods:* ${methods}`;
      }

      const finalMessage = `${buyMessage}

${EMOJIS.CHART} *Market Insight:*
Price difference between best and 5th offer: ${formatNumber(((conservativeRate - bestRate) / bestRate) * 100, 1)}%

${EMOJIS.REFRESH} *Live data from Binance P2P*`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, finalMessage, 'MarkdownV2');
      } else {
        await sendMessage(env, chatId, finalMessage, 'MarkdownV2');
      }

    } catch (apiError) {
      console.error("Buy API error:", apiError);
      
      let errorMessage = `${EMOJIS.WARNING} *Could not fetch buying rates*

${apiError.message}

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
    await sendMessage(env, chatId, `${EMOJIS.ERROR} Error processing buy request: ${error.message}`, 'MarkdownV2');
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
      await sendMessage(env, chatId, `${EMOJIS.ERROR} ${amountValidation.error}`, 'MarkdownV2');
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

      const sellMessage = `${EMOJIS.MONEY} *Sell ${amount} ${asset} for ${fiat}*

*💰 Earnings Analysis:*
• *Best rate:* ${formatNumber(bestEarnings, 2)} ${fiat} \\(${formatNumber(bestRate, 2)} per ${asset}\\)
• *Conservative:* ${formatNumber(conservativeEarnings, 2)} ${fiat} \\(${formatNumber(conservativeRate, 2)} per ${asset}\\)  
• *Average rate:* ${formatNumber(averageEarnings, 2)} ${fiat} \\(${formatNumber(averageRate, 2)} per ${asset}\\)

*🏆 Best Offer:*
👤 *Trader:* ${bestOffer.advertiser.nickName.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&')}
📊 *Wants:* ${bestOffer.adv.surplusAmount} ${asset}
📈 *Limits:* ${bestOffer.adv.minSingleTransAmount} \\- ${bestOffer.adv.maxSingleTransAmount} ${fiat}
⭐ *Orders:* ${bestOffer.advertiser.monthOrderCount} \\(${(bestOffer.advertiser.monthFinishRate * 100).toFixed(1)}% success\\)`;

      // Add payment methods if available
      if (bestOffer.adv.tradeMethods?.length > 0) {
        const methods = bestOffer.adv.tradeMethods.map(m => m.tradeMethodName).join(", ");
        sellMessage += `\n🏦 *Methods:* ${methods}`;
      }

      const finalMessage = `${sellMessage}

${EMOJIS.CHART} *Market Insight:*
Price difference between best and 5th offer: ${formatNumber(((bestRate - conservativeRate) / bestRate) * 100, 1)}%

${EMOJIS.REFRESH} *Live data from Binance P2P*`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, finalMessage, 'MarkdownV2');
      } else {
        await sendMessage(env, chatId, finalMessage, 'MarkdownV2');
      }

    } catch (apiError) {
      console.error("Sell API error:", apiError);
      
      let errorMessage = `${EMOJIS.WARNING} *Could not fetch selling rates*

${apiError.message}

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
    await sendMessage(env, chatId, `${EMOJIS.ERROR} Error processing sell request: ${error.message}`, 'MarkdownV2');
  }
}