/**
 * Chart generation utilities using QuickChart.io
 */

import { API_URLS, CHART_CONFIG } from '../config/constants.js';

/**
 * Generates a chart image URL with enhanced configuration
 * @param {Array} prices - Array of price data [timestamp, price]
 * @param {string} coinName - Name of the cryptocurrency
 * @param {number} days - Number of days for the chart
 * @param {object} options - Additional chart options
 * @returns {string} Chart image URL
 */
export function generateChartImageUrl(prices, coinName, days = 7, options = {}) {
  const {
    width = CHART_CONFIG.DEFAULT_WIDTH,
    height = CHART_CONFIG.DEFAULT_HEIGHT,
    backgroundColor = CHART_CONFIG.BACKGROUND_COLOR,
    showGrid = true,
    showTitle = true,
    lineColor = CHART_CONFIG.LINE_COLOR,
    fillColor = CHART_CONFIG.FILL_COLOR
  } = options;

  if (!prices || prices.length === 0) {
    throw new Error('Price data is required for chart generation');
  }

  const chartData = prices.map(price => price[1]);
  const timestamps = prices.map(price => price[0]);
  
  // Generate labels based on timeframe
  const labels = generateTimeLabels(timestamps, days);

  const chartConfig = {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: `${coinName} Price (USD)`,
        data: chartData,
        borderColor: lineColor,
        backgroundColor: fillColor,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: showTitle ? {
          display: true,
          text: `${coinName} ${days}-Day Price Chart`,
          font: { size: 16, weight: 'bold' },
          color: '#ffffff'
        } : { display: false }
      },
      scales: {
        y: {
          beginAtZero: false,
          grid: showGrid ? { 
            color: 'rgba(255, 255, 255, 0.1)',
            borderColor: 'rgba(255, 255, 255, 0.2)'
          } : { display: false },
          ticks: {
            color: '#ffffff',
            font: { size: 12 },
            callback: function(value) {
              return '$' + value.toLocaleString();
            }
          }
        },
        x: { 
          display: days <= 7, // Only show x-axis for shorter timeframes
          grid: showGrid ? { 
            color: 'rgba(255, 255, 255, 0.05)' 
          } : { display: false },
          ticks: {
            color: '#ffffff',
            font: { size: 10 },
            maxTicksLimit: 8
          }
        }
      },
      elements: {
        point: {
          hoverBackgroundColor: lineColor
        }
      }
    }
  };

  const queryParams = new URLSearchParams({
    c: JSON.stringify(chartConfig),
    width: width.toString(),
    height: height.toString(),
    backgroundColor: backgroundColor
  });

  return `${API_URLS.CHART_IMAGE}?${queryParams}`;
}

/**
 * Generates time labels for chart based on timeframe
 * @param {number[]} timestamps - Array of timestamps
 * @param {number} days - Number of days
 * @returns {string[]} Formatted time labels
 */
function generateTimeLabels(timestamps, days) {
  if (days <= 1) {
    // Hourly labels for 1 day
    return timestamps.map((ts, index) => {
      if (index % Math.ceil(timestamps.length / 12) === 0) {
        return new Date(ts).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false
        });
      }
      return '';
    });
  } else if (days <= 7) {
    // Daily labels for week
    return timestamps.map((ts, index) => {
      if (index % Math.ceil(timestamps.length / 7) === 0) {
        return new Date(ts).toLocaleDateString('en-US', { 
          weekday: 'short'
        });
      }
      return '';
    });
  } else {
    // Weekly/monthly labels for longer periods
    return timestamps.map((ts, index) => {
      if (index % Math.ceil(timestamps.length / 6) === 0) {
        return new Date(ts).toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        });
      }
      return '';
    });
  }
}

/**
 * Generates a candlestick chart URL
 * @param {Array} ohlcData - OHLC data array
 * @param {string} coinName - Cryptocurrency name
 * @param {number} days - Number of days
 * @param {object} options - Chart options
 * @returns {string} Candlestick chart URL
 */
