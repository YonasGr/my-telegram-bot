/**
 * Start and Help command handlers
 */

import { sendMessage, createQuickActionsKeyboard } from '../api/telegram.js';
import { bold, escapeMarkdownV2 } from '../utils/formatters.js';
import { EMOJIS, COMMANDS } from '../config/constants.js';

/**
 * Handles /start and /help commands
 * @param {object} env - Cloudflare environment
 * @param {string|number} chatId - Chat ID
 * @param {string} command - The command that was used
 * @returns {Promise<void>}
 */
export async function handleStart(env, chatId, command = '/start') {
  const isHelp = command === '/help';
  
  const welcomeMessage = `${EMOJIS.WAVE} ${bold('Welcome to Crypto Bot!')}

I provide real\\-time cryptocurrency data, P2P trading rates, and conversions\\.

${bold('🔧 Available Commands:')}

${bold('Basic Commands:')}
• \`/start\` or \`/help\` \\- Show this help message
• \`/coin [symbol]\` \\- Get detailed market info with interactive charts
• \`/rate [amount] [currency] [vs_currency]\` \\- Convert currencies with live rates

${bold('P2P Trading:')}
• \`/p2p [asset] [fiat] [type]\` \\- Get Binance P2P rates
• \`/buy [amount] [asset] [fiat]\` \\- Find best rates to buy crypto with fiat
• \`/sell [amount] [asset] [fiat]\` \\- Find best rates to sell crypto for fiat

${bold('Currency Conversion:')}
• \`/convert [amount] [from] [to]\` \\- Convert between any currencies

${bold('📝 Examples:')}
• \`/coin bitcoin\` \\- Get Bitcoin info with interactive charts
• \`/p2p USDT ETB BUY\` \\- Get USDT buying rates in ETB
• \`/buy 100 USDT ETB\` \\- Find best rates to buy 100 USDT with ETB
• \`/sell 50 USDT ETB\` \\- Calculate ETB for selling 50 USDT
• \`/rate 100 BTC USD\` \\- Convert 100 BTC to USD
• \`/convert 1 ETH ADA\` \\- Convert 1 ETH to ADA

${bold('💡 Pro Tips:')}
• Use inline buttons for quick actions and timeframe selection
• Charts support 1 day, 7 days, and 30 days timeframes
• All data is cached for optimal performance
• Rate limiting prevents abuse

${bold('🚀 Quick Actions:')}
Use the buttons below for common actions\\!

${isHelp ? '❓' : '👨‍💻'} ${bold('Author:')} @x_Jonah 
📢 ${bold('Channel:')} @Jonah_Notice`;

  const keyboard = createQuickActionsKeyboard();
  
  await sendMessage(env, chatId, welcomeMessage, 'MarkdownV2', keyboard);
}

/**
 * Handles unknown commands
 * @param {object} env - Cloudflare environment
 * @param {string|number} chatId - Chat ID
 * @param {string} command - The unknown command
 * @returns {Promise<void>}
 */
export async function handleUnknownCommand(env, chatId, command) {
  const errorMessage = `${EMOJIS.ERROR} Unknown command: \`${escapeMarkdownV2(command)}\`

${EMOJIS.WAVE} Use \`/help\` to see all available commands\\.

${bold('🔧 Did you mean:')}
• \`/coin\` \\- Get cryptocurrency information
• \`/p2p\` \\- Get P2P trading rates  
• \`/convert\` \\- Convert between currencies
• \`/buy\` or \`/sell\` \\- P2P trading rates

${bold('💡 Tip:')} Make sure to include required parameters\\. For example:
• \`/coin bitcoin\`
• \`/p2p USDT ETB BUY\``;

  await sendMessage(env, chatId, errorMessage, 'MarkdownV2');
}

/**
 * Handles callback queries for quick actions
 * @param {object} env - Cloudflare environment
 * @param {object} callbackQuery - Telegram callback query object
 * @returns {Promise<void>}
 */
export async function handleQuickAction(env, callbackQuery) {
  const { data, message } = callbackQuery;
  const chatId = message.chat.id;
  
  const quickActionMessages = {
    'quick_p2p': `${EMOJIS.MONEY} ${bold('P2P Quick Guide')}

Get real\\-time Binance P2P rates:

${bold('Command format:')}
\`/p2p [asset] [fiat] [type]\`

${bold('Examples:')}
• \`/p2p\` \\- Default USDT/ETB BUY rates
• \`/p2p USDT ETB SELL\` \\- Selling rates
• \`/p2p BTC USD BUY\` \\- Bitcoin buying rates

${bold('Supported assets:')} USDT, BTC, ETH, BNB, BUSD
${bold('Supported fiats:')} ETB, USD, EUR, GBP, NGN, KES, GHS`,

    'quick_top': `${EMOJIS.TROPHY} ${bold('Top Coins Info')}

Get detailed info about popular cryptocurrencies:

${bold('Examples:')}
• \`/coin bitcoin\` \\- Bitcoin with interactive charts
• \`/coin ethereum\` \\- Ethereum market data
• \`/coin cardano\` \\- ADA information

${bold('Features:')}
• Live price and 24h change
• Market cap and trading volume  
• Interactive charts \\(1d/7d/30d\\)
• Direct links to more info`,

    'quick_convert': `${EMOJIS.EXCHANGE} ${bold('Currency Conversion')}

Convert between any cryptocurrencies or fiat:

${bold('Command formats:')}
• \`/convert [amount] [from] [to]\`
• \`/rate [amount] [currency] [vs_currency]\`

${bold('Examples:')}
• \`/convert 100 ETH ADA\` \\- Crypto to crypto
• \`/convert 1000 ETB USDT\` \\- Fiat to crypto
• \`/rate 1 BTC USD\` \\- Get current rate

${bold('Special:')} ETB rates use live P2P data\\!`,

    'quick_trending': `${EMOJIS.CHART} ${bold('Trending & Analysis')}

${bold('Coming Soon:')}
• Trending cryptocurrencies
• Market sentiment analysis
• Price alerts and notifications
• Portfolio tracking

${bold('Current Features:')}
• Live price charts with multiple timeframes
• P2P rate comparisons
• Real\\-time market data
• Comprehensive coin information`
  };

  const responseMessage = quickActionMessages[data] || 'Unknown quick action';
  await sendMessage(env, chatId, responseMessage, 'MarkdownV2');
}