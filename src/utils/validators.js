/**
 * Input validation utilities
 */

import { SUPPORTED_ASSETS, SUPPORTED_FIATS, TRADE_TYPES, PAGINATION } from '../config/constants.js';

/**
 * Validates command arguments for P2P requests
 * @param {string[]} args - Command arguments
 * @returns {object} Parsed and validated arguments
 */
export function validateP2PArgs(args) {
  const result = {
    asset: 'USDT',
    fiat: 'ETB', 
    tradeType: 'BUY',
    rows: 10,
    errors: []
  };

  for (let i = 1; i < args.length; i++) {
    const param = args[i].toUpperCase();
    
    if (TRADE_TYPES.includes(param)) {
      result.tradeType = param;
    } else if (SUPPORTED_ASSETS.includes(param)) {
      result.asset = param;
    } else if (SUPPORTED_FIATS.includes(param)) {
      result.fiat = param;
    } else if (!isNaN(parseInt(param)) && parseInt(param) > 0) {
      const rows = Math.min(parseInt(param), PAGINATION.MAX_P2P_ROWS);
      result.rows = rows;
    } else {
      result.errors.push(`Unknown parameter: ${args[i]}`);
    }
  }

  return result;
}

/**
 * Validates amount parameter
 * @param {string|number} amount - Amount to validate
 * @returns {object} Validation result
 */
export function validateAmount(amount) {
  const parsed = parseFloat(amount);
  
  if (isNaN(parsed) || parsed <= 0) {
    return {
      isValid: false,
      value: 0,
      error: 'Please provide a valid amount (number greater than 0)'
    };
  }

  return {
    isValid: true,
    value: parsed,
    error: null
  };
}

/**
 * Validates currency symbol
 * @param {string} currency - Currency to validate
 * @returns {object} Validation result
 */
export function validateCurrency(currency) {
  if (!currency || typeof currency !== 'string') {
    return {
      isValid: false,
      value: '',
      error: 'Currency symbol is required'
    };
  }

  return {
    isValid: true,
    value: currency.toUpperCase(),
    error: null
  };
}

/**
 * Validates P2P request parameters for rate calculations
 * @param {number} amount - Amount to validate
 * @param {string} asset - Asset to validate
 * @param {string} fiat - Fiat currency to validate
 * @returns {object} Validation result
 */
export function validateP2PRate(amount, asset, fiat) {
  const errors = [];

  // Validate amount
  if (isNaN(amount) || amount <= 0) {
    errors.push('Amount must be a positive number');
  }

  // Validate asset
  if (!SUPPORTED_ASSETS.includes(asset.toUpperCase())) {
    errors.push(`Unsupported asset: ${asset}. Supported: ${SUPPORTED_ASSETS.join(', ')}`);
  }

  // Validate fiat
  if (!SUPPORTED_FIATS.includes(fiat.toUpperCase())) {
    errors.push(`Unsupported fiat: ${fiat}. Supported: ${SUPPORTED_FIATS.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates conversion parameters
 * @param {number} amount - Amount to convert
 * @param {string} fromCurrency - Source currency
 * @param {string} toCurrency - Target currency
 * @returns {object} Validation result
 */
export function validateConversion(amount, fromCurrency, toCurrency) {
  const errors = [];

  if (isNaN(amount) || amount <= 0) {
    errors.push('Amount must be a positive number');
  }

  if (!fromCurrency) {
    errors.push('Source currency is required');
  }

  if (!toCurrency) {
    errors.push('Target currency is required');
  }

  if (fromCurrency && toCurrency && 
      fromCurrency.toLowerCase() === toCurrency.toLowerCase()) {
    errors.push('Source and target currencies must be different');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates coin symbol for coin information requests
 * @param {string} symbol - Coin symbol to validate
 * @returns {object} Validation result
 */
export function validateCoinSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') {
    return {
      isValid: false,
      value: '',
      error: 'Please provide a coin symbol (e.g., /coin btc)'
    };
  }

  if (symbol.length > 20) {
    return {
      isValid: false,
      value: '',
      error: 'Coin symbol is too long'
    };
  }

  return {
    isValid: true,
    value: symbol.toLowerCase().trim(),
    error: null
  };
}

/**
 * Sanitizes user input to prevent injection attacks
 * @param {string} input - Input to sanitize
 * @returns {string} Sanitized input
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  
  // Remove potentially dangerous characters
  return input.replace(/[<>\"'&]/g, '')
              .replace(/javascript:/gi, '')
              .replace(/on\w+=/gi, '')
              .trim();
}