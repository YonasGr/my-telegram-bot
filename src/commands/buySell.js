/**
 * Buy and Sell command handlers for P2P trading
 */

import { sendMessage, sendLoadingMessage, updateLoadingMessage } from '../api/telegram.js';
import { getP2PDataWithCache } from '../api/binanceP2P.js';
import { validateAmount, validateP2PRate } from '../utils/validators.js';
import { safeFormatNumber, bold, escapeHTML } from '../utils/formatters.js';
import { EMOJIS } from '../config/constants.js';

export async function handleBuy(env, chatId, args) {
  try {
    const amount = args[1] ? parseFloat(args[1]) : null;
    const asset = (args[2] || 'USDT').toUpperCase();
    const fiat = (args[3] || 'ETB').toUpperCase();

    if (!amount) {
      await sendMessage(env, chatId, `${EMOJIS.ERROR} ${bold('Buy Command Help')}

${bold(`${EMOJIS.MONEY} Format:`)}
<code>/buy [amount] [asset] [fiat]</code>

${bold('Examples:')}
• <code>/buy 100 USDT ETB</code>
• <code>/buy 0.01 BTC USD</code>
• <code>/buy 500 USDT</code>

${bold('Notes:')} Default asset is USDT, default fiat is ETB.`, 'HTML');
      return;
    }

    const amountValidation = validateAmount(amount);
    if (!amountValidation.isValid) {
      await sendMessage(env, chatId, `${EMOJIS.ERROR} ${escapeHTML(amountValidation.error)}`, 'HTML');
      return;
    }

    const rateValidation = validateP2PRate(amount, asset, fiat);
    if (!rateValidation.isValid) {
      await sendMessage(env, chatId,
        `${EMOJIS.ERROR} ${bold('Buy Request Errors:')}\n\n${rateValidation.errors.map(e => `• ${escapeHTML(e)}`).join('\n')}`,
        'HTML');
      return;
    }

    const loadingMsg = await sendLoadingMessage(env, chatId,
      `${EMOJIS.LOADING} Finding best rates to buy ${amount} ${asset} with ${fiat}...`);

    try {
      const data = await getP2PDataWithCache(env, asset, fiat, 'SELL', 20, 1);

      if (!data?.data?.data || data.data.data.length === 0) {
        const msg = `${EMOJIS.ERROR} ${bold('No buying options available')}

No active offers to buy ${bold(asset)} with ${bold(fiat)} right now.
Try USDT (most liquid) or check again in a few minutes.`;
        if (loadingMsg?.result?.message_id) {
          await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, msg, 'HTML');
        } else {
          await sendMessage(env, chatId, msg, 'HTML');
        }
        return;
      }

      const offers = data.data.data.slice(0, 5);
      const bestOffer = offers[0];
      const worstOffer = offers[offers.length - 1];

      const bestRate = parseFloat(bestOffer.adv.price);
      const conservativeRate = parseFloat(worstOffer.adv.price);
      const averageRate = offers.reduce((s, o) => s + parseFloat(o.adv.price), 0) / offers.length;

      const spread = ((conservativeRate - bestRate) / bestRate) * 100;

      let buyMessage = `${EMOJIS.MONEY} ${bold(`Buy ${amount} ${asset} with ${fiat}`)}

<blockquote>${bold('Cost Analysis:')}
• ${bold('Best rate:')} ${safeFormatNumber(amount * bestRate, 2)} ${fiat} @ ${safeFormatNumber(bestRate, 2)}/${asset}
• ${bold('Average:')} ${safeFormatNumber(amount * averageRate, 2)} ${fiat} @ ${safeFormatNumber(averageRate, 2)}/${asset}
• ${bold('Conservative:')} ${safeFormatNumber(amount * conservativeRate, 2)} ${fiat} @ ${safeFormatNumber(conservativeRate, 2)}/${asset}</blockquote>

${bold('Best Offer:')}
👤 ${bold('Trader:')} ${escapeHTML(bestOffer.advertiser.nickName)}
📦 ${bold('Available:')} ${safeFormatNumber(bestOffer.adv.surplusAmount)} ${asset}
📏 ${bold('Limits:')} ${safeFormatNumber(bestOffer.adv.minSingleTransAmount)} – ${safeFormatNumber(bestOffer.adv.maxSingleTransAmount)} ${fiat}
⭐ ${bold('Orders:')} ${escapeHTML(String(bestOffer.advertiser.monthOrderCount))} (${safeFormatNumber(bestOffer.advertiser.monthFinishRate * 100, 1)}% success)`;

      if (bestOffer.adv.tradeMethods?.length > 0) {
        buyMessage += `\n🏦 ${bold('Methods:')} ${escapeHTML(bestOffer.adv.tradeMethods.map(m => m.tradeMethodName).join(', '))}`;
      }

      buyMessage += `\n\n${bold('Market Insight:')} Spread across top 5 offers: ${safeFormatNumber(spread, 1)}%

${EMOJIS.REFRESH} ${bold('Live data from Binance P2P')}`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, buyMessage, 'HTML');
      } else {
        await sendMessage(env, chatId, buyMessage, 'HTML');
      }

    } catch (apiError) {
      console.error('Buy API error:', apiError);
      const errorMessage = `${EMOJIS.WARNING} ${bold('Could not fetch buying rates')}

${escapeHTML(apiError.message)}

${bold('Try:')} <code>/p2p ${asset} ${fiat} SELL</code> for detailed view`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, errorMessage, 'HTML');
      } else {
        await sendMessage(env, chatId, errorMessage, 'HTML');
      }
    }
  } catch (error) {
    console.error('Buy command error:', error);
    await sendMessage(env, chatId, `${EMOJIS.ERROR} Error processing buy request: ${escapeHTML(error.message)}`, 'HTML');
  }
}

export async function handleSell(env, chatId, args) {
  try {
    const amount = args[1] ? parseFloat(args[1]) : null;
    const asset = (args[2] || 'USDT').toUpperCase();
    const fiat = (args[3] || 'ETB').toUpperCase();

    if (!amount) {
      await sendMessage(env, chatId, `${EMOJIS.ERROR} ${bold('Sell Command Help')}

${bold(`${EMOJIS.MONEY} Format:`)}
<code>/sell [amount] [asset] [fiat]</code>

${bold('Examples:')}
• <code>/sell 100 USDT ETB</code>
• <code>/sell 0.01 BTC USD</code>
• <code>/sell 50</code>

${bold('Notes:')} Default asset is USDT, default fiat is ETB.`, 'HTML');
      return;
    }

    const amountValidation = validateAmount(amount);
    if (!amountValidation.isValid) {
      await sendMessage(env, chatId, `${EMOJIS.ERROR} ${escapeHTML(amountValidation.error)}`, 'HTML');
      return;
    }

    const rateValidation = validateP2PRate(amount, asset, fiat);
    if (!rateValidation.isValid) {
      await sendMessage(env, chatId,
        `${EMOJIS.ERROR} ${bold('Sell Request Errors:')}\n\n${rateValidation.errors.map(e => `• ${escapeHTML(e)}`).join('\n')}`,
        'HTML');
      return;
    }

    const loadingMsg = await sendLoadingMessage(env, chatId,
      `${EMOJIS.LOADING} Finding best rates to sell ${amount} ${asset} for ${fiat}...`);

    try {
      const data = await getP2PDataWithCache(env, asset, fiat, 'BUY', 20, 1);

      if (!data?.data?.data || data.data.data.length === 0) {
        const msg = `${EMOJIS.ERROR} ${bold('No selling options available')}

No active offers to sell ${bold(asset)} for ${bold(fiat)} right now.
Try USDT (most liquid) or check again in a few minutes.`;
        if (loadingMsg?.result?.message_id) {
          await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, msg, 'HTML');
        } else {
          await sendMessage(env, chatId, msg, 'HTML');
        }
        return;
      }

      const offers = data.data.data.slice(0, 5);
      const bestOffer = offers[0];
      const worstOffer = offers[offers.length - 1];

      const bestRate = parseFloat(bestOffer.adv.price);
      const conservativeRate = parseFloat(worstOffer.adv.price);
      const averageRate = offers.reduce((s, o) => s + parseFloat(o.adv.price), 0) / offers.length;

      const spread = ((bestRate - conservativeRate) / bestRate) * 100;

      let sellMessage = `${EMOJIS.MONEY} ${bold(`Sell ${amount} ${asset} for ${fiat}`)}

<blockquote>${bold('Earnings Analysis:')}
• ${bold('Best rate:')} ${safeFormatNumber(amount * bestRate, 2)} ${fiat} @ ${safeFormatNumber(bestRate, 2)}/${asset}
• ${bold('Average:')} ${safeFormatNumber(amount * averageRate, 2)} ${fiat} @ ${safeFormatNumber(averageRate, 2)}/${asset}
• ${bold('Conservative:')} ${safeFormatNumber(amount * conservativeRate, 2)} ${fiat} @ ${safeFormatNumber(conservativeRate, 2)}/${asset}</blockquote>

${bold('Best Offer:')}
👤 ${bold('Trader:')} ${escapeHTML(bestOffer.advertiser.nickName)}
📦 ${bold('Wants:')} ${safeFormatNumber(bestOffer.adv.surplusAmount)} ${asset}
📏 ${bold('Limits:')} ${safeFormatNumber(bestOffer.adv.minSingleTransAmount)} – ${safeFormatNumber(bestOffer.adv.maxSingleTransAmount)} ${fiat}
⭐ ${bold('Orders:')} ${escapeHTML(String(bestOffer.advertiser.monthOrderCount))} (${safeFormatNumber(bestOffer.advertiser.monthFinishRate * 100, 1)}% success)`;

      if (bestOffer.adv.tradeMethods?.length > 0) {
        sellMessage += `\n🏦 ${bold('Methods:')} ${escapeHTML(bestOffer.adv.tradeMethods.map(m => m.tradeMethodName).join(', '))}`;
      }

      sellMessage += `\n\n${bold('Market Insight:')} Spread across top 5 offers: ${safeFormatNumber(spread, 1)}%

${EMOJIS.REFRESH} ${bold('Live data from Binance P2P')}`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, sellMessage, 'HTML');
      } else {
        await sendMessage(env, chatId, sellMessage, 'HTML');
      }

    } catch (apiError) {
      console.error('Sell API error:', apiError);
      const errorMessage = `${EMOJIS.WARNING} ${bold('Could not fetch selling rates')}

${escapeHTML(apiError.message)}

${bold('Try:')} <code>/p2p ${asset} ${fiat} BUY</code> for detailed view`;

      if (loadingMsg?.result?.message_id) {
        await updateLoadingMessage(env, chatId, loadingMsg.result.message_id, errorMessage, 'HTML');
      } else {
        await sendMessage(env, chatId, errorMessage, 'HTML');
      }
    }
  } catch (error) {
    console.error('Sell command error:', error);
    await sendMessage(env, chatId, `${EMOJIS.ERROR} Error processing sell request: ${escapeHTML(error.message)}`, 'HTML');
  }
}
