/**
 * Utility functions for text formatting, number formatting, and HTML escaping
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
 * Escapes text for Telegram HTML formatting
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHTML(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
 * Safely formats a number for HTML with proper escaping
 * @param {number} value - Number to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} Escaped formatted number
 */
export function safeFormatNumber(value, decimals = 2) {
  const formatted = formatNumber(value, decimals);
  return escapeHTML(formatted);
}

/**
 * Safely formats large numbers for HTML with proper escaping
 * @param {number} num - Number to format
 * @returns {string} Escaped formatted large number
 */
export function safeFormatLargeNumber(num) {
  const formatted = formatLargeNumber(num);
  return escapeHTML(formatted);
}

/**
 * Safely formats percentage change for HTML with proper escaping
 * @param {number} change - Percentage change
 * @returns {string} Escaped formatted percentage with emoji
 */
export function safeFormatPercentageChange(change) {
  const formatted = formatPercentageChange(change);
  return escapeHTML(formatted);
}

/**
 * Creates a safe HTML message with proper escaping for all dynamic content
 * @param {string} template - Message template with placeholders
 * @param {object} values - Values to substitute (will be escaped automatically)
 * @returns {string} Safe HTML message
 */
export function createSafeHTMLMessage(template, values = {}) {
  let message = template;
  
  // Replace placeholders with escaped values
  Object.entries(values).forEach(([key, value]) => {
    const placeholder = `{${key}}`;
    const escapedValue = escapeHTML(String(value));
    message = message.replaceAll(placeholder, escapedValue);
  });
  
  return message;
}

/**
 * Creates a safe MarkdownV2 message with proper escaping for all dynamic content
 * @param {string} template - Message template with placeholders
 * @param {object} values - Values to substitute (will be escaped automatically)
 * @returns {string} Safe MarkdownV2 message
 * @deprecated Use createSafeHTMLMessage instead
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
 * Wraps text in HTML bold formatting with proper escaping
 * @param {string} text - Text to make bold
 * @returns {string} Bold formatted text for HTML
 */
export function bold(text) {
  return `<b>${escapeHTML(String(text))}</b>`;
}

/**
 * Wraps text in HTML italic formatting with proper escaping
 * @param {string} text - Text to make italic
 * @returns {string} Italic formatted text for HTML
 */
export function italic(text) {
  return `<i>${escapeHTML(String(text))}</i>`;
}

/**
 * Wraps text in HTML code formatting with proper escaping
 * @param {string} text - Text to format as code
 * @returns {string} Code formatted text for HTML
 */
export function code(text) {
  return `<code>${escapeHTML(String(text))}</code>`;
}

/**
 * Creates an HTML link with proper escaping
 * @param {string} text - Link text
 * @param {string} url - URL (should be valid, no escaping needed for URLs)
 * @returns {string} Link formatted for HTML
 */
export function link(text, url) {
  return `<a href="${url}">${escapeHTML(String(text))}</a>`;
}