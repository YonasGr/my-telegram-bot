/**
 * Telegram Bot API wrapper with enhanced message formatting and inline keyboards
 */

import { API_URLS } from '../config/constants.js';

/**
 * Sends a text message to Telegram
 * @param {object} env - Cloudflare environment
 * @param {string|number} chatId - Chat ID
 * @param {string} text - Message text
 * @param {string} parseMode - Parse mode ('Markdown', 'MarkdownV2', 'HTML')
 * @param {object} replyMarkup - Inline keyboard markup
 * @returns {Promise<object|null>} Telegram API response
 */
export async function sendMessage(env, chatId, text, parseMode = 'MarkdownV2', replyMarkup = null) {
  try {
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    };

    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }

    console.log(`Sending message to chat ${chatId}: ${text.substring(0, 100)}...`);

    const response = await fetch(`${API_URLS.TELEGRAM_BOT}${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Telegram sendMessage error ${response.status}:`, errorText);
      
      // Try with Markdown if MarkdownV2 fails
      if (parseMode === 'MarkdownV2' && response.status === 400) {
        console.log('Retrying with Markdown parse mode...');
        return sendMessage(env, chatId, text, 'Markdown', replyMarkup);
      }
      
      return null;
    }

    const result = await response.json();
    console.log(`Message sent successfully to chat ${chatId}`);
    return result;

  } catch (error) {
    console.error('Error sending message:', error);
    return null;
  }
}

/**
 * Sends a photo with caption to Telegram
 * @param {object} env - Cloudflare environment
 * @param {string|number} chatId - Chat ID
 * @param {string} photoUrl - Photo URL
 * @param {string} caption - Photo caption
 * @param {string} parseMode - Parse mode
 * @param {object} replyMarkup - Inline keyboard markup
 * @returns {Promise<object|null>} Telegram API response
 */
export async function sendPhoto(env, chatId, photoUrl, caption = '', parseMode = 'MarkdownV2', replyMarkup = null) {
  try {
    const payload = {
      chat_id: chatId,
      photo: photoUrl,
      caption: caption,
      parse_mode: parseMode
    };

    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }

    console.log(`Sending photo to chat ${chatId}: ${photoUrl}`);

    const response = await fetch(`${API_URLS.TELEGRAM_BOT}${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Telegram sendPhoto error ${response.status}:`, errorText);
      
      // Fallback to sending message with photo URL if photo sending fails
      if (response.status === 400) {
        console.log('Photo send failed, sending as message...');
        const fallbackText = caption ? `${caption}\n\n📊 Chart: ${photoUrl}` : `📊 Chart: ${photoUrl}`;
        return sendMessage(env, chatId, fallbackText, parseMode, replyMarkup);
      }
      
      return null;
    }

    const result = await response.json();
    console.log(`Photo sent successfully to chat ${chatId}`);
    return result;

  } catch (error) {
    console.error('Error sending photo:', error);
    return null;
  }
}

/**
 * Edits an existing message
 * @param {object} env - Cloudflare environment
 * @param {string|number} chatId - Chat ID
 * @param {number} messageId - Message ID to edit
 * @param {string} text - New message text
 * @param {string} parseMode - Parse mode
 * @param {object} replyMarkup - Inline keyboard markup
 * @returns {Promise<object|null>} Telegram API response
 */
export async function editMessage(env, chatId, messageId, text, parseMode = 'MarkdownV2', replyMarkup = null) {
  try {
    const payload = {
      chat_id: chatId,
      message_id: messageId,
      text: text,
      parse_mode: parseMode,
      disable_web_page_preview: true
    };

    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }

    const response = await fetch(`${API_URLS.TELEGRAM_BOT}${env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Telegram editMessage error ${response.status}:`, errorText);
      return null;
    }

    return await response.json();

  } catch (error) {
    console.error('Error editing message:', error);
    return null;
  }
}

/**
 * Answers callback query from inline keyboard
 * @param {object} env - Cloudflare environment
 * @param {string} callbackQueryId - Callback query ID
 * @param {string} text - Answer text
 * @param {boolean} showAlert - Show alert popup
 * @returns {Promise<object|null>} Telegram API response
 */
export async function answerCallbackQuery(env, callbackQueryId, text = '', showAlert = false) {
  try {
    const payload = {
      callback_query_id: callbackQueryId,
      text: text,
      show_alert: showAlert,
    };

    const response = await fetch(`${API_URLS.TELEGRAM_BOT}${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(`Telegram answerCallbackQuery error ${response.status}`);
      return null;
    }

    return await response.json();

  } catch (error) {
    console.error('Error answering callback query:', error);
    return null;
  }
}

/**
 * Safely sends a message with automatic chunking and MarkdownV2 escaping
 * @param {object} env - Cloudflare environment
 * @param {string|number} chatId - Chat ID
 * @param {string} text - Message text (will be chunked if too long)
 * @param {string} parseMode - Parse mode (default: 'MarkdownV2')
 * @param {object} replyMarkup - Inline keyboard markup (only applied to last chunk)
 * @returns {Promise<object[]>} Array of Telegram API responses
 */
export async function sendMessageSafe(env, chatId, text, parseMode = 'MarkdownV2', replyMarkup = null) {
  try {
    // Import chunking function
    const { chunkMessage } = await import('../utils/formatters.js');
    
    // Split message into chunks
    const chunks = chunkMessage(text);
    const responses = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const isLastChunk = i === chunks.length - 1;
      
      // Only apply reply markup to the last chunk
      const currentReplyMarkup = isLastChunk ? replyMarkup : null;
      
      const response = await sendMessage(env, chatId, chunk, parseMode, currentReplyMarkup);
      responses.push(response);
      
      // Small delay between chunks to avoid rate limiting
      if (!isLastChunk) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return responses;
  } catch (error) {
    console.error('Error in sendMessageSafe:', error);
    // Fallback to regular sendMessage
    return [await sendMessage(env, chatId, text, parseMode, replyMarkup)];
  }
}

/**
 * Creates and sends a safe message with template and values
 * @param {object} env - Cloudflare environment
 * @param {string|number} chatId - Chat ID
 * @param {string} template - Message template with placeholders
 * @param {object} values - Values to substitute in template
 * @param {object} replyMarkup - Inline keyboard markup
 * @returns {Promise<object[]>} Array of Telegram API responses
 */
export async function sendTemplateSafe(env, chatId, template, values = {}, replyMarkup = null) {
  try {
    const { createSafeMessageChunks } = await import('../utils/formatters.js');
    
    // Create safe message chunks with proper escaping
    const chunks = createSafeMessageChunks(template, values);
    const responses = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const isLastChunk = i === chunks.length - 1;
      
      // Only apply reply markup to the last chunk
      const currentReplyMarkup = isLastChunk ? replyMarkup : null;
      
      const response = await sendMessage(env, chatId, chunk, 'MarkdownV2', currentReplyMarkup);
      responses.push(response);
      
      // Small delay between chunks
      if (!isLastChunk) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return responses;
  } catch (error) {
    console.error('Error in sendTemplateSafe:', error);
    // Fallback to basic safe message
    return await sendMessageSafe(env, chatId, template);
  }
}

/**
 * Creates inline keyboard markup
 * @param {Array<Array<object>>} buttons - 2D array of button objects
 * @returns {object} Inline keyboard markup
 */
export function createInlineKeyboard(buttons) {
  return {
    inline_keyboard: buttons.map(row =>
      row.map(button => ({
        text: button.text,
        callback_data: button.callback_data,
        ...(button.url && { url: button.url })
      }))
    )
  };
}

/**
 * Creates a timeframe selection keyboard
 * @param {string} command - Base command for callbacks
 * @param {string} asset - Asset symbol for the command
 * @returns {object} Inline keyboard markup
 */
export function createTimeframeKeyboard(command, asset) {
  const timeframes = [
    { text: '1 Day', callback_data: `${command}_${asset}_1` },
    { text: '7 Days', callback_data: `${command}_${asset}_7` },
    { text: '30 Days', callback_data: `${command}_${asset}_30` }
  ];

  return createInlineKeyboard([timeframes]);
}

/**
 * Creates a trade type selection keyboard
 * @param {string} command - Base command for callbacks
 * @param {string} asset - Asset symbol
 * @param {string} fiat - Fiat currency
 * @returns {object} Inline keyboard markup
 */
export function createTradeTypeKeyboard(command, asset, fiat) {
  const buttons = [
    [
      { text: '💰 Buy', callback_data: `${command}_${asset}_${fiat}_BUY` },
      { text: '💸 Sell', callback_data: `${command}_${asset}_${fiat}_SELL` }
    ]
  ];

  return createInlineKeyboard(buttons);
}

/**
 * Creates a pagination keyboard
 * @param {string} command - Base command
 * @param {number} currentPage - Current page number
 * @param {boolean} hasNext - Whether there's a next page
 * @returns {object} Inline keyboard markup
 */
export function createPaginationKeyboard(command, currentPage, hasNext) {
  const buttons = [];
  
  if (currentPage > 1) {
    buttons.push({ text: '⬅️ Previous', callback_data: `${command}_page_${currentPage - 1}` });
  }
  
  if (hasNext) {
    buttons.push({ text: '➡️ Next', callback_data: `${command}_page_${currentPage + 1}` });
  }

  return buttons.length > 0 ? createInlineKeyboard([buttons]) : null;
}

/**
 * Creates a quick actions keyboard for main menu
 * @returns {object} Inline keyboard markup
 */
export function createQuickActionsKeyboard() {
  const buttons = [
    [
      { text: '💰 P2P Rates', callback_data: 'quick_p2p' },
      { text: '📊 Top Coins', callback_data: 'quick_top' }
    ],
    [
      { text: '💱 Convert', callback_data: 'quick_convert' },
      { text: '🔄 Trending', callback_data: 'quick_trending' }
    ]
  ];

  return createInlineKeyboard(buttons);
}

/**
 * Sends typing action to show bot is working
 * @param {object} env - Cloudflare environment
 * @param {string|number} chatId - Chat ID
 * @returns {Promise<boolean>} Success status
 */
export async function sendTypingAction(env, chatId) {
  try {
    const response = await fetch(`${API_URLS.TELEGRAM_BOT}${env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        action: 'typing'
      })
    });

    return response.ok;

  } catch (error) {
    console.error('Error sending typing action:', error);
    return false;
  }
}

/**
 * Sends loading message that can be edited later
 * @param {object} env - Cloudflare environment
 * @param {string|number} chatId - Chat ID
 * @param {string} loadingText - Loading message text
 * @returns {Promise<object|null>} Message response for editing later
 */
export async function sendLoadingMessage(env, chatId, loadingText = '⏳ Processing your request...') {
  await sendTypingAction(env, chatId);
  return sendMessage(env, chatId, loadingText, 'MarkdownV2');
}

/**
 * Updates loading message with final result
 * @param {object} env - Cloudflare environment  
 * @param {string|number} chatId - Chat ID
 * @param {number} messageId - Loading message ID
 * @param {string} finalText - Final message text
 * @param {string} parseMode - Parse mode
 * @param {object} replyMarkup - Inline keyboard markup
 * @returns {Promise<object|null>} Edit result
 */
export async function updateLoadingMessage(env, chatId, messageId, finalText, parseMode = 'MarkdownV2', replyMarkup = null) {
  return editMessage(env, chatId, messageId, finalText, parseMode, replyMarkup);
}