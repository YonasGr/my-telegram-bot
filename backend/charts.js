/**
 * Backend chart generation using QuickChart.io
 * Modern dark-themed area charts with price annotations
 */

const CHART_IMAGE_URL = 'https://quickchart.io/chart';

const PALETTE = {
  bg: '#0d1117',
  gridLine: 'rgba(255,255,255,0.06)',
  tickColor: '#8b949e',
  bullLine: '#3fb950',
  bullFill: 'rgba(63,185,80,0.12)',
  bearLine: '#f85149',
  bearFill: 'rgba(248,81,73,0.12)',
  neutralLine: '#58a6ff',
  neutralFill: 'rgba(88,166,255,0.12)',
  titleColor: '#e6edf3',
  annotationColor: '#e6edf3',
};

/**
 * Determines if price trend is bullish, bearish, or neutral
 */
function getTrend(prices) {
  if (!prices || prices.length < 2) return 'neutral';
  const first = prices[0][1];
  const last = prices[prices.length - 1][1];
  const change = ((last - first) / first) * 100;
  if (change > 0.5) return 'bull';
  if (change < -0.5) return 'bear';
  return 'neutral';
}

/**
 * Formats a price value for display on chart axis
 */
function formatAxisPrice(value) {
  if (value >= 1000) return '$' + (value / 1000).toFixed(1) + 'k';
  if (value >= 1) return '$' + value.toFixed(2);
  if (value >= 0.01) return '$' + value.toFixed(4);
  return '$' + value.toFixed(6);
}

/**
 * Generates smart time labels — only labels at clean intervals
 */
function generateTimeLabels(timestamps, days) {
  if (!timestamps || timestamps.length === 0) return [];

  const total = timestamps.length;
  // Target ~6-8 visible labels
  const targetCount = days <= 1 ? 6 : 7;
  const step = Math.max(1, Math.floor(total / targetCount));

  return timestamps.map((ts, i) => {
    if (i % step !== 0 && i !== total - 1) return '';
    const date = new Date(ts);
    if (days <= 1) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    if (days <= 7) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
}

/**
 * Generates a modern area price chart URL
 * @param {Array} prices - [[timestamp, price], ...]
 * @param {string} coinName - Coin display name
 * @param {number} days - Timeframe in days
 * @param {object} options - Optional overrides
 * @returns {string} QuickChart URL
 */
function generateChartImageUrl(prices, coinName, days = 7, options = {}) {
  if (!prices || prices.length === 0) throw new Error('Price data is required');

  const { width = 900, height = 450 } = options;

  const trend = getTrend(prices);
  const lineColor = trend === 'bull' ? PALETTE.bullLine : trend === 'bear' ? PALETTE.bearLine : PALETTE.neutralLine;
  const fillColor = trend === 'bull' ? PALETTE.bullFill : trend === 'bear' ? PALETTE.bearFill : PALETTE.neutralFill;

  const chartData = prices.map(p => p[1]);
  const timestamps = prices.map(p => p[0]);
  const labels = generateTimeLabels(timestamps, days);

  const firstPrice = chartData[0];
  const lastPrice = chartData[chartData.length - 1];
  const pctChange = ((lastPrice - firstPrice) / firstPrice) * 100;
  const changeSign = pctChange >= 0 ? '+' : '';
  const minPrice = Math.min(...chartData);
  const maxPrice = Math.max(...chartData);

  // Downsample for performance if too many points
  let sampledData = chartData;
  let sampledLabels = labels;
  if (chartData.length > 200) {
    const factor = Math.ceil(chartData.length / 200);
    sampledData = chartData.filter((_, i) => i % factor === 0);
    sampledLabels = labels.filter((_, i) => i % factor === 0);
  }

  const chartConfig = {
    type: 'line',
    data: {
      labels: sampledLabels,
      datasets: [{
        data: sampledData,
        borderColor: lineColor,
        backgroundColor: fillColor,
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 5,
        borderWidth: 2.5,
      }]
    },
    options: {
      responsive: true,
      animation: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `${coinName}  ·  ${days === 1 ? '24h' : days + 'd'}  ·  ${changeSign}${pctChange.toFixed(2)}%  ·  ${formatAxisPrice(lastPrice)}`,
          color: PALETTE.titleColor,
          font: { size: 15, weight: 'bold', family: 'monospace' },
          padding: { top: 12, bottom: 8 }
        },
      },
      scales: {
        y: {
          position: 'right',
          beginAtZero: false,
          min: minPrice * 0.998,
          max: maxPrice * 1.002,
          grid: { color: PALETTE.gridLine, drawBorder: false },
          ticks: {
            color: PALETTE.tickColor,
            font: { size: 10, family: 'monospace' },
            maxTicksLimit: 6,
            callback: (v) => formatAxisPrice(v),
          }
        },
        x: {
          grid: { color: PALETTE.gridLine, drawBorder: false },
          ticks: {
            color: PALETTE.tickColor,
            font: { size: 10 },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 7,
          }
        }
      },
      layout: { padding: { left: 8, right: 8, top: 4, bottom: 4 } }
    }
  };

  const queryParams = new URLSearchParams({
    c: JSON.stringify(chartConfig),
    width: width.toString(),
    height: height.toString(),
    backgroundColor: PALETTE.bg,
    devicePixelRatio: '2',
  });

  return `${CHART_IMAGE_URL}?${queryParams}`;
}

/**
 * Generates a candlestick chart URL
 * @param {Array} ohlcData - [[time, open, high, low, close], ...]
 * @param {string} coinName - Coin name
 * @param {number} days - Timeframe
 * @param {object} options - Options
 * @returns {string} Chart URL
 */
function generateCandlestickChart(ohlcData, coinName, days = 7, options = {}) {
  const { width = 900, height = 450 } = options;

  if (!ohlcData || ohlcData.length === 0) throw new Error('OHLC data is required');

  const candlestickData = ohlcData.map(c => ({ t: c[0], o: c[1], h: c[2], l: c[3], c: c[4] }));

  const chartConfig = {
    type: 'candlestick',
    data: {
      datasets: [{
        label: coinName,
        data: candlestickData,
        color: {
          up: PALETTE.bullLine,
          down: PALETTE.bearLine,
          unchanged: PALETTE.neutralLine,
        }
      }]
    },
    options: {
      animation: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `${coinName} · ${days === 1 ? '24h' : days + 'd'} Candlestick`,
          color: PALETTE.titleColor,
          font: { size: 15, weight: 'bold' },
        }
      },
      scales: {
        y: {
          position: 'right',
          grid: { color: PALETTE.gridLine },
          ticks: { color: PALETTE.tickColor, font: { size: 10 }, callback: (v) => formatAxisPrice(v) }
        },
        x: {
          type: 'time',
          grid: { color: PALETTE.gridLine },
          ticks: { color: PALETTE.tickColor, font: { size: 10 } },
          time: { unit: days <= 7 ? 'day' : 'week' }
        }
      }
    }
  };

  const queryParams = new URLSearchParams({
    c: JSON.stringify(chartConfig),
    width: width.toString(),
    height: height.toString(),
    backgroundColor: PALETTE.bg,
    devicePixelRatio: '2',
  });

  return `${CHART_IMAGE_URL}?${queryParams}`;
}

/**
 * Generates a normalized comparison chart (% change from start)
 * @param {object[]} coinDataArray - [{ name, prices: [[ts, price]] }, ...]
 * @param {number} days - Timeframe
 * @param {object} options - Options
 * @returns {string} Chart URL
 */
function generateComparisonChart(coinDataArray, days = 7, options = {}) {
  const { width = 900, height = 450 } = options;

  if (!coinDataArray || coinDataArray.length === 0) throw new Error('Coin data required');

  const colors = [PALETTE.bullLine, PALETTE.bearLine, PALETTE.neutralLine, '#d2a8ff', '#ffa657'];

  const datasets = coinDataArray.map((coin, i) => {
    const base = coin.prices[0][1];
    const normalizedData = coin.prices.map(p => +((((p[1] - base) / base) * 100).toFixed(3)));
    return {
      label: coin.name,
      data: normalizedData,
      borderColor: colors[i % colors.length],
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.35,
      pointRadius: 0,
      borderWidth: 2,
    };
  });

  const timestamps = coinDataArray[0].prices.map(p => p[0]);
  const labels = generateTimeLabels(timestamps, days);

  const chartConfig = {
    type: 'line',
    data: { labels, datasets },
    options: {
      animation: false,
      plugins: {
        legend: { display: true, position: 'top', labels: { color: PALETTE.titleColor, font: { size: 11 } } },
        title: {
          display: true,
          text: `Price Comparison · ${days === 1 ? '24h' : days + 'd'} (% change)`,
          color: PALETTE.titleColor,
          font: { size: 15, weight: 'bold' },
        }
      },
      scales: {
        y: {
          position: 'right',
          grid: { color: PALETTE.gridLine },
          ticks: { color: PALETTE.tickColor, font: { size: 10 }, callback: (v) => (v >= 0 ? '+' : '') + v + '%' }
        },
        x: {
          grid: { color: PALETTE.gridLine },
          ticks: { color: PALETTE.tickColor, font: { size: 10 }, maxTicksLimit: 7 }
        }
      }
    }
  };

  const queryParams = new URLSearchParams({
    c: JSON.stringify(chartConfig),
    width: width.toString(),
    height: height.toString(),
    backgroundColor: PALETTE.bg,
    devicePixelRatio: '2',
  });

  return `${CHART_IMAGE_URL}?${queryParams}`;
}

export { generateChartImageUrl, generateCandlestickChart, generateComparisonChart };