export function generateCandlestickChart(ohlcData, coinName, days = 7, options = {}) {
  const {
    width = CHART_CONFIG.DEFAULT_WIDTH,
    height = CHART_CONFIG.DEFAULT_HEIGHT,
    backgroundColor = CHART_CONFIG.BACKGROUND_COLOR
  } = options;

  if (!ohlcData || ohlcData.length === 0) {
    throw new Error('OHLC data is required for candlestick chart');
  }

  // Transform OHLC data for candlestick chart
  const chartData = ohlcData.map(candle => ({
    x: new Date(candle[0]).toISOString(),
    o: candle[1], // open
    h: candle[2], // high
    l: candle[3], // low
    c: candle[4]  // close
  }));

  const chartConfig = {
    type: 'candlestick',
    data: {
      datasets: [{
        label: coinName,
        data: chartData
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: `${coinName} ${days}-Day Candlestick Chart`,
          font: { size: 16 }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: days <= 7 ? 'day' : 'week'
          }
        }
      }
    }
  };

  const queryParams = new URLSearchParams({
    c: JSON.stringify(chartConfig),
    width: width.toString(),
    height: height.toString(),
    backgroundColor: backgroundColor
  });

  return `${API_URLS.CHART_IMAGE}?${queryParams}`;
}

/**
 * Generates a comparison chart for multiple cryptocurrencies
 * @param {object[]} coinDataArray - Array of coin data objects
 * @param {number} days - Number of days
 * @param {object} options - Chart options
 * @returns {string} Comparison chart URL
 */
export function generateComparisonChart(coinDataArray, days = 7, options = {}) {
  const {
    width = CHART_CONFIG.DEFAULT_WIDTH,
    height = CHART_CONFIG.DEFAULT_HEIGHT,
    backgroundColor = CHART_CONFIG.BACKGROUND_COLOR,
    colors = ['#00ff88', '#ff6384', '#36a2eb', '#ffce56', '#4bc0c0']
  } = options;

  if (!coinDataArray || coinDataArray.length === 0) {
    throw new Error('Coin data array is required for comparison chart');
  }

  const datasets = coinDataArray.map((coinData, index) => ({
    label: coinData.name,
    data: coinData.prices.map(price => price[1]),
    borderColor: colors[index % colors.length],
    backgroundColor: colors[index % colors.length] + '20',
    fill: false,
    tension: 0.4,
    pointRadius: 0
  }));

  // Use the first coin's timestamps for labels
  const labels = generateTimeLabels(
    coinDataArray[0].prices.map(price => price[0]), 
    days
  );

  const chartConfig = {
    type: 'line',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: `Cryptocurrency Comparison (${days} days)`,
          font: { size: 16 }
        },
        legend: {
          display: true,
          position: 'top'
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          grid: { color: 'rgba(255, 255, 255, 0.1)' }
        },
        x: { 
          grid: { color: 'rgba(255, 255, 255, 0.05)' }
        }
      }
    }
  };

  const queryParams = new URLSearchParams({
    c: JSON.stringify(chartConfig),
    width: width.toString(),
    height: height.toString(),
    backgroundColor: backgroundColor
  });

  return `${API_URLS.CHART_IMAGE}?${queryParams}`;
}

/**
 * Generates a simple sparkline chart
 * @param {number[]} data - Price data array
 * @param {string} color - Line color
 * @returns {string} Sparkline chart URL
 */
export function generateSparklineChart(data, color = CHART_CONFIG.LINE_COLOR) {
  if (!data || data.length === 0) {
    throw new Error('Data is required for sparkline');
  }

  const chartConfig = {
    type: 'sparkline',
    data: {
      datasets: [{
        data: data,
        borderColor: color,
        backgroundColor: color + '20',
        fill: true
      }]
    },
    options: {
      plugins: { legend: { display: false } }
    }
  };

  const queryParams = new URLSearchParams({
    c: JSON.stringify(chartConfig),
    width: '200',
    height: '50'
  });

  return `${API_URLS.CHART_IMAGE}?${queryParams}`;
}