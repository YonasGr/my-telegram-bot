/**
 * Start and Help command handlers
 */

import { sendMessage, createQuickActionsKeyboard } from '../api/telegram.js';
import { bold, escapeHTML } from '../utils/formatters.js';
import { EMOJIS, COMMANDS } from '../config/constants.js';

export async function handleStart(env, chatId, command = '/start') {
  const welcomeMessage = `${EMOJIS.WAVE} ${bold('Welcome to Crypto Bot!')}

Real-time crypto data, P2P trading rates, and currency conversions.

${bold('Commands:')}

• <code>/coin [symbol]</code> — Market info with interactive charts
• <code>/rate [amount] [from] [to]</code> — Convert with live rates
• <code>/p2p [asset] [fiat] [type]</code> — Binance P2P rates
• <code>/buy [amount] [asset] [fiat]</code> — Best rates to buy crypto
• <code>/sell [amount] [asset] [fiat]</code> — Best rates to sell crypto
• <code>/convert [amount] [from] [to]</code> — Any-to-any conversion

${bold('Examples:')}
• <code>/coin bitcoin</code>
• <code>/p2p USDT ETB BUY</code>
• <code>/buy 100 USDT ETB</code>
• <code>/convert 50 USDT ETB</code>

${bold('Tips:')}
• Charts support 1d / 7d / 30d timeframes via inline buttons
• ETB conversions use live Binance P2P data
• All data is cached for fast responses

👨‍💻 ${bold('Author:')} @x_Jonah  ·  📢 ${bold('Channel:')} @Jonah_Notice`;

  await sendMessage(env, chatId, welcomeMessage, 'HTML', createQuickActionsKeyboard());
}

export async function handleUnknownCommand(env, chatId, command) {
  const errorMessage = `${EMOJIS.ERROR} Unknown command: <code>${escapeHTML(command)}</code>

Use <code>/help</code> to see all available commands.

${bold('Did you mean:')}
• <code>/coin</code> — Cryptocurrency info
• <code>/p2p</code> — P2P trading rates
• <code>/convert</code> — Currency conversion
• <code>/buy</code> or <code>/sell</code> — P2P trading`;

  await sendMessage(env, chatId, errorMessage, 'HTML');
}

export async function handleQuickAction(env, callbackQuery) {
  const { data, message } = callbackQuery;
  const chatId = message.chat.id;

  const quickActionMessages = {
    'quick_p2p': `${EMOJIS.MONEY} ${bold('P2P Rates')}

<code>/p2p [asset] [fiat] [type]</code>

${bold('Examples:')}
• <code>/p2p</code> — Default USDT/ETB BUY
• <code>/p2p USDT ETB SELL</code>
• <code>/p2p BTC USD BUY</code>

${bold('Assets:')} USDT, BTC, ETH, BNB, BUSD
${bold('Fiats:')} ETB, USD, EUR, GBP, NGN, KES, GHS`,

    'quick_top': `${EMOJIS.TROPHY} ${bold('Coin Info')}

<code>/coin [symbol]</code>

${bold('Examples:')}
• <code>/coin bitcoin</code>
• <code>/coin ethereum</code>
• <code>/coin cardano</code>

${bold('Features:')} Live price, 24h change, market cap, interactive charts (1d/7d/30d)`,

    'quick_convert': `${EMOJIS.EXCHANGE} ${bold('Currency Conversion')}

<code>/convert [amount] [from] [to]</code>
<code>/rate [amount] [currency] [vs]</code>

${bold('Examples:')}
• <code>/convert 100 ETH ADA</code>
• <code>/convert 1000 ETB USDT</code>
• <code>/rate 1 BTC USD</code>

ETB rates use live P2P data.`,

    'quick_trending': `${EMOJIS.CHART} ${bold('Coming Soon')}

Trending coins, price alerts, and portfolio tracking are on the roadmap.

${bold('Available now:')}
• <code>/coin [symbol]</code> — Live charts
• <code>/p2p</code> — P2P rate comparisons
• <code>/convert</code> — Real-time conversions`,
  };

  const responseMessage = quickActionMessages[data] || `${EMOJIS.ERROR} Unknown action.`;
  await sendMessage(env, chatId, responseMessage, 'HTML');
}
