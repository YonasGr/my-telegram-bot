/**
 * Backend chart generation utilities using QuickChart.io
 * Moved from frontend to ensure Cloudflare Workers compatibility
 */

const CHART_IMAGE_URL = 'https://quickchart.io/chart';

const CHART_CONFIG = {
  DEFAULT_DAYS: 7,
  AVAILABLE_TIMEFRAMES: ['1', '7', '30'],
  DEFAULT_WIDTH: 800,
  DEFAULT_HEIGHT: 400,
  BACKGROUND_COLOR: 'rgba(17,17,17,0.9)',
  LINE_COLOR: '#00ff88',
  FILL_COLOR: 'rgba(0, 255, 136, 0.1)'
};

/**
 * Generates time labels for chart based on timeframe
 * @param {number[]} timestamps - Array of timestamps
 * @param {number} days - Number of days
 * @returns {string[]} Formatted time labels
 */
function generateTimeLabels(timestamps, days) {
  if (!timestamps || timestamps.length === 0) return [];
  
  const labels = [];
  const timeframeStep = Math.max(1, Math.floor(timestamps.length / 8));
  
  for (let i = 0; i < timestamps.length; i += timeframeStep) {
    const date = new Date(timestamps[i]);
    if (days <= 1) {
      // Show hours for 1 day
      labels.push(date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      }));
    } else if (days <= 7) {
      // Show days for week
      labels.push(date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      }));
    } else {
      // Show dates for longer periods
      labels.push(date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: '2-digit'
      }));
    }
  }
  
  return labels;
}

/**
 * Generates a chart image URL with enhanced configuration
 * @param {Array} prices - Array of price data [timestamp, price]
 * @param {string} coinName - Name of the cryptocurrency
 * @param {number} days - Number of days for the chart
 * @param {object} options - Additional chart options
 * @returns {string} Chart image URL
 */
function generateChartImageUrl(prices, coinName, days = 7, options = {}) {
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
      maintainAspectRatio: false,
      plugins: {
        title: showTitle ? {
          display: true,
          text: `${coinName} Price Chart (${days}d)`,
          color: '#ffffff',
          font: { size: 16 }
        } : { display: false },
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          grid: showGrid ? { 
            color: 'rgba(255, 255, 255, 0.1)' 
          } : { display: false },
          ticks: {
            color: '#ffffff',
            font: { size: 10 },
            maxTicksLimit: 6
          }
        },
        x: {
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

  return `${CHART_IMAGE_URL}?${queryParams}`;
}

/**
 * Generates a candlestick chart URL
 * @param {Array} ohlcData - OHLC data array
 * @param {string} coinName - Cryptocurrency name
 * @param {number} days - Number of days
 * @param {object} options - Chart options
 * @returns {string} Candlestick chart URL
 */
function generateCandlestickChart(ohlcData, coinName, days = 7, options = {}) {
  const {
    width = CHART_CONFIG.DEFAULT_WIDTH,
    height = CHART_CONFIG.DEFAULT_HEIGHT,
    backgroundColor = CHART_CONFIG.BACKGROUND_COLOR
  } = options;

  if (!ohlcData || ohlcData.length === 0) {
    throw new Error('OHLC data is required for candlestick chart generation');
  }

  const candlestickData = ohlcData.map(candle => ({
    t: candle[0], // time
    o: candle[1], // open
    h: candle[2], // high
    l: candle[3], // low
    c: candle[4]  // close
  }));

  const chartConfig = {
    type: 'candlestick',
    data: {
      datasets: [{
        label: `${coinName} OHLC`,
        data: candlestickData
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: `${coinName} Candlestick Chart (${days}d)`,
          color: '#ffffff',
          font: { size: 16 }
        },
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          ticks: { color: '#ffffff' }
        },
        x: {
          type: 'time',
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#ffffff' },
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

  return `${CHART_IMAGE_URL}?${queryParams}`;
}

/**
 * Generates a comparison chart for multiple cryptocurrencies
 * @param {object[]} coinDataArray - Array of coin data objects
 * @param {number} days - Number of days
 * @param {object} options - Chart options
 * @returns {string} Comparison chart URL
 */
function generateComparisonChart(coinDataArray, days = 7, options = {}) {
  const {
    width = CHART_CONFIG.DEFAULT_WIDTH,
    height = CHART_CONFIG.DEFAULT_HEIGHT,
    backgroundColor = CHART_CONFIG.BACKGROUND_COLOR
  } = options;

  if (!coinDataArray || coinDataArray.length === 0) {
    throw new Error('Coin data array is required for comparison chart');
  }

  const colors = ['#00ff88', '#ff6384', '#36a2eb', '#ffce56', '#4bc0c0'];
  const datasets = coinDataArray.map((coinData, index) => ({
    label: coinData.name,
    data: coinData.prices.map(price => price[1]),
    borderColor: colors[index % colors.length],
    backgroundColor: colors[index % colors.length] + '20',
    fill: false,
    tension: 0.4,
    pointRadius: 0
  }));

  // Use timestamps from the first coin for labels
  const timestamps = coinDataArray[0].prices.map(price => price[0]);
  const labels = generateTimeLabels(timestamps, days);

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
          text: `Cryptocurrency Comparison (${days}d)`,
          color: '#ffffff',
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

  return `${CHART_IMAGE_URL}?${queryParams}`;
}

export {
  generateChartImageUrl,
  generateCandlestickChart,
  generateComparisonChart
};