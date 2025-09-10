// ------------------------- Cloudflare Worker Telegram Bot -------------------------

const BINANCE_BACKEND_URL = 'https://my-telegram-bot-backend.onrender.com/binancep2p';
const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3';
const CHART_IMAGE_API = 'https://quickchart.io/chart';

// ------------------------- UTILITIES -------------------------

function escapeMarkdown(text) {
  if (typeof text !== 'string') return '';
  const escapeChars = '_*[]()~`>#+-=|{}.!';
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
    throw error;
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
    const response = await fetch(`${COINGECKO_API_URL}${endpoint}`);
    
    if (response.status === 429) {
      throw new Error('CoinGecko rate limit exceeded. Please try again in a minute.');
    }
    
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error fetching CoinGecko data:", error);
    throw error;
  }
}

// Predefined coin list to avoid excessive API calls
const POPULAR_COINS = {
  'btc': 'bitcoin',
  'eth': 'ethereum',
  'usdt': 'tether',
  'bnb': 'binancecoin',
  'ada': 'cardano',
  'xrp': 'ripple',
  'sol': 'solana',
  'doge': 'dogecoin',
  'dot': 'polkadot',
  'matic': 'matic-network',
  'trx': 'tron',
  'avax': 'avalanche-2',
  'link': 'chainlink',
  'atom': 'cosmos',
  'etc': 'ethereum-classic',
  'xlm': 'stellar',
  'icp': 'internet-computer',
  'fil': 'filecoin',
  'hbar': 'hedera-hashgraph',
  'near': 'near',
  'xtz': 'tezos'
};

async function searchCoinSymbol(symbol, env) {
  const normalizedSymbol = symbol.toLowerCase().trim();
  
  // First check popular coins
  if (POPULAR_COINS[normalizedSymbol]) {
    return { id: POPULAR_COINS[normalizedSymbol], symbol: normalizedSymbol };
  }
  
  // For less common coins, use cache with longer TTL
  return getWithCache(env, `coin_${normalizedSymbol}`, async () => {
    try {
      const data = await fetchCoinGeckoData('/coins/list');
      const matches = data.filter(coin => 
        coin.symbol.toLowerCase() === normalizedSymbol || 
        coin.id.toLowerCase() === normalizedSymbol
      );
      return matches.length > 0 ? matches[0] : null;
    } catch (error) {
      console.error(`Error searching for coin ${symbol}:`, error);
      return null;
    }
  }, 86400); // 24 hours cache
}

async function getCoinData(coinId, env) {
  return getWithCache(env, `coin_data_${coinId}`, async () => {
    return fetchCoinGeckoData(`/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`);
  }, 300);
}

async function getExchangeRates(env) {
  return getWithCache(env, 'exchange_rates', async () => {
    return fetchCoinGeckoData('/exchange_rates');
  }, 3600);
}

// ------------------------- MESSAGE FUNCTIONS -------------------------

async function sendMessage(chatId, text, parseMode, env) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      })
    });
    
    if (!response.ok) {
      console.error('Failed to send message:', await response.text());
    }
  } catch (error) {
    console.error('Error sending message:', error);
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
    message += `   ⭐️ *Orders:* ${advertiser.monthOrderCount} (${(advertiser.monthFinishRate * 100).toFixed(1)}% success)\n\n`;
  });

  message += `🔄 *Live data from Binance P2P*`;
  return message;
}

// ------------------------- COMMAND HANDLERS -------------------------

async function handleStart(chatId, env) {
  const welcomeMessage = `👋 *Welcome to Crypto Bot!*

I provide real-time cryptocurrency P2P trading rates and conversions.

*Available commands:*
/start - Show this welcome message
/p2p [asset] [fiat] [type] - Get P2P trading rates
/rate [amount] [currency] - Convert amount using rates
/sell [amount] - Calculate ETB for selling USDT
/convert [amount] [from] [to] - Convert between currencies
/help - Show help information

*Examples:*
/p2p USDT ETB BUY
/rate 100 USD
/sell 50
/convert 100 USDT ETB`;

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

async function handleRate(chatId, amount, currency, env) {
  if (isNaN(amount) || amount <= 0) {
    return await sendMessage(chatId, "❌ Please provide a valid amount.", 'Markdown', env);
  }

  try {
    await sendMessage(chatId, "⏳ Fetching rates...", 'Markdown', env);
    
    if (currency.toUpperCase() === 'USDT') {
      const data = await fetchP2PData('USDT', 'ETB', 'SELL', 10);
      if (!data?.data?.data || data.data.data.length < 5) {
        throw new Error("Not enough sell offers available");
      }
      
      const fifthOffer = data.data.data[4];
      const rate = parseFloat(fifthOffer.adv.price);
      const result = amount * rate;
      
      const message = `💱 *Rate Conversion*

*${amount} USDT* ≈ *${formatNumber(result)} ETB*

📊 *Rate:* 1 USDT = ${formatNumber(rate)} ETB
👤 *Based on 5th best offer from ${escapeMarkdown(fifthOffer.advertiser.nickName)}*

🔄 *Live P2P data from Binance*`;

      await sendMessage(chatId, message, 'Markdown', env);
    } else {
      await sendMessage(chatId, "❌ Currently only USDT to ETB conversion is supported for /rate command.", 'Markdown', env);
    }
  } catch (error) {
    console.error("Rate command error:", error);
    await sendMessage(chatId, "⚠️ Could not fetch rates. Please try again later.", 'Markdown', env);
  }
}

async function handleSell(chatId, amount, env) {
  if (isNaN(amount) || amount <= 0) {
    return await sendMessage(chatId, "❌ Please provide a valid amount.", 'Markdown', env);
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

📊 *Rate:* 1 USDT = ${formatNumber(rate)} ETB (5th best offer)
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
    return await sendMessage(chatId, "❌ Please provide a valid amount.", 'Markdown', env);
  }

  try {
    // For now, focus on USDT to ETB conversion to avoid CoinGecko rate limits
    if (fromCurrency.toUpperCase() !== 'USDT' || toCurrency.toUpperCase() !== 'ETB') {
      return await sendMessage(chatId, "❌ Currently only USDT to ETB conversion is supported.", 'Markdown', env);
    }

    await sendMessage(chatId, "⏳ Converting currencies...", 'Markdown', env);
    const data = await fetchP2PData('USDT', 'ETB', 'SELL', 10);
    
    if (!data?.data?.data || data.data.data.length === 0) {
      throw new Error("No conversion rates available");
    }
    
    const bestOffer = data.data.data[0];
    const rate = parseFloat(bestOffer.adv.price);
    const result = amount * rate;
    
    const message = `🔄 *Currency Conversion*

*${amount} USDT* ≈ *${formatNumber(result)} ETB*

📊 *Rate:* 1 USDT = ${formatNumber(rate)} ETB
👤 *Best offer from:* ${escapeMarkdown(bestOffer.advertiser.nickName)}

🔄 *Live P2P data from Binance*`;

    await sendMessage(chatId, message, 'Markdown', env);
  } catch (error) {
    console.error("Convert command error:", error);
    await sendMessage(chatId, "⚠️ Could not convert currencies. Please try again later.", 'Markdown', env);
  }
}

// ------------------------- MAIN HANDLER -------------------------

export default {
  async fetch(request, env, ctx) {
    console.log("Environment keys:", Object.keys(env));
    
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

      const isAllowed = await checkRateLimit(env, userId, 5, 60); // Reduced rate limit
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
      } else if (cmd === '/rate' && args.length >= 3) {
        await handleRate(chatId, parseFloat(args[1]), args[2], env);
      } else if (cmd === '/sell' && args.length >= 2) {
        await handleSell(chatId, parseFloat(args[1]), env);
      } else if (cmd === '/convert' && args.length >= 4) {
        await handleConvert(chatId, parseFloat(args[1]), args[2], args[3], env);
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