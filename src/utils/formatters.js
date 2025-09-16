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