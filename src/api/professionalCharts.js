/**
 * Professional charting module with candlesticks, volume, and technical indicators
 * Uses chartjs-node-canvas for PNG generation and technicalindicators for calculations
 */

import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { RSI, MACD, SMA } from 'technicalindicators';
import { CHART_CONFIG } from '../config/constants.js';

/**
 * Generate professional chart as PNG buffer
 * @param {object} marketData - Market data with prices, ohlcv, volumes
 * @param {string} coinName - Cryptocurrency name
 * @param {object} options - Chart configuration options
 * @returns {Promise<Buffer>} PNG chart buffer
 */
export async function generateProfessionalChart(marketData, coinName, options = {}) {
  const {
    timeframe = '4h',
    days = 7,
    theme = 'dark',
    width = CHART_CONFIG.DEFAULT_WIDTH,
    height = CHART_CONFIG.DEFAULT_HEIGHT,
    showMA = true,
    showRSI = true,
    showMACD = true,
    showVolume = true
  } = options;

  const chartTheme = CHART_CONFIG.THEMES[theme.toUpperCase()] || CHART_CONFIG.THEMES.DARK;
  
  // Create canvas with higher DPI for better quality
  const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width,
    height,
    backgroundColor: chartTheme.background,
    devicePixelRatio: 2
  });

  // Prepare data and calculate indicators
  const chartData = prepareChartData(marketData, coinName, chartTheme, {
    showMA,
    showRSI,
    showMACD,
    showVolume
  });

  const chartConfig = createChartConfig(chartData, chartTheme, {
    showRSI,
    showMACD,
    showVolume,
    coinName,
    timeframe
  });

  try {
    const buffer = await chartJSNodeCanvas.renderToBuffer(chartConfig);
    return buffer;
  } catch (error) {
    console.error('Error generating professional chart:', error);
    throw new Error('Failed to generate chart');
  }
}

/**
 * Prepare and process market data for charting
 * @param {object} marketData - Raw market data
 * @param {string} coinName - Coin name
 * @param {object} theme - Chart theme
 * @param {object} indicators - Indicator configuration
 * @returns {object} Processed chart data
 */
function prepareChartData(marketData, coinName, theme, indicators) {
  // Use OHLCV data if available, otherwise fall back to price data
  let ohlcvData = marketData.ohlcv;
  
  if (!ohlcvData && marketData.prices) {
    // Generate OHLCV from price data
    ohlcvData = generateOHLCVFromPrices(marketData.prices);
  }

  if (!ohlcvData || ohlcvData.length === 0) {
    throw new Error('No chart data available');
  }

  // Prepare time labels
  const labels = ohlcvData.map(candle => 
    new Date(candle.timestamp).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: ohlcvData.length > 50 ? undefined : 'numeric'
    })
  );

  // Prepare candlestick data
  const candlestickData = ohlcvData.map((candle, index) => ({
    x: index,
    o: candle.open,
    h: candle.high,
    l: candle.low,
    c: candle.close
  }));

  // Prepare volume data
  const volumeData = ohlcvData.map((candle, index) => ({
    x: index,
    y: candle.volume
  }));

  const closePrices = ohlcvData.map(candle => candle.close);
  const result = {
    labels,
    candlestickData,
    volumeData,
    datasets: []
  };

  // Add candlestick dataset
  result.datasets.push({
    label: coinName,
    type: 'candlestick',
    data: candlestickData,
    borderColor: theme.candleUp,
    backgroundColor: theme.candleUp,
    downColor: theme.candleDown,
    downBorderColor: theme.candleDown,
    yAxisID: 'price'
  });

  // Add volume if enabled
  if (indicators.showVolume) {
    result.datasets.push({
      label: 'Volume',
      type: 'bar',
      data: volumeData,
      backgroundColor: theme.volume,
      borderColor: theme.volume,
      yAxisID: 'volume',
      order: 2
    });
  }

  // Calculate and add moving averages
  if (indicators.showMA && closePrices.length >= 50) {
    const ma20 = SMA.calculate({ period: 20, values: closePrices });
    const ma50 = SMA.calculate({ period: 50, values: closePrices });

    if (ma20.length > 0) {
      result.datasets.push({
        label: 'MA 20',
        type: 'line',
        data: ma20.map((value, index) => ({ x: index + 19, y: value })),
        borderColor: theme.ma20,
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 0,
        yAxisID: 'price',
        order: 1
      });
    }

    if (ma50.length > 0) {
      result.datasets.push({
        label: 'MA 50',
        type: 'line', 
        data: ma50.map((value, index) => ({ x: index + 49, y: value })),
        borderColor: theme.ma50,
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 0,
        yAxisID: 'price',
        order: 1
      });
    }
  }

  // Calculate RSI
  if (indicators.showRSI && closePrices.length >= CHART_CONFIG.INDICATORS.RSI_PERIOD) {
    const rsiValues = RSI.calculate({ 
      values: closePrices, 
      period: CHART_CONFIG.INDICATORS.RSI_PERIOD 
    });

    if (rsiValues.length > 0) {
      result.rsiData = rsiValues.map((value, index) => ({
        x: index + CHART_CONFIG.INDICATORS.RSI_PERIOD - 1,
        y: value
      }));
    }
  }

  // Calculate MACD
  if (indicators.showMACD && closePrices.length >= CHART_CONFIG.INDICATORS.MACD_SLOW) {
    const macdResult = MACD.calculate({
      values: closePrices,
      fastPeriod: CHART_CONFIG.INDICATORS.MACD_FAST,
      slowPeriod: CHART_CONFIG.INDICATORS.MACD_SLOW,
      signalPeriod: CHART_CONFIG.INDICATORS.MACD_SIGNAL,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });

    if (macdResult.length > 0) {
      result.macdData = {
        macd: macdResult.map((value, index) => ({
          x: index + CHART_CONFIG.INDICATORS.MACD_SLOW - 1,
          y: value.MACD
        })),
        signal: macdResult.map((value, index) => ({
          x: index + CHART_CONFIG.INDICATORS.MACD_SLOW - 1,
          y: value.signal
        })),
        histogram: macdResult.map((value, index) => ({
          x: index + CHART_CONFIG.INDICATORS.MACD_SLOW - 1,
          y: value.histogram
        }))
      };
    }
  }

  return result;
}

/**
 * Generate OHLCV data from simple price data
 * @param {Array} prices - Array of [timestamp, price] pairs
 * @returns {Array} OHLCV data array
 */
function generateOHLCVFromPrices(prices) {
  if (!prices || prices.length < 2) return [];

  const ohlcv = [];
  const interval = prices.length > 48 ? 4 : 1; // Group by 4 for longer periods

  for (let i = 0; i < prices.length; i += interval) {
    const group = prices.slice(i, i + interval);
    if (group.length === 0) continue;

    const open = group[0][1];
    const close = group[group.length - 1][1];
    const high = Math.max(...group.map(p => p[1]));
    const low = Math.min(...group.map(p => p[1]));
    const volume = close * Math.random() * 1000000; // Mock volume

    ohlcv.push({
      timestamp: group[0][0],
      open,
      high,
      low,
      close,
      volume
    });
  }

  return ohlcv;
}

/**
 * Create Chart.js configuration
 * @param {object} chartData - Prepared chart data
 * @param {object} theme - Chart theme
 * @param {object} options - Chart options
 * @returns {object} Chart.js configuration
 */
function createChartConfig(chartData, theme, options) {
  const config = {
    type: 'bar',
    data: {
      labels: chartData.labels,
      datasets: chartData.datasets
    },
    options: {
      responsive: false,
      animation: false,
      plugins: {
        title: {
          display: true,
          text: `${options.coinName} - ${options.timeframe} Chart`,
          color: theme.text,
          font: { size: 20, weight: 'bold' }
        },
        legend: {
          display: true,
          labels: { color: theme.text }
        }
      },
      scales: {
        x: {
          grid: { color: theme.grid },
          ticks: { color: theme.text }
        },
        price: {
          type: 'linear',
          position: 'left',
          grid: { color: theme.grid },
          ticks: {
            color: theme.text,
            callback: function(value) {
              return '$' + value.toLocaleString(undefined, { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              });
            }
          }
        }
      }
    },
    plugins: []
  };

  // Add volume scale if needed
  if (options.showVolume) {
    config.options.scales.volume = {
      type: 'linear',
      position: 'right',
      grid: { display: false },
      ticks: {
        color: theme.text,
        callback: function(value) {
          return (value / 1000000).toFixed(1) + 'M';
        }
      },
      max: Math.max(...chartData.volumeData.map(v => v.y)) * 4
    };
  }

  // Add RSI subplot
  if (options.showRSI && chartData.rsiData) {
    // RSI would need a separate chart or subplot implementation
    // For now, we'll skip RSI in the main chart
  }

  // Add MACD subplot  
  if (options.showMACD && chartData.macdData) {
    // MACD would need a separate chart or subplot implementation
    // For now, we'll skip MACD in the main chart
  }

  return config;
}

/**
 * Generate fallback line chart for simple price data
 * @param {Array} prices - Price data array
 * @param {string} coinName - Coin name
 * @param {object} options - Chart options
 * @returns {Promise<Buffer>} PNG chart buffer
 */
export async function generateFallbackChart(prices, coinName, options = {}) {
  const {
    width = 800,
    height = 400,
    theme = 'dark'
  } = options;

  const chartTheme = CHART_CONFIG.THEMES[theme.toUpperCase()] || CHART_CONFIG.THEMES.DARK;
  
  const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width,
    height,
    backgroundColor: chartTheme.background
  });

  const labels = prices.map(price => 
    new Date(price[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  );

  const chartConfig = {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: coinName,
        data: prices.map(price => price[1]),
        borderColor: chartTheme.candleUp,
        backgroundColor: 'rgba(0, 255, 136, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: false,
      animation: false,
      plugins: {
        title: {
          display: true,
          text: `${coinName} Price Chart`,
          color: chartTheme.text,
          font: { size: 18 }
        },
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { color: chartTheme.grid },
          ticks: { color: chartTheme.text }
        },
        y: {
          grid: { color: chartTheme.grid },
          ticks: {
            color: chartTheme.text,
            callback: function(value) {
              return '$' + value.toLocaleString();
            }
          }
        }
      }
    }
  };

  try {
    const buffer = await chartJSNodeCanvas.renderToBuffer(chartConfig);
    return buffer;
  } catch (error) {
    console.error('Error generating fallback chart:', error);
    throw new Error('Failed to generate fallback chart');
  }
}

/**
 * Save chart buffer to temporary file and return path
 * @param {Buffer} chartBuffer - Chart PNG buffer
 * @param {string} coinSymbol - Coin symbol for filename
 * @returns {Promise<string>} File path
 */
export async function saveChartToFile(chartBuffer, coinSymbol) {
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');

  const fileName = `${coinSymbol}_chart_${Date.now()}.png`;
  const filePath = path.join(os.tmpdir(), fileName);
  
  await fs.promises.writeFile(filePath, chartBuffer);
  return filePath;
}