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
        await new Promise(resolve => setTimeout(resolve, 5000)); // 2.5 seconds delay
        
        const response = await fetch(`${COINGECKO_API_URL}${endpoint}`);
        if (!response.ok) {
            // Check for specific 429 error and throw a more specific error
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
  }, 86400);
}

// A longer TTL to reduce API calls
async function getCoinData(coinId, env) {
  return getWithCache(env, `coin_data_${coinId}`, async () => {
    return fetchCoinGeckoData(`/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`);
  }, 3600); // Changed from 300 to 1800 seconds (30 minutes)
}

async function getCoinMarketChart(coinId, days = 7, env) {
  return getWithCache(env, `coin_chart_${coinId}_${days}`, async () => {
    return fetchCoinGeckoData(`/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`);
  }, 3600); // Changed from 600 to 1800 seconds (30 minutes)
}

async function getExchangeRates(env) {
  return getWithCache(env, 'exchange_rates', async () => {
    return fetchCoinGeckoData('/exchange_rates');
  }, 3600);
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
    message += `   💵 *Price:* ${adv.price} ${fiat}\n`;
    message += `   📦 *Available:* ${adv.surplusAmount} ${asset}\n`;
    message += `   📊 *Limits:* ${adv.minSingleTransAmount} - ${adv.maxSingleTransAmount} ${fiat}\n`;
    message += `   ⭐️ *Orders:* ${advertiser.monthOrderCount} (${(advertiser.monthFinishRate * 100).toFixed(1)}% success)\n`;
    
    if (adv.tradeMethods?.length > 0) {
      message += `   🏦 *Methods:* ${adv.tradeMethods.map(m => m.tradeMethodName).join(", ")}\n`;
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
  const asset = (args[2] || '').toUpperCase();
  const fiat = (args[3] || '').toUpperCase();

  if (isNaN(amount) || amount <= 0) {
    return await sendMessage(chatId, "❌ Please provide a valid amount (number greater than 0).", 'Markdown', env);
  }

  // --- NEW LOGIC: Check if a fiat is provided for P2P lookup ---
  const p2pFiats = ['ETB', 'USD', 'EUR', 'GBP', 'NGN', 'KES', 'GHS']; // Same list as backend
  if (p2pFiats.includes(fiat)) {
    // This is a P2P request, handle it separately
    return handleP2PRate(chatId, amount, asset, fiat, env);
  }
  // --- END OF NEW LOGIC ---

  // Existing logic for CoinGecko lookup (if no fiat is provided)
  try {
    await sendMessage(chatId, "⏳ Fetching real-time rates...", 'Markdown', env);
    const coinData = await searchCoinSymbol(asset, env);
    if (!coinData) {
      return await sendMessage(chatId, `❌ Could not find currency: ${asset}`, 'Markdown', env);
    }
    
    const detailedData = await getCoinData(coinData.id, env);
    const price = detailedData.market_data.current_price.usd;
    const result = amount * price;
    
    // ... (rest of the message formatting for CoinGecko) ...
    const message = `💱 *Real-time Rate Conversion*\n\n*${amount} ${coinData.symbol.toUpperCase()}* ≈ *$${formatNumber(result, 2)}*\n\n📊 *Current Price:* $${formatNumber(price, 6)} USD\n📈 *24h Change:* ${detailedData.market_data.price_change_percentage_24h.toFixed(2)}%\n🔄 *Market Cap Rank:* #${detailedData.market_cap_rank}\n\n🔄 *Live data from CoinGecko*`;
    
    await sendMessage(chatId, message, 'Markdown', env);
  } catch (error) {
    console.error("Rate command error:", error);
    await sendMessage(chatId, "⚠️ Could not fetch rates. Please try again later.", 'Markdown', env);
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
    
    // Handle special case for fiat currencies
    const fiatCurrencies = ['ETB', 'USD', 'EUR', 'GBP'];
    const fromIsFiat = fiatCurrencies.includes(fromCurrency.toUpperCase());
    const toIsFiat = fiatCurrencies.includes(toCurrency.toUpperCase());
    
    let fromPrice = 1, toPrice = 1;
    
    if (!fromIsFiat) {
      const fromCoin = await searchCoinSymbol(fromCurrency, env);
      if (!fromCoin) throw new Error(`Unknown currency: ${fromCurrency}`);
      const fromData = await getCoinData(fromCoin.id, env);
      fromPrice = fromData.market_data.current_price.usd;
    }
    
    if (!toIsFiat) {
      const toCoin = await searchCoinSymbol(toCurrency, env);
      if (!toCoin) throw new Error(`Unknown currency: ${toCurrency}`);
      const toData = await getCoinData(toCoin.id, env);
      toPrice = toData.market_data.current_price.usd;
    }
    
    // Handle ETB separately (need to get from P2P)
    if (fromCurrency.toUpperCase() === 'ETB') {
      const p2pData = await fetchP2PData('USDT', 'ETB', 'BUY', 5);
      if (p2pData?.data?.data?.length > 0) {
        fromPrice = 1 / parseFloat(p2pData.data.data[0].adv.price);
      }
    } else if (toCurrency.toUpperCase() === 'ETB') {
      const p2pData = await fetchP2PData('USDT', 'ETB', 'SELL', 5);
      if (p2pData?.data?.data?.length > 0) {
        toPrice = parseFloat(p2pData.data.data[0].adv.price);
      }
    }
    
    const result = (amount * fromPrice) / toPrice;
    
    const message = `🔄 *Currency Conversion*

*${amount} ${fromCurrency.toUpperCase()}* ≈ *${formatNumber(result, 6)} ${toCurrency.toUpperCase()}*

📊 *Conversion Rate:* 1 ${fromCurrency.toUpperCase()} = ${formatNumber(fromPrice/toPrice, 6)} ${toCurrency.toUpperCase()}
💰 *USD Values:* 
   - 1 ${fromCurrency.toUpperCase()} = $${formatNumber(fromPrice, fromIsFiat ? 2 : 6)}
   - 1 ${toCurrency.toUpperCase()} = $${formatNumber(toPrice, toIsFiat ? 2 : 6)}

🔄 *Real-time data from multiple sources*`;

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
    
    const tradeType = "SELL"; // You want to sell crypto to get fiat
    const rows = 10; // Fetch enough ads to find the 5th one
    
    const data = await fetchP2PData(asset, fiat, tradeType, rows);

    if (!data?.data?.data || data.data.data.length < 5) {
      return await sendMessage(chatId, `❌ Not enough ${tradeType} offers found for ${asset}/${fiat}.`, 'Markdown', env);
    }
    
    // Get the 5th P2P ad
    const fifthAd = data.data.data[4];
    const rate = parseFloat(fifthAd.adv.price);
    const totalFiatAmount = amount * rate;
    
    const message = `💰 *P2P Rate Calculation*\n\n` +
                    `*Selling ${formatNumber(amount, 2)} ${asset}* ≈ *${formatNumber(totalFiatAmount)} ${fiat}*\n\n` +
                    `📊 *Rate used:* 1 ${asset} = ${formatNumber(rate)} ${fiat} (5th best offer)\n` +
                    `👤 *Trader:* ${escapeMarkdown(fifthAd.advertiser.nickName)}\n` +
                    `⭐️ *Reputation:* ${fifthAd.advertiser.monthOrderCount} orders, ${(fifthAd.advertiser.monthFinishRate * 100).toFixed(1)}% success\n\n` +
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
    // ... (rest of the code)

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
        // Correctly passes the whole args array to handleRate
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