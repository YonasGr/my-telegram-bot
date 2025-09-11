// ------------------------- Cloudflare Worker Telegram Bot -------------------------

const BINANCE_BACKEND_URL = 'https://my-telegram-bot-backend.onrender.com/binancep2p';
const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3';
const CHART_IMAGE_API = 'https://quickchart.io/chart'; // For generating chart images

// ------------------------- UTILITIES -------------------------

function escapeMarkdown(text) {
  if (typeof text !== 'string') return '';
  const escapeChars = '_*[]()~`>#+-=|{}.!';
  return text.split('').map(c => escapeChars.includes(c) ? '\\' + c : c).join('');
}

function escapeMarkdownV2(text) {
  if (typeof text !== 'string') return '';
  const escapeChars = '_*[]()~`>#+-=|{}.!\\';
  return text.split('').map(c => escapeChars.includes(c) ? '\\' + c : c).join('');
}

function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return 'N/A';
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatLargeNumber(num) {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toString();
}

// ------------------------- CACHING & RATE LIMITING -------------------------

async function checkRateLimit(env, identifier, limit = 10, windowSeconds = 60) {
  try {
    const key = `rate_limit_${identifier}`;
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - windowSeconds;

    const recentRequests = await env.BOT_CACHE.get(key);
    let requests = recentRequests ? JSON.parse(recentRequests) : [];

    requests = requests.filter(timestamp => timestamp > windowStart);

    if (requests.length >= limit) return false;

    requests.push(now);
    await env.BOT_CACHE.put(key, JSON.stringify(requests), { expirationTtl: windowSeconds });

    return true;
  } catch (error) {
    console.error("Rate limiting error:", error);
    return true;
  }
}

async function getWithCache(env, key, fetchFunction, ttl = 300) {
  try {
    const cached = await env.BOT_CACHE.get(key);
    if (cached) return JSON.parse(cached);

    const data = await fetchFunction();
    await env.BOT_CACHE.put(key, JSON.stringify(data), { expirationTtl: ttl });
    return data;
  } catch (error) {
    console.error(`Cache error for key ${key}:`, error);
    return await fetchFunction();
  }
}

// ------------------------- API FUNCTIONS -------------------------

async function fetchP2PData(asset = 'USDT', fiat = 'ETB', tradeType = 'BUY', rows = 10, page = 1) {
  try {
    const response = await fetch(BINANCE_BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset, fiat, tradeType, rows, page })
    });

    if (!response.ok) throw new Error(`Backend API error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error("Error fetching P2P data:", error);
    throw new Error("Could not fetch P2P data");
  }
}

async function fetchCoinGeckoData(endpoint) {
  try {
    // Add a small delay to respect the rate limit (e.g., 2-3 seconds)
    await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds delay

    const response = await fetch(`${COINGECKO_API_URL}${endpoint}`);
    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("CoinGecko API rate limit exceeded. Please try again in a minute.");
      }
      throw new Error(`CoinGecko API error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching CoinGecko data:", error);
    throw new Error("Could not fetch coin data. The API is likely busy.");
  }
}

async function searchCoinSymbol(symbol, env) {
  return getWithCache(env, `coin_search_${symbol.toLowerCase()}`, async () => {
    const data = await fetchCoinGeckoData('/coins/list');
    const matches = data.filter(coin =>
      coin.symbol.toLowerCase() === symbol.toLowerCase() ||
      coin.id.toLowerCase() === symbol.toLowerCase()
    );
    return matches.length > 0 ? matches[0] : null;
  }, 86400); // Cached for 24 hours
}

async function getCoinData(coinId, env) {
  return getWithCache(env, `coin_data_${coinId}`, async () => {
    return fetchCoinGeckoData(`/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`);
  }, 3600); // Cached for 1 hour
}

