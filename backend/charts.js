/**
 * Server-side chart generation using chartjs-node-canvas
 * Renders TradingView-style financial charts as PNG images
 */

import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

// ─── Palette (TradingView dark theme) ────────────────────────────────────────
const THEME = {
  bg:           '#131722',
  bgPanel:      '#1e222d',
  grid:         'rgba(42,46,57,0.8)',
  border:       '#2a2e39',
  text:         '#b2b5be',
  textBright:   '#d1d4dc',
  bull:         '#26a69a',   // teal green
  bullFill:     'rgba(38,166,154,0.08)',
  bear:         '#ef5350',   // red
  bearFill:     'rgba(239,83,80,0.08)',
  neutral:      '#7b8ab8',
  neutralFill:  'rgba(123,138,184,0.08)',
  volume:       'rgba(120,123,134,0.3)',
  crosshair:    '#758696',
};

const WIDTH  = 900;
const HEIGHT = 500;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTrend(prices) {
  if (!prices || prices.length < 2) return 'neutral';
  const pct = ((prices[prices.length - 1][1] - prices[0][1]) / prices[0][1]) * 100;
  if (pct > 0.3)  return 'bull';
  if (pct < -0.3) return 'bear';
  return 'neutral';
}

function formatPrice(v) {
  if (v >= 1e6)  return '$' + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3)  return '$' + (v / 1e3).toFixed(1) + 'k';
  if (v >= 100)  return '$' + v.toFixed(2);
  if (v >= 1)    return '$' + v.toFixed(3);
  if (v >= 0.01) return '$' + v.toFixed(5);
  return '$' + v.toFixed(8);
}

function formatPct(v) {
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}

/**
 * Generates smart time labels — sparse, clean, no overlap
 */
function buildLabels(timestamps, days) {
  const n = timestamps.length;
  if (n === 0) return [];

  // Target ~6 visible labels
  const target = 6;
  const step = Math.max(1, Math.floor(n / target));

  return timestamps.map((ts, i) => {
    if (i % step !== 0 && i !== n - 1) return '';
    const d = new Date(ts);
    if (days <= 1) {
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
}

/**
 * Downsample price array to at most maxPoints entries
 */
function downsample(prices, maxPoints = 300) {
  if (prices.length <= maxPoints) return prices;
  const factor = Math.ceil(prices.length / maxPoints);
  return prices.filter((_, i) => i % factor === 0 || i === prices.length - 1);
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Renders a financial area chart and returns a PNG Buffer
 * @param {Array} prices  - [[timestamp_ms, price], ...]
 * @param {string} coinName
 * @param {number} days
 * @returns {Promise<Buffer>} PNG image buffer
 */
export async function renderChartImage(prices, coinName, days = 7) {
  if (!prices || prices.length === 0) throw new Error('Price data required');

  const sampled = downsample(prices, 300);
  const values  = sampled.map(p => p[1]);
  const labels  = buildLabels(sampled.map(p => p[0]), days);

  const trend    = getTrend(prices);
  const lineColor = trend === 'bull' ? THEME.bull : trend === 'bear' ? THEME.bear : THEME.neutral;
  const fillColor = trend === 'bull' ? THEME.bullFill : trend === 'bear' ? THEME.bearFill : THEME.neutralFill;

  const first   = prices[0][1];
  const last    = prices[prices.length - 1][1];
  const pct     = ((last - first) / first) * 100;
  const minVal  = Math.min(...values);
  const maxVal  = Math.max(...values);
  const padding = (maxVal - minVal) * 0.05 || last * 0.01;

  const timeLabel = days === 1 ? '24h' : `${days}d`;
  const titleText = `${coinName}  ·  ${timeLabel}  ·  ${formatPrice(last)}  ·  ${formatPct(pct)}`;

  const canvas = new ChartJSNodeCanvas({
    width: WIDTH,
    height: HEIGHT,
    backgroundColour: THEME.bg,
  });

  const config = {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: lineColor,
        backgroundColor: (ctx) => {
          // Vertical gradient fill
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, HEIGHT);
          gradient.addColorStop(0, lineColor.replace(')', ', 0.25)').replace('rgb', 'rgba'));
          gradient.addColorStop(1, lineColor.replace(')', ', 0.0)').replace('rgb', 'rgba'));
          // For hex colors, use the theme fill directly
          return fillColor;
        },
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 0,
        borderWidth: 2,
      }],
    },
    options: {
      animation: false,
      responsive: false,
      layout: {
        padding: { top: 16, right: 16, bottom: 8, left: 8 },
      },
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: titleText,
          color: THEME.textBright,
          font: { size: 14, weight: 'bold', family: "'Courier New', monospace" },
          padding: { top: 8, bottom: 12 },
        },
      },
      scales: {
        x: {
          grid: {
            color: THEME.grid,
            drawBorder: false,
            drawTicks: false,
          },
          ticks: {
            color: THEME.text,
            font: { size: 10 },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 7,
          },
          border: { color: THEME.border },
        },
        y: {
          position: 'right',
          min: minVal - padding,
          max: maxVal + padding,
          grid: {
            color: THEME.grid,
            drawBorder: false,
            drawTicks: false,
          },
          ticks: {
            color: THEME.text,
            font: { size: 10, family: "'Courier New', monospace" },
            maxTicksLimit: 7,
            callback: (v) => formatPrice(v),
          },
          border: { color: THEME.border },
        },
      },
    },
  };

  return canvas.renderToBuffer(config);
}

/**
 * Legacy URL-based chart (QuickChart fallback) — kept for compatibility
 * Returns a QuickChart URL string (not a buffer)
 */
export function generateChartImageUrl(prices, coinName, days = 7) {
  if (!prices || prices.length === 0) throw new Error('Price data required');

  const sampled = downsample(prices, 200);
  const values  = sampled.map(p => p[1]);
  const labels  = buildLabels(sampled.map(p => p[0]), days);

  const trend     = getTrend(prices);
  const lineColor = trend === 'bull' ? '#26a69a' : trend === 'bear' ? '#ef5350' : '#7b8ab8';
  const fillColor = trend === 'bull' ? 'rgba(38,166,154,0.1)' : trend === 'bear' ? 'rgba(239,83,80,0.1)' : 'rgba(123,138,184,0.1)';

  const first = prices[0][1];
  const last  = prices[prices.length - 1][1];
  const pct   = ((last - first) / first) * 100;
  const minV  = Math.min(...values);
  const maxV  = Math.max(...values);
  const pad   = (maxV - minV) * 0.05 || last * 0.01;

  const cfg = {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: lineColor,
        backgroundColor: fillColor,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
      }],
    },
    options: {
      animation: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `${coinName}  ·  ${days === 1 ? '24h' : days + 'd'}  ·  ${formatPrice(last)}  ·  ${formatPct(pct)}`,
          color: '#d1d4dc',
          font: { size: 14, weight: 'bold' },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(42,46,57,0.8)' },
          ticks: { color: '#b2b5be', font: { size: 10 }, maxTicksLimit: 7 },
        },
        y: {
          position: 'right',
          min: minV - pad,
          max: maxV + pad,
          grid: { color: 'rgba(42,46,57,0.8)' },
          ticks: { color: '#b2b5be', font: { size: 10 }, maxTicksLimit: 7, callback: (v) => formatPrice(v) },
        },
      },
    },
  };

  const params = new URLSearchParams({
    c: JSON.stringify(cfg),
    width: '900',
    height: '500',
    backgroundColor: '#131722',
    devicePixelRatio: '2',
  });

  return `https://quickchart.io/chart?${params}`;
}
