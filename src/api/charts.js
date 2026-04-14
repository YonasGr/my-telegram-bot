/**
 * Chart proxy — fetches rendered PNG from backend and returns it as a Blob
 * for direct upload to Telegram via multipart/form-data.
 */

import { API_URLS } from '../config/constants.js';

/**
 * Fetches a rendered chart PNG from the backend.
 * Returns a Blob that can be uploaded directly to Telegram sendPhoto.
 *
 * @param {Array}  prices   - [[timestamp_ms, price], ...]
 * @param {string} coinName - Display name for the coin
 * @param {number} days     - Timeframe in days (1, 7, 30)
 * @returns {Promise<Blob>} PNG image blob
 */
export async function fetchChartImage(prices, coinName, days = 7) {
  if (!prices || prices.length === 0) throw new Error('Price data is required');

  const params = new URLSearchParams({
    prices:   JSON.stringify(prices),
    coinName: coinName || 'Cryptocurrency',
    days:     days.toString(),
  });

  const response = await fetch(`${API_URLS.BACKEND_BASE}/api/chart/image?${params}`, {
    headers: { 'User-Agent': 'TelegramBot-Worker/2.0' },
  });

  if (!response.ok) {
    // Fallback: return null so caller can use QuickChart URL instead
    console.error(`Chart image fetch failed: ${response.status}`);
    return null;
  }

  return response.blob();
}

/**
 * Fallback: returns a QuickChart URL (no backend needed).
 * Used when the backend image endpoint is unavailable.
 *
 * @param {Array}  prices
 * @param {string} coinName
 * @param {number} days
 * @returns {string} QuickChart URL
 */
export function buildFallbackChartUrl(prices, coinName, days = 7) {
  if (!prices || prices.length === 0) throw new Error('Price data is required');

  const sampled = prices.length > 200
    ? prices.filter((_, i) => i % Math.ceil(prices.length / 200) === 0)
    : prices;

  const values = sampled.map(p => p[1]);
  const first  = values[0];
  const last   = values[values.length - 1];
  const pct    = ((last - first) / first) * 100;

  const formatP = (v) => {
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'k';
    if (v >= 1)   return '$' + v.toFixed(2);
    return '$' + v.toFixed(6);
  };

  const trend     = pct > 0.3 ? 'bull' : pct < -0.3 ? 'bear' : 'neutral';
  const lineColor = trend === 'bull' ? '#26a69a' : trend === 'bear' ? '#ef5350' : '#7b8ab8';
  const fillColor = trend === 'bull' ? 'rgba(38,166,154,0.1)' : trend === 'bear' ? 'rgba(239,83,80,0.1)' : 'rgba(123,138,184,0.1)';

  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const pad  = (maxV - minV) * 0.05 || last * 0.01;

  const n    = sampled.length;
  const step = Math.max(1, Math.floor(n / 6));
  const labels = sampled.map((p, i) => {
    if (i % step !== 0 && i !== n - 1) return '';
    const d = new Date(p[0]);
    return days <= 1
      ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

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
          text: `${coinName}  ·  ${days === 1 ? '24h' : days + 'd'}  ·  ${formatP(last)}  ·  ${(pct >= 0 ? '+' : '') + pct.toFixed(2) + '%'}`,
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
          ticks: { color: '#b2b5be', font: { size: 10 }, maxTicksLimit: 7 },
        },
      },
    },
  };

  const params = new URLSearchParams({
    c:               JSON.stringify(cfg),
    width:           '900',
    height:          '500',
    backgroundColor: '#131722',
    devicePixelRatio: '2',
  });

  return `https://quickchart.io/chart?${params}`;
}