async function getCoinMarketChart(coinId, days = 7, env) {
  return getWithCache(env, `coin_chart_${coinId}_${days}`, async () => {
    return fetchCoinGeckoData(`/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`);
  }, 3600); // Cached for 1 hour
}

async function getMultipleCoinPrices(coinIds, vsCurrencies, env) {
  const coinIdString = coinIds.join(',');
  const vsCurrencyString = vsCurrencies.join(',');
  const cacheKey = `simple_prices_${coinIdString}_${vsCurrencyString}`;
  return getWithCache(env, cacheKey, async () => {
    const response = await fetch(`${COINGECKO_API_URL}/simple/price?ids=${coinIdString}&vs_currencies=${vsCurrencyString}`);
    if (!response.ok) {
        if (response.status === 429) {
            throw new Error("CoinGecko API rate limit exceeded. Please try again in a minute.");
        }
        throw new Error(`CoinGecko API error: ${response.status}`);
    }
    const data = await response.json();
    return data;
  }, 60); // Cached for a short time to keep rates fresh
}


// ------------------------- MESSAGE FUNCTIONS -------------------------

async function sendMessage(chatId, text, parseMode, env, replyMarkup = null) {
  try {
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    };

    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }

    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error('Failed to send message:', await response.text());
    }
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

async function sendPhoto(chatId, photoUrl, caption, env, parseMode = 'Markdown') {
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        caption: caption,
        parse_mode: parseMode
      })
    });

    if (!response.ok) {
      console.error('Failed to send photo:', await response.text());
    }
  } catch (error) {
    console.error('Error sending photo:', error);
  }
}

function formatP2PResponse(data, asset, fiat, tradeType) {
  if (!data?.data?.data || data.data.data.length === 0) {
    return `❌ No ${tradeType} ads found for ${asset}/${fiat}`;
  }

  let message = `💰 *Binance P2P ${tradeType} ${asset} for ${fiat}*\n\n`;

  data.data.data.slice(0, 5).forEach((ad, index) => {
    const advertiser = ad.advertiser;
    const adv = ad.adv;

    message += `*${index + 1}. ${escapeMarkdown(advertiser.nickName)}*\n`;
    message += `   💵 *Price:* ${adv.price} ${fiat}\n`;
    message += `   📦 *Available:* ${adv.surplusAmount} ${asset}\n`;
    message += `   📊 *Limits:* ${adv.minSingleTransAmount} - ${adv.maxSingleTransAmount} ${fiat}\n`;
    message += `   ⭐️ *Orders:* ${advertiser.monthOrderCount} (${(advertiser.monthFinishRate * 100).toFixed(1)}% success)\n`;

    if (adv.tradeMethods?.length > 0) {
      message += `   🏦 *Methods:* ${adv.tradeMethods.map(m => m.tradeMethodName).join(", ")}\n`;
    }

    message += "\n";
  });

  message += `🔄 *Live data from Binance P2P*`;
  return message;
}

function generateChartImageUrl(prices, coinName) {
  const chartData = prices.map(price => price[1]);
  const labels = Array.from({ length: prices.length }, (_, i) => '');

  const chartConfig = {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: `${coinName} Price (USD)`,
        data: chartData,
        borderColor: '#00ff88',
        backgroundColor: 'rgba(0, 255, 136, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `${coinName} 7-Day Price Chart`,
          font: { size: 16 }
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          grid: { color: 'rgba(255, 255, 255, 0.1)' }
        },
        x: { display: false }
      }
    }
  };

  return `${CHART_IMAGE_API}?c=${encodeURIComponent(JSON.stringify(chartConfig))}&width=800&height=400&backgroundColor=rgba(17,17,17,0.9)`;
}

// ------------------------- COMMAND HANDLERS -------------------------

async function handleStart(chatId, env) {
  const welcomeMessage = `👋 *Welcome to Crypto Bot!*

I provide real-time cryptocurrency data, P2P trading rates, and conversions.

*Available commands:*
/p2p [asset] [fiat] [type] - Get P2P trading rates
/rate [amount] [currency] - Convert amount using real-time rates
/sell [amount] - Calculate ETB for selling crypto
/convert [amount] [from] [to] - Convert between any cryptocurrencies
/coin [symbol] - Get detailed market information with charts
/help - Show help information

*Examples:*
/p2p USDT ETB BUY
/rate 100 BTC
/sell 50
/convert 100 ETH ADA
/coin bitcoin


AUTHOR: @x\\_Jonah CHANNEL: @Jonah\\_Notice`;

  await sendMessage(chatId, welcomeMessage, 'Markdown', env);
}

async function handleP2P(chatId, args, env) {
  try {
    let asset = "USDT", fiat = "ETB", tradeType = "BUY", rows = 10;

    for (let i = 1; i < args.length; i++) {
      const param = args[i].toUpperCase();
      if (param === "BUY" || param === "SELL") tradeType = param;
      else if (["USDT", "BTC", "ETH", "BNB", "BUSD"].includes(param)) asset = param;
      else if (["ETB", "USD", "EUR", "GBP", "NGN", "KES", "GHS"].includes(param)) fiat = param;
      else if (!isNaN(parseInt(param)) && parseInt(param) > 0) rows = Math.min(parseInt(param), 20);
    }

    await sendMessage(chatId, "⏳ Fetching P2P data...", 'Markdown', env);
    const data = await fetchP2PData(asset, fiat, tradeType, rows);
    const response = formatP2PResponse(data, asset, fiat, tradeType);
    await sendMessage(chatId, response, 'Markdown', env);

  } catch (error) {
    console.error("P2P command error:", error);
    await sendMessage(chatId, "❌ Error fetching P2P data. Please try again later.", 'Markdown', env);
  }
}

async function handleRate(chatId, args, env) {
  const amount = parseFloat(args[1]);
  const currency = (args[2] || 'USDT').toUpperCase();
  const vsCurrency = (args[3] || 'USD').toUpperCase();
  
  if (isNaN(amount) || amount <= 0) {
    return await sendMessage(chatId, "❌ Please provide a valid amount (number greater than 0).", 'Markdown', env);
  }

  // Check if vsCurrency is a P2P fiat
  const p2pFiats = ['ETB', 'USD', 'EUR', 'GBP', 'NGN', 'KES', 'GHS'];
  if (p2pFiats.includes(vsCurrency)) {
    // This is a P2P rate request, not a standard CoinGecko rate
    return handleP2PRate(chatId, amount, currency, vsCurrency, env);
  }

  // Logic for standard crypto-to-crypto/fiat conversion via CoinGecko
  try {
    await sendMessage(chatId, `⏳ Fetching real-time rate for ${amount} ${currency}...`, 'Markdown', env);
    const coinData = await searchCoinSymbol(currency, env);
    if (!coinData) {
      return await sendMessage(chatId, `❌ Could not find currency: ${currency}`, 'Markdown', env);
    }

    const prices = await getMultipleCoinPrices([coinData.id], [vsCurrency.toLowerCase()], env);
    const price = prices?.[coinData.id]?.[vsCurrency.toLowerCase()];

    if (price === undefined) {
        throw new Error(`Could not get price for ${currency}/${vsCurrency}.`);
    }

    const result = amount * price;
    const message = `💱 *Real-time Rate Conversion*\n\n*${amount} ${currency}* ≈ *${formatNumber(result, vsCurrency === 'USD' ? 2 : 6)} ${vsCurrency}*\n\n📊 *Current Price:* 1 ${currency} = ${formatNumber(price, 6)} ${vsCurrency}\n\n🔄 *Live data from CoinGecko*`;

    await sendMessage(chatId, message, 'Markdown', env);

  } catch (error) {
    console.error("Rate command error:", error);
    await sendMessage(chatId, "⚠️ Could not fetch rates. Please check your command and try again later.", 'Markdown', env);
  }
}


async function handleSell(chatId, amount, env) {
  if (isNaN(amount) || amount <= 0) {
    return await sendMessage(chatId, "❌ Please provide a valid amount (number greater than 0).", 'Markdown', env);
  }

  try {
    await sendMessage(chatId, "⏳ Calculating best sell rate...", 'Markdown', env);
    const data = await fetchP2PData('USDT', 'ETB', 'SELL', 20);

    if (!data?.data?.data || data.data.data.length < 5) {
      return await sendMessage(chatId, "❌ Not enough sell offers available.", 'Markdown', env);
    }

    const fifthOffer = data.data.data[4];
    const rate = parseFloat(fifthOffer.adv.price);
    const totalETB = amount * rate;

    const message = `💰 *USDT → ETB Conversion*

*Selling ${amount} USDT* ≈ *${formatNumber(totalETB)} ETB*

📊 *Rate used:* 1 USDT = ${formatNumber(rate)} ETB (5th best offer)
👤 *Trader:* ${escapeMarkdown(fifthOffer.advertiser.nickName)}
⭐️ *Reputation:* ${fifthOffer.advertiser.monthOrderCount} orders, ${(fifthOffer.advertiser.monthFinishRate * 100).toFixed(1)}% success

🔄 *Live P2P data from Binance*`;

    await sendMessage(chatId, message, 'Markdown', env);
  } catch (error) {
    console.error("Sell command error:", error);
    await sendMessage(chatId, "⚠️ Could not calculate sell rate. Please try again later.", 'Markdown', env);
  }
}

async function handleConvert(chatId, amount, fromCurrency, toCurrency, env) {
  if (isNaN(amount) || amount <= 0) {
    return await sendMessage(chatId, "❌ Please provide a valid amount (number greater than 0).", 'Markdown', env);
  }

  try {
    await sendMessage(chatId, "⏳ Converting currencies...", 'Markdown', env);

    const fromSymbol = fromCurrency.toLowerCase();
    const toSymbol = toCurrency.toLowerCase();

    let fromPriceUSD, toPriceUSD;

    // --- LOGIC FOR ETB/P2P RATES ---
    if (fromSymbol === 'etb') {
      const p2pData = await fetchP2PData('USDT', 'ETB', 'BUY', 1);
      if (!p2pData?.data?.data?.[0]) throw new Error('Could not fetch ETB P2P rate.');
      fromPriceUSD = 1 / parseFloat(p2pData.data.data[0].adv.price);
    }
    if (toSymbol === 'etb') {
      const p2pData = await fetchP2PData('USDT', 'ETB', 'SELL', 1);
      if (!p2pData?.data?.data?.[0]) throw new Error('Could not fetch ETB P2P rate.');
      toPriceUSD = parseFloat(p2pData.data.data[0].adv.price);
    }

    // --- LOGIC FOR COINGECKO RATES ---
    const coinIdsToFetch = [];
    let fromCoinId, toCoinId;

    if (fromPriceUSD === undefined) {
      const fromCoin = await searchCoinSymbol(fromSymbol, env);
      if (!fromCoin) throw new Error(`Unknown currency: ${fromCurrency}`);
      fromCoinId = fromCoin.id;
      coinIdsToFetch.push(fromCoinId);
    }
    if (toPriceUSD === undefined) {
      const toCoin = await searchCoinSymbol(toSymbol, env);
      if (!toCoin) throw new Error(`Unknown currency: ${toCurrency}`);
      toCoinId = toCoin.id;
      if (fromCoinId !== toCoinId) {
        coinIdsToFetch.push(toCoinId);
      }
    }
    
    // Fallback for USD/EUR/GBP
    const simplePricesToFetch = [];
    if (fromCoinId === 'usd' || fromCoinId === 'eur' || fromCoinId === 'gbp') fromPriceUSD = 1;
    if (toCoinId === 'usd' || toCoinId === 'eur' || toCoinId === 'gbp') toPriceUSD = 1;


    if (coinIdsToFetch.length > 0) {
      const prices = await getMultipleCoinPrices(coinIdsToFetch, ['usd'], env);
      if (!prices || Object.keys(prices).length === 0) {
        throw new Error('Failed to get crypto prices.');
      }
      
      if (fromPriceUSD === undefined) fromPriceUSD = prices[fromCoinId]?.usd;
      if (toPriceUSD === undefined) toPriceUSD = prices[toCoinId]?.usd;
    }

    // --- FINAL SANITY CHECK ---
    if (fromPriceUSD === undefined || toPriceUSD === undefined) {
      throw new Error(`Could not find prices for ${fromCurrency} or ${toCurrency}.`);
    }

    const result = (amount * fromPriceUSD) / toPriceUSD;

    const message = `🔄 *Currency Conversion*\n\n*${amount} ${fromCurrency.toUpperCase()}* ≈ *${formatNumber(result, 6)} ${toCurrency.toUpperCase()}*\n\n📊 *Conversion Rate:* 1 ${fromCurrency.toUpperCase()} = ${formatNumber(fromPriceUSD/toPriceUSD, 6)} ${toCurrency.toUpperCase()}\n💰 *USD Values:*\n   - 1 ${fromCurrency.toUpperCase()} = $${formatNumber(fromPriceUSD, 6)}\n   - 1 ${toCurrency.toUpperCase()} = $${formatNumber(toPriceUSD, 6)}\n\n🔄 *Real-time data from multiple sources*`;

    await sendMessage(chatId, message, 'Markdown', env);
  } catch (error) {
    console.error("Convert command error:", error);
    await sendMessage(chatId, `⚠️ Could not convert currencies. Error: ${error.message}`, 'Markdown', env);
  }
}

async function handleCoin(chatId, coinSymbol, env) {
  if (!coinSymbol) {
    return await sendMessage(chatId, "❌ Please provide a coin symbol (e.g., /coin btc)", 'Markdown', env);
  }

  try {
    await sendMessage(chatId, "⏳ Fetching coin data and generating chart...", 'Markdown', env);

    const coinData = await searchCoinSymbol(coinSymbol, env);
    if (!coinData) {
      return await sendMessage(chatId, `❌ Could not find coin: ${coinSymbol}`, 'Markdown', env);
    }

    const [detailedData, marketChart] = await Promise.all([
      getCoinData(coinData.id, env),
      getCoinMarketChart(coinData.id, 7, env)
    ]);

    const marketData = detailedData.market_data;
    const currentPrice = marketData.current_price.usd;
    const priceChange24h = marketData.price_change_percentage_24h;
    const marketCap = marketData.market_cap.usd;
    const volume24h = marketData.total_volume.usd;

    // Generate chart
    const chartUrl = generateChartImageUrl(marketChart.prices, coinData.name);

    const message = `🪙 *${coinData.name} (${coinData.symbol.toUpperCase()})*

💰 *Price:* $${formatNumber(currentPrice, 6)}
📈 *24h Change:* ${priceChange24h >= 0 ? '🟢' : '🔴'} ${priceChange24h.toFixed(2)}%
🏆 *Market Cap Rank:* #${detailedData.market_cap_rank}

📊 *Market Stats:*
• Market Cap: $${formatLargeNumber(marketCap)}
• 24h Volume: $${formatLargeNumber(volume24h)}
• Circulating Supply: ${formatLargeNumber(marketData.circulating_supply || 0)} ${coinData.symbol.toUpperCase()}

🔗 *Links:*
[CoinGecko](https://www.coingecko.com/en/coins/${coinData.id}) | [Website](${detailedData.links.homepage[0] || '#'})

🔄 *Live data from CoinGecko*`;

    // Send chart with caption
    await sendPhoto(chatId, chartUrl, message, env, 'Markdown');

  } catch (error) {
    console.error("Coin command error:", error);
    await sendMessage(chatId, "⚠️ Could not fetch coin data. Please try again later.", 'Markdown', env);
  }
}

async function handleP2PRate(chatId, amount, asset, fiat, env) {
  try {
    await sendMessage(chatId, `⏳ Fetching P2P rates for ${amount} ${asset} in ${fiat}...`, 'Markdown', env);

    const tradeType = "BUY"; // Assume BUY because we're converting from fiat to crypto
    const rows = 10;
    
    // Correctly handle the case for converting from fiat to crypto
    const data = await fetchP2PData(asset, fiat, tradeType, rows);

    if (!data?.data?.data || data.data.data.length < 5) {
      return await sendMessage(chatId, `❌ Not enough ${tradeType} offers found for ${asset}/${fiat}.`, 'Markdown', env);
    }
    
    const firstAd = data.data.data[0];
    const rate = parseFloat(firstAd.adv.price);
    const result = amount / rate;
    
    const message = `💰 *P2P Rate Calculation*\n\n` +
      `*Buying ${formatNumber(amount, 2)} ${asset}* ≈ *${formatNumber(result, 6)} ${fiat}*\n\n` +
      `📊 *Rate used:* 1 ${asset} = ${formatNumber(rate)} ${fiat} (Best offer)\n` +
      `👤 *Trader:* ${escapeMarkdown(firstAd.advertiser.nickName)}\n` +
      `⭐️ *Reputation:* ${firstAd.advertiser.monthOrderCount} orders, ${(firstAd.advertiser.monthFinishRate * 100).toFixed(1)}% success\n\n` +
      `🔄 *Live P2P data from Binance*`;

    await sendMessage(chatId, message, 'Markdown', env);

  } catch (error) {
    console.error("P2P Rate command error:", error);
    await sendMessage(chatId, "⚠️ Could not calculate the P2P rate. Please check your command and try again later.", 'Markdown', env);
  }
}

// ------------------------- MAIN HANDLER -------------------------

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'POST' && path === '/binancep2p') {
      try {
        const backendResponse = await fetch(BINANCE_BACKEND_URL, {
          method: "POST",
          headers: request.headers,
          body: request.body,
        });
        return new Response(backendResponse.body, {
          status: backendResponse.status,
          headers: backendResponse.headers,
        });
      } catch (error) {
        return new Response("Error connecting to backend", { status: 502 });
      }
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const body = await request.json();
      const chatId = body.message?.chat?.id;
      const text = body.message?.text || '';
      const userId = body.message?.from?.id;

      if (!chatId || !text || !userId) return new Response('ok');

      const isAllowed = await checkRateLimit(env, userId, 10, 60);
      if (!isAllowed) {
        await sendMessage(chatId, "⚠️ Too many requests. Please wait a minute.", 'Markdown', env);
        return new Response('ok');
      }

      const args = text.trim().split(/\s+/);
      const cmd = args[0].toLowerCase();

      if (cmd === '/start' || cmd === '/help') {
        await handleStart(chatId, env);
      } else if (cmd === '/p2p') {
        await handleP2P(chatId, args, env);
      } else if (cmd === '/rate' && args.length >= 2) {
        await handleRate(chatId, args, env);
      } else if (cmd === '/sell' && args.length >= 2) {
        await handleSell(chatId, parseFloat(args[1]), env);
      } else if (cmd === '/convert' && args.length >= 4) {
        await handleConvert(chatId, parseFloat(args[1]), args[2], args[3], env);
      } else if (cmd === '/coin' && args.length >= 2) {
        await handleCoin(chatId, args[1], env);
      } else {
        await sendMessage(chatId, "Unknown command. Use /start for help.", 'Markdown', env);
      }

      return new Response('ok');
    } catch (e) {
      console.error("Request handling error:", e);
      return new Response('Error processing request', { status: 500 });
    }
  }
};