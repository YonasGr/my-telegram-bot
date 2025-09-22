/**
 * Chart generation proxy - forwards requests to backend for Node.js compatibility
 * Ensures Cloudflare Workers compatibility by removing direct chart generation
 */

import { API_URLS } from '../config/constants.js';

/**
 * Generates a chart image URL by proxying to backend
 * @param {Array} prices - Array of price data [timestamp, price]
 * @param {string} coinName - Name of the cryptocurrency
 * @param {number} days - Number of days for the chart
 * @param {object} options - Additional chart options
 * @returns {Promise<string>} Chart image URL
 */
export async function generateChartImageUrl(prices, coinName, days = 7, options = {}) {
  if (!prices || prices.length === 0) {
    throw new Error('Price data is required for chart generation');
  }

  const params = new URLSearchParams({
    prices: JSON.stringify(prices),
    coinName: coinName || 'Cryptocurrency',
    days: days.toString(),
    ...Object.fromEntries(
      Object.entries(options).map(([key, value]) => [key, value.toString()])
    )
  });

  try {
    const response = await fetch(`${API_URLS.BACKEND_BASE}/api/chart?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TelegramBot-ChartProxy/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Backend chart generation failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success || !data.chartUrl) {
      throw new Error(data.error || 'Unknown error from backend');
    }

    return data.chartUrl;
  } catch (error) {
    console.error('Chart generation proxy error:', error);
    throw new Error(`Failed to generate chart: ${error.message}`);
  }
}

/**
 * Generates a candlestick chart URL by proxying to backend
 * @param {Array} ohlcData - OHLC data array
 * @param {string} coinName - Cryptocurrency name
 * @param {number} days - Number of days
 * @param {object} options - Chart options
 * @returns {Promise<string>} Candlestick chart URL
 */
export async function generateCandlestickChart(ohlcData, coinName, days = 7, options = {}) {
  if (!ohlcData || ohlcData.length === 0) {
    throw new Error('OHLC data is required for candlestick chart generation');
  }

  const params = new URLSearchParams({
    ohlcData: JSON.stringify(ohlcData),
    coinName: coinName || 'Cryptocurrency',
    days: days.toString(),
    ...Object.fromEntries(
      Object.entries(options).map(([key, value]) => [key, value.toString()])
    )
  });

  try {
    const response = await fetch(`${API_URLS.BACKEND_BASE}/api/candlestick-chart?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TelegramBot-ChartProxy/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Backend candlestick chart generation failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success || !data.chartUrl) {
      throw new Error(data.error || 'Unknown error from backend');
    }

    return data.chartUrl;
  } catch (error) {
    console.error('Candlestick chart generation proxy error:', error);
    throw new Error(`Failed to generate candlestick chart: ${error.message}`);
  }
}

/**
 * Generates a comparison chart for multiple cryptocurrencies by proxying to backend
 * @param {object[]} coinDataArray - Array of coin data objects
 * @param {number} days - Number of days
 * @param {object} options - Chart options
 * @returns {Promise<string>} Comparison chart URL
 */
export async function generateComparisonChart(coinDataArray, days = 7, options = {}) {
  if (!coinDataArray || coinDataArray.length === 0) {
    throw new Error('Coin data array is required for comparison chart');
  }

  const params = new URLSearchParams({
    coinDataArray: JSON.stringify(coinDataArray),
    days: days.toString(),
    ...Object.fromEntries(
      Object.entries(options).map(([key, value]) => [key, value.toString()])
    )
  });

  try {
    const response = await fetch(`${API_URLS.BACKEND_BASE}/api/comparison-chart?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TelegramBot-ChartProxy/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Backend comparison chart generation failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success || !data.chartUrl) {
      throw new Error(data.error || 'Unknown error from backend');
    }

    return data.chartUrl;
  } catch (error) {
    console.error('Comparison chart generation proxy error:', error);
    throw new Error(`Failed to generate comparison chart: ${error.message}`);
  }
}