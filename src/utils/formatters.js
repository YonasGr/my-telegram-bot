/**
 * Utility functions for text formatting, number formatting, and markdown escaping
 */

/**
 * Escapes text for Telegram Markdown formatting
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeMarkdown(text) {
  if (typeof text !== 'string') return '';
  const escapeChars = '_*[]()~`>#+-=|{}.!';
  return text.split('').map(c => escapeChars.includes(c) ? '\\' + c : c).join('');
}

/**
 * Escapes text for Telegram MarkdownV2 formatting
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeMarkdownV2(text) {
  if (typeof text !== 'string') return '';
  // All special characters that need escaping in MarkdownV2
  const escapeChars = '_*[]()~`>#+-=|{}.!\\';
  return text.split('').map(c => escapeChars.includes(c) ? '\\' + c : c).join('');
}

/**
 * Formats a number with specified decimal places
 * @param {number} value - Number to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted number
 */
export function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return 'N/A';
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * Formats large numbers with K, M, B suffixes
 * @param {number} num - Number to format
 * @returns {string} Formatted large number
 */
export function formatLargeNumber(num) {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toString();
}

/**
 * Formats percentage change with appropriate color indicator
 * @param {number} change - Percentage change
 * @returns {string} Formatted percentage with emoji
 */
export function formatPercentageChange(change) {
  const emoji = change >= 0 ? '🟢' : '🔴';
  const sign = change >= 0 ? '+' : '';
  return `${emoji} ${sign}${change.toFixed(2)}%`;
}

/**
 * Truncates text to specified length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Validates if a string is a valid number
 * @param {string} value - Value to validate
 * @returns {boolean} True if valid number
 */
export function isValidNumber(value) {
  return !isNaN(parseFloat(value)) && isFinite(value) && parseFloat(value) > 0;
}

/**
 * Safely parses a float value
 * @param {string|number} value - Value to parse
 * @param {number} defaultValue - Default value if parsing fails
 * @returns {number} Parsed float or default
 */
export function safeParseFloat(value, defaultValue = 0) {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Capitalizes first letter of each word
 * @param {string} text - Text to capitalize
 * @returns {string} Capitalized text
 */
export function capitalizeWords(text) {
  return text.replace(/\w\S*/g, (txt) => 
    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
}

/**
 * Creates a delay/sleep function
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Safely formats a number for MarkdownV2 with proper escaping
 * @param {number} value - Number to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} Escaped formatted number
 */
export function safeFormatNumber(value, decimals = 2) {
  const formatted = formatNumber(value, decimals);
  return escapeMarkdownV2(formatted);
}

/**
 * Safely formats large numbers for MarkdownV2 with proper escaping
 * @param {number} num - Number to format
 * @returns {string} Escaped formatted large number
 */
export function safeFormatLargeNumber(num) {
  const formatted = formatLargeNumber(num);
  return escapeMarkdownV2(formatted);
}

/**
 * Safely formats percentage change for MarkdownV2 with proper escaping
 * @param {number} change - Percentage change
 * @returns {string} Escaped formatted percentage with emoji
 */
export function safeFormatPercentageChange(change) {
  const formatted = formatPercentageChange(change);
  return escapeMarkdownV2(formatted);
}

/**
 * Creates a safe MarkdownV2 message with proper escaping for all dynamic content
 * @param {string} template - Message template with placeholders
 * @param {object} values - Values to substitute (will be escaped automatically)
 * @returns {string} Safe MarkdownV2 message
 */
export function createSafeMarkdownV2Message(template, values = {}) {
  let message = template;
  
  // Replace placeholders with escaped values
  Object.entries(values).forEach(([key, value]) => {
    const placeholder = `{${key}}`;
    const escapedValue = escapeMarkdownV2(String(value));
    message = message.replaceAll(placeholder, escapedValue);
  });
  
  return message;
}

/**
 * Wraps text in MarkdownV2 bold formatting with proper escaping
 * @param {string} text - Text to make bold
 * @returns {string} Bold formatted text for MarkdownV2
 */
export function bold(text) {
  return `*${escapeMarkdownV2(String(text))}*`;
}

/**
 * Wraps text in MarkdownV2 italic formatting with proper escaping
 * @param {string} text - Text to make italic
 * @returns {string} Italic formatted text for MarkdownV2
 */
export function italic(text) {
  return `_${escapeMarkdownV2(String(text))}_`;
}

/**
 * Wraps text in MarkdownV2 code formatting with proper escaping
 * @param {string} text - Text to format as code
 * @returns {string} Code formatted text for MarkdownV2
 */
export function code(text) {
  return `\`${escapeMarkdownV2(String(text))}\``;
}

/**
 * Creates a MarkdownV2 link with proper escaping
 * @param {string} text - Link text
 * @param {string} url - URL (should be valid, no escaping needed for URLs)
 * @returns {string} Link formatted for MarkdownV2
 */
export function link(text, url) {
  return `[${escapeMarkdownV2(String(text))}](${url})`;
}

/**
 * Splits a message into chunks that don't exceed Telegram's 4096 character limit
 * @param {string} message - Message to split
 * @param {number} maxLength - Maximum length per chunk (default 4096)
 * @returns {string[]} Array of message chunks
 */
export function chunkMessage(message, maxLength = 4096) {
  if (!message || typeof message !== 'string') {
    return [''];
  }
  
  if (message.length <= maxLength) {
    return [message];
  }
  
  const chunks = [];
  let currentChunk = '';
  
  // Split by lines first to preserve formatting
  const lines = message.split('\n');
  
  for (const line of lines) {
    // If a single line is longer than maxLength, we need to split it
    if (line.length > maxLength) {
      // Save current chunk if it has content
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      
      // Split long line by words to avoid breaking words
      const words = line.split(' ');
      let linePart = '';
      
      for (const word of words) {
        const testLine = linePart ? `${linePart} ${word}` : word;
        
        if (testLine.length > maxLength) {
          if (linePart) {
            // Add current line part as a chunk
            chunks.push(linePart);
            linePart = word;
          } else {
            // Word itself is too long, force split
            if (word.length > maxLength) {
              let remaining = word;
              while (remaining.length > maxLength) {
                chunks.push(remaining.substring(0, maxLength - 3) + '...');
                remaining = remaining.substring(maxLength - 3);
              }
              linePart = remaining;
            } else {
              linePart = word;
            }
          }
        } else {
          linePart = testLine;
        }
      }
      
      if (linePart) {
        currentChunk = linePart;
      }
    } else {
      // Check if adding this line would exceed the limit
      const testChunk = currentChunk ? `${currentChunk}\n${line}` : line;
      
      if (testChunk.length > maxLength) {
        // Save current chunk and start new one
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = line;
      } else {
        currentChunk = testChunk;
      }
    }
  }
  
  // Add the final chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  // If no chunks were created (shouldn't happen), return the original truncated
  if (chunks.length === 0) {
    const truncated = message.substring(0, maxLength - 3) + '...';
    chunks.push(truncated);
  }
  
  return chunks;
}

/**
 * Safely sends a message with proper MarkdownV2 escaping and chunking
 * This is a wrapper that ensures all dynamic content is properly escaped
 * @param {string} template - Message template with placeholders like {coinName}, {price}, etc.
 * @param {object} values - Object with values to replace placeholders
 * @returns {string[]} Array of safe message chunks
 */
export function createSafeMessageChunks(template, values = {}) {
  // First create the safe message with proper escaping
  const safeMessage = createSafeMarkdownV2Message(template, values);
  
  // Then chunk it if needed
  return chunkMessage(safeMessage);
}

/**
 * Escapes ALL dynamic content in a message for safe MarkdownV2 usage
 * @param {string} coinName - Coin name to escape
 * @param {string} symbol - Coin symbol to escape  
 * @param {string} traderName - Trader name to escape
 * @param {string} paymentMethod - Payment method to escape
 * @param {any} anyValue - Any value that needs escaping
 * @returns {string} Escaped value safe for MarkdownV2
 */
export function escapeAll(anyValue) {
  return escapeMarkdownV2(String(anyValue || ''));
}

/**
 * Enhanced safe formatters that automatically escape output
 */
export const safe = {
  /**
   * Safely formats and escapes a coin name with symbol
   * @param {string} name - Coin name
   * @param {string} symbol - Coin symbol
   * @returns {string} Escaped formatted coin name
   */
  coinName: (name, symbol) => {
    return escapeMarkdownV2(`${name || ''} (${symbol || ''})`);
  },
  
  /**
   * Safely formats and escapes a trader name
   * @param {string} traderName - Trader name
   * @returns {string} Escaped trader name
   */
  traderName: (traderName) => {
    return escapeMarkdownV2(String(traderName || ''));
  },
  
  /**
   * Safely formats and escapes a price with currency
   * @param {number|string} price - Price value
   * @param {string} currency - Currency symbol
   * @returns {string} Escaped formatted price
   */
  price: (price, currency = '') => {
    const formatted = `${formatNumber(price)} ${currency}`.trim();
    return escapeMarkdownV2(formatted);
  },
  
  /**
   * Safely formats and escapes a percentage change
   * @param {number} change - Percentage change
   * @returns {string} Escaped formatted percentage
   */
  percentage: (change) => {
    if (change === null || change === undefined || isNaN(change)) {
      return escapeMarkdownV2('N/A');
    }
    const sign = change >= 0 ? '+' : '';
    return escapeMarkdownV2(`${sign}${change.toFixed(2)}%`);
  },
  
  /**
   * Safely formats and escapes a range (e.g., "100 - 500")
   * @param {number|string} min - Minimum value
   * @param {number|string} max - Maximum value
   * @returns {string} Escaped formatted range
   */
  range: (min, max) => {
    return escapeMarkdownV2(`${min || '0'} - ${max || '0'}`);
  },
  
  /**
   * Safely formats and escapes payment methods
   * @param {Array} methods - Array of payment method objects
   * @returns {string} Escaped formatted payment methods
   */
  paymentMethods: (methods) => {
    if (!Array.isArray(methods) || methods.length === 0) {
      return escapeMarkdownV2('N/A');
    }
    const methodNames = methods.map(m => m.tradeMethodName || m.name || 'Unknown').join(', ');
    return escapeMarkdownV2(methodNames);
  },
  
  /**
   * Safely formats and escapes any generic value
   * @param {any} value - Value to format and escape
   * @returns {string} Escaped formatted value
   */
  any: (value) => {
    return escapeMarkdownV2(String(value || ''));
  }
};