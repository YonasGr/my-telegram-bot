/**
 * Modern Telegram Crypto Bot - Main Cloudflare Worker
 * 
 * A modular, secure, and performant Telegram bot for cryptocurrency data,
 * P2P trading rates, and currency conversions.
 */

// Import utilities and configuration
import { checkRateLimit } from './cache/rateLimiting.js';
import { sendMessage, answerCallbackQuery } from './api/telegram.js';
import { sanitizeInput } from './utils/validators.js';
import { bold } from './utils/formatters.js';
import { EMOJIS, API_URLS } from './config/constants.js';

// Import command handlers
import { handleStart, handleUnknownCommand, handleQuickAction } from './commands/start.js';
import { handleP2P, handleP2PCallback } from './commands/p2p.js';
import { handleBuy, handleSell } from './commands/buySell.js';
import { handleCoin, handleCoinCallback } from './commands/coin.js';
import { handleRate, handleConvert } from './commands/rateConvert.js';

/**
 * Main request handler for the Cloudflare Worker
 */
export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Handle Binance P2P proxy endpoint for backward compatibility
    if (request.method === 'POST' && path === '/binancep2p') {
      return handleBinanceP2PProxy(request, env);
    }

    // Only accept POST requests for Telegram webhook
    if (request.method !== 'POST') {
      return new Response('Method not allowed. This endpoint accepts only POST requests for Telegram webhooks.', { 
        status: 405,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    try {
      // Parse incoming webhook data
      const body = await request.json();
      console.log('Received webhook:', JSON.stringify(body, null, 2));

      // Handle callback queries (inline keyboard buttons)
      if (body.callback_query) {
        await handleCallbackQuery(env, body.callback_query);
        return new Response('ok');
      }

      // Extract message data
      const message = body.message;
      if (!message) {
        console.log('No message in webhook body');
        return new Response('ok');
      }

      const chatId = message.chat?.id;
      const text = message.text;
      const userId = message.from?.id;
      const userName = message.from?.username || message.from?.first_name || 'Unknown';

      // Validate required fields
      if (!chatId || !text || !userId) {
        console.log('Missing required fields:', { chatId, text: !!text, userId });
        return new Response('ok');
      }

      // Sanitize input
      const sanitizedText = sanitizeInput(text);
      if (sanitizedText !== text) {
        console.log('Input was sanitized:', { original: text, sanitized: sanitizedText });
      }

      // Apply rate limiting
      const isAllowed = await checkRateLimit(env, userId, 15, 60); // 15 requests per minute
      if (!isAllowed) {
        console.log(`Rate limit exceeded for user ${userId} (${userName})`);
        await sendMessage(env, chatId, 
          `${EMOJIS.WARNING} Too many requests\\! Please wait a minute before trying again\\.

*Rate limit:* 15 requests per minute per user
*Tip:* Use the inline keyboards to reduce command typing\\!`, 'MarkdownV2');
        return new Response('ok');
      }

      // Log the command
      console.log(`Processing command from user ${userId} (${userName}): ${text}`);

      // Parse command and arguments
      const args = text.trim().split(/\s+/);
      const command = args[0].toLowerCase();

      // Route commands to appropriate handlers
      await routeCommand(env, chatId, command, args, { userId, userName });

      return new Response('ok');

    } catch (error) {
      console.error("Request handling error:", error);
      
      // Try to send error message to user if we have a chat ID
      if (error.chatId) {
        try {
          await sendMessage(env, error.chatId, 
            `${EMOJIS.ERROR} An unexpected error occurred\\. Please try again or contact support if this persists\\.

*Error ID:* ${Date.now()}`, 'MarkdownV2');
        } catch (sendError) {
          console.error("Could not send error message to user:", sendError);
        }
      }

      return new Response('Error processing request', { status: 500 });
    }
  }
};

/**
 * Routes commands to appropriate handlers
 * @param {object} env - Cloudflare environment
 * @param {string|number} chatId - Chat ID
 * @param {string} command - Command string
 * @param {string[]} args - Command arguments
 * @param {object} userInfo - User information
 */
async function routeCommand(env, chatId, command, args, userInfo) {
  try {
    switch (command) {
      case '/start':
      case '/help':
        await handleStart(env, chatId, command);
        break;

      case '/p2p':
        await handleP2P(env, chatId, args);
        break;

      case '/buy':
        if (args.length >= 2) {
          await handleBuy(env, chatId, args);
        } else {
          await sendMessage(env, chatId, 
            `${EMOJIS.ERROR} ${bold('Buy command requires amount')}\n\nExample: \`/buy 100 USDT ETB\`\nUse \`/help\` for more info\\.`, 'MarkdownV2');
        }
        break;

      case '/sell':
        if (args.length >= 2) {
          await handleSell(env, chatId, args);
        } else {
          await sendMessage(env, chatId, 
            `${EMOJIS.ERROR} ${bold('Sell command requires amount')}\n\nExample: \`/sell 50 USDT ETB\`\nUse \`/help\` for more info\\.`, 'MarkdownV2');
        }
        break;

      case '/rate':
        if (args.length >= 2) {
          await handleRate(env, chatId, args);
        } else {
          await sendMessage(env, chatId, 
            `${EMOJIS.ERROR} ${bold('Rate command requires amount and currency')}\n\nExample: \`/rate 100 BTC USD\`\nUse \`/help\` for more info\\.`, 'MarkdownV2');
        }
        break;

      case '/convert':
        if (args.length >= 4) {
          await handleConvert(env, chatId, args);
        } else {
          await sendMessage(env, chatId, 
            `${EMOJIS.ERROR} ${bold('Convert command requires amount, from, and to currencies')}\n\nExample: \`/convert 100 ETH ADA\`\nUse \`/help\` for more info\\.`, 'MarkdownV2');
        }
        break;

      case '/coin':
        if (args.length >= 2) {
          await handleCoin(env, chatId, args);
        } else {
          await sendMessage(env, chatId, 
            `${EMOJIS.ERROR} ${bold('Coin command requires symbol')}\n\nExample: \`/coin bitcoin\`\nUse \`/help\` for more info\\.`, 'MarkdownV2');
        }
        break;

      default:
        await handleUnknownCommand(env, chatId, command);
        break;
    }
  } catch (commandError) {
    console.error(`Command handler error for ${command}:`, commandError);
    
    // Add chat ID to error for user notification
    commandError.chatId = chatId;
    throw commandError;
  }
}

/**
 * Handles callback queries from inline keyboards
 * @param {object} env - Cloudflare environment
 * @param {object} callbackQuery - Callback query object
 */
async function handleCallbackQuery(env, callbackQuery) {
  try {
    const { id, data, from } = callbackQuery;
    
    console.log(`Callback query from user ${from.id}: ${data}`);

    // Apply rate limiting for callback queries
    const isAllowed = await checkRateLimit(env, from.id, 20, 60); // 20 callback queries per minute
    if (!isAllowed) {
      await answerCallbackQuery(env, id, "Too many requests! Please wait a moment.", true);
      return;
    }

    // Route callback to appropriate handler
    if (data.startsWith('p2p_')) {
      await handleP2PCallback(env, callbackQuery);
    } else if (data.startsWith('coin_')) {
      await handleCoinCallback(env, callbackQuery);
    } else if (data.startsWith('quick_')) {
      await handleQuickAction(env, callbackQuery);
    } else {
      console.log(`Unknown callback query: ${data}`);
      await answerCallbackQuery(env, id, "Unknown action", false);
    }

    // Always answer callback queries
    await answerCallbackQuery(env, id, "", false);

  } catch (error) {
    console.error("Callback query error:", error);
    await answerCallbackQuery(env, callbackQuery.id, "Error processing request", true);
  }
}

/**
 * Handles Binance P2P proxy requests for backward compatibility
 * @param {Request} request - Incoming request
 * @param {object} env - Cloudflare environment
 * @returns {Response} Proxied response
 */
async function handleBinanceP2PProxy(request, env) {
  try {
    console.log('Proxying Binance P2P request to backend');
    
    const backendResponse = await fetch(API_URLS.BINANCE_BACKEND, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "TelegramBot-Proxy/1.0"
      },
      body: await request.text(),
    });

    // Return the backend response with appropriate headers
    const responseBody = await backendResponse.text();
    
    return new Response(responseBody, {
      status: backendResponse.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });

  } catch (error) {
    console.error("P2P proxy error:", error);
    
    return new Response(JSON.stringify({
      error: "Proxy error",
      message: "Could not connect to Binance P2P backend",
      timestamp: new Date().toISOString()
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}