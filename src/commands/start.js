/**
 * Start and Help command handlers
 */

import { sendMessage, createQuickActionsKeyboard } from '../api/telegram.js';
import { bold, escapeHTML } from '../utils/formatters.js';
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

I provide real-time cryptocurrency data, P2P trading rates, and conversions.

${bold('🔧 Available Commands:')}

${bold('Basic Commands:')}
• <code>/start</code> or <code>/help</code> - Show this help message
• <code>/coin [symbol]</code> - Get detailed market info with interactive charts
• <code>/rate [amount] [currency] [vs_currency]</code> - Convert currencies with live rates

${bold('P2P Trading:')}
• <code>/p2p [asset] [fiat] [type]</code> - Get Binance P2P rates
• <code>/buy [amount] [asset] [fiat]</code> - Find best rates to buy crypto with fiat
• <code>/sell [amount] [asset] [fiat]</code> - Find best rates to sell crypto for fiat

${bold('Currency Conversion:')}
• <code>/convert [amount] [from] [to]</code> - Convert between any currencies

${bold('📝 Examples:')}
• <code>/coin bitcoin</code> - Get Bitcoin info with interactive charts
• <code>/p2p USDT ETB BUY</code> - Get USDT buying rates in ETB
• <code>/buy 100 USDT ETB</code> - Find best rates to buy 100 USDT with ETB
• <code>/sell 50 USDT ETB</code> - Calculate ETB for selling 50 USDT
• <code>/rate 100 BTC USD</code> - Convert 100 BTC to USD
• <code>/convert 1 ETH ADA</code> - Convert 1 ETH to ADA

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
  
  await sendMessage(env, chatId, welcomeMessage, 'HTML', keyboard);
}

/**
 * Handles unknown commands
 * @param {object} env - Cloudflare environment
 * @param {string|number} chatId - Chat ID
 * @param {string} command - The unknown command
 * @returns {Promise<void>}
 */
export async function handleUnknownCommand(env, chatId, command) {
  const errorMessage = `${EMOJIS.ERROR} Unknown command: <code>${escapeHTML(command)}</code>

${EMOJIS.WAVE} Use <code>/help</code> to see all available commands.

${bold('🔧 Did you mean:')}
• <code>/coin</code> - Get cryptocurrency information
• <code>/p2p</code> - Get P2P trading rates  
• <code>/convert</code> - Convert between currencies
• <code>/buy</code> or <code>/sell</code> - P2P trading rates

${bold('💡 Tip:')} Make sure to include required parameters. For example:
• <code>/coin bitcoin</code>
• <code>/p2p USDT ETB BUY</code>`;

  await sendMessage(env, chatId, errorMessage, 'HTML');
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

Get real-time Binance P2P rates:

${bold('Command format:')}
<code>/p2p [asset] [fiat] [type]</code>

${bold('Examples:')}
• <code>/p2p</code> - Default USDT/ETB BUY rates
• <code>/p2p USDT ETB SELL</code> - Selling rates
• <code>/p2p BTC USD BUY</code> - Bitcoin buying rates

${bold('Supported assets:')} USDT, BTC, ETH, BNB, BUSD
${bold('Supported fiats:')} ETB, USD, EUR, GBP, NGN, KES, GHS`,

    'quick_top': `${EMOJIS.TROPHY} ${bold('Top Coins Info')}

Get detailed info about popular cryptocurrencies:

${bold('Examples:')}
• <code>/coin bitcoin</code> - Bitcoin with interactive charts
• <code>/coin ethereum</code> - Ethereum market data
• <code>/coin cardano</code> - ADA information

${bold('Features:')}
• Live price and 24h change
• Market cap and trading volume  
• Interactive charts (1d/7d/30d)
• Direct links to more info`,

    'quick_convert': `${EMOJIS.EXCHANGE} ${bold('Currency Conversion')}

Convert between any cryptocurrencies or fiat:

${bold('Command formats:')}
• <code>/convert [amount] [from] [to]</code>
• <code>/rate [amount] [currency] [vs_currency]</code>

${bold('Examples:')}
• <code>/convert 100 ETH ADA</code> - Crypto to crypto
• <code>/convert 1000 ETB USDT</code> - Fiat to crypto
• <code>/rate 1 BTC USD</code> - Get current rate

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
• Real-time market data
• Comprehensive coin information`
  };

  const responseMessage = quickActionMessages[data] || 'Unknown quick action';
  await sendMessage(env, chatId, responseMessage, 'HTML');
}