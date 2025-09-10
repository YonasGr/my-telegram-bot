// ------------------------- Cloudflare Worker Telegram Bot (ES Modules) -------------------------

const BINANCE_P2P_URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
const COINGECKO_COINS_LIST_URL = 'https://api.coingecko.com/api/v3/coins/list';
const COINGECKO_COIN_URL = 'https://api.coingecko.com/api/v3/coins/';
const COINGECKO_PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price';

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

function formatNumber(value) {
  if (value === null || value === undefined || isNaN(value)) return 'N/A';
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function sendMessage(chatId, text, parseMode = 'Markdown', env) {
  try {
    const botToken = env.TELEGRAM_BOT_TOKEN;
    
    if (!botToken) {
      console.error("No Telegram bot token found in environment variables");
      throw new Error("Bot token not configured");
    }
    
    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        chat_id: chatId, 
        text, 
        parse_mode: parseMode 
      })
    });

    
    if (!response.ok) {
      const errorDetails = await response.text();
      console.error(`Telegram API error: ${response.status} ${response.statusText}`, errorDetails);
      
      // If it's a 400 error, it might be due to markdown formatting
      if (response.status === 400) {
        // Try sending without markdown
        const plainResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: text.replace(/\\/g, ''), // Remove markdown escaping
          })
        });
        
        if (!plainResponse.ok) {
          const plainError = await plainResponse.text();
          console.error("Plain text also failed:", plainError);
        }
      }
    }
    
    return response;
  } catch (e) {
    console.error("Error sending message to Telegram:", e);
    throw e;
  }
}

// ------------------------- CACHING & RATE LIMITING -------------------------

async function getWithCache(env, key, fetchFunction, ttl = 86400) {
  try {
    const cached = await env.BOT_CACHE.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
    
    const data = await fetchFunction();
    await env.BOT_CACHE.put(key, JSON.stringify(data), { expirationTtl: ttl });
    return data;
  } catch (e) {
    console.error(`Cache error for key ${key}:`, e);
    throw e;
  }
}

async function checkRateLimit(env, identifier, limit = 5, windowSeconds = 60) {
  try {
    const key = `rate_limit:${identifier}`;
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - windowSeconds;
    
    const requests = await env.BOT_CACHE.get(key);
    let requestTimestamps = requests ? JSON.parse(requests) : [];
    
    // Filter requests within the current time window
    requestTimestamps = requestTimestamps.filter(timestamp => timestamp > windowStart);
    
    if (requestTimestamps.length >= limit) {
      return false; // Rate limited
    }
    
    // Add current request
    requestTimestamps.push(now);
    await env.BOT_CACHE.put(key, JSON.stringify(requestTimestamps), { expirationTtl: windowSeconds * 2 });
    
    return true;
  } catch (e) {
    console.error("Rate limit error:", e);
    // Fail open in case of errors to avoid blocking users
    return true;
  }
}

// ------------------------- CoinGecko -------------------------

async function getCoinList(env) {
  try {
    const coinList = await getWithCache(env, 'coinList', async () => {
      const res = await fetch(COINGECKO_COINS_LIST_URL);
      if (!res.ok) {
        throw new Error(`CoinGecko API error: ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      
      // Create a mapping with multiple access methods
      const mapping = {};
      data.forEach(c => {
        mapping[c.symbol.toLowerCase()] = c.id;
        mapping[c.id.toLowerCase()] = c.id; // Also allow access by ID
      });
      
      return mapping;
    }, 86400); // 24 hours TTL
    
    return coinList;
  } catch (e) {
    console.error("Error getting coin list:", e);
    throw new Error("Could not fetch coin data");
  }
}

async function getCoinIdFromSymbol(symbol, env) {
  if (!symbol) return null;
  
  const coinList = await getCoinList(env);
  return coinList[symbol.toLowerCase()] || null;
}

// ------------------------- Binance P2P -------------------------

async function getP2PData(amount = null, tradeType = 'BUY') {
  const payload = {
    page: 1,
    rows: 10,
    payTypes: [],
    asset: 'USDT',
    fiat: 'ETB',
    tradeType,
    amount
  };

  try {
    // Use local backend proxy instead of direct Binance API call
    const res = await fetch('http://localhost:3001/binancep2p', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      console.error(`Backend API error: ${res.status} ${res.statusText}`);
      // Try to get more error details
      const errorText = await res.text();
      console.error("Backend error details:", errorText);
      throw new Error(`Backend API error: ${res.status}`);
    }
    
    const data = await res.json();
    return data.data || [];
  } catch (e) {
    console.error("Error fetching P2P data from backend:", e);
    throw new Error("Could not fetch P2P data");
  }
}

// ------------------------- COMMAND HANDLERS -------------------------

async function handleStart(chatId, env) {
  const message = `
🤖 *Welcome to Binance P2P ETB Bot\\!*

🚀 *Available Commands:*

💱 \`/p2p\` \\- Top 10 P2P rates with limits & trader info
📊 \`/rate [amount] [currency]\` \\- Specific amount rates
💰 \`/sell [amount] usdt etb\` \\- Calculate ETB for selling USDT  
🔄 \`/convert [amount] [from] [to]\` \\- Convert cryptocurrencies
🪙 \`/coin [symbol]\` \\- Coin info \\+ market chart

📡 *Live data from Binance P2P \\& CoinGecko*
🔒 *Secure \\& Fast \\- No registration required\\!*
`;
  await sendMessage(chatId, message, 'Markdown', env);
}

async function handleP2P(chatId, env) {
  try {
    const data = await getP2PData(null, 'BUY');
    if (!data.length) {
      return await sendMessage(chatId, "❌ Could not fetch P2P rates right now.", 'Markdown', env);
    }

    let message = "💱 *Top 10 P2P Rates \\(Buy USDT\\)*\n\n";
    
    data.slice(0, 10).forEach((ad, i) => {
      const trader = ad.advertiser;
      const adv = ad.adv;
      const payMethods = adv.tradeMethods?.map(m => m.tradeMethodShortName || m.tradeMethodName).join(", ") || "Bank";
      
      message += `*${i+1}\\. ${escapeMarkdownV2(trader.nickName)}*\n`;
      message += `💰 Rate: *${formatNumber(adv.price)} ETB/USDT*\n`;
      message += `📊 Limits: ${formatNumber(adv.minSingleTransAmount)} \\- ${formatNumber(adv.maxSingleTransAmount)} ETB\n`;
      message += `⏱️ Payment: ${adv.payTimeLimit} min \\| 💳 ${escapeMarkdownV2(payMethods)}\n`;
      message += `✅ Orders: ${trader.monthOrderCount} \\| Success: ${(trader.monthFinishRate * 100).toFixed(1)}%\n\n`;
    });
    
    message += "🔄 *Live data from Binance P2P*";
    await sendMessage(chatId, message, 'MarkdownV2', env);
  } catch (e) {
    console.error("P2P command error:", e);
    await sendMessage(chatId, "⚠️ Could not fetch P2P rates. Please try again later.", 'Markdown', env);
  }
}

async function handleRate(chatId, amount, currency, env) {
  // Validate amount
  if (isNaN(amount) || amount <= 0) {
    return await sendMessage(chatId, "❌ Please provide a valid amount \\(number greater than 0\\)\\.", 'MarkdownV2', env);
  }
  
  // Validate currency (simplified check)
  if (!currency || currency.length > 10) {
    return await sendMessage(chatId, "❌ Please provide a valid currency code\\.", 'MarkdownV2', env);
  }

  try {
    const data = await getP2PData(amount, 'BUY');
    if (!data.length) {
      return await sendMessage(chatId, `❌ No P2P offers found for ${amount} ${currency.toUpperCase()}\\.`, 'MarkdownV2', env);
    }

    let message = `💱 *Top P2P Rates for ${amount} ${currency.toUpperCase()}*\n\n`;
    data.slice(0, 5).forEach((ad, i) => {
      const trader = ad.advertiser;
      const adv = ad.adv;
      
      message += `*${i+1}\\. ${escapeMarkdownV2(trader.nickName)}*\n`;
      message += `💰 *${formatNumber(adv.price)} ETB/USDT*\n`;
      message += `📊 Min: ${formatNumber(adv.minSingleTransAmount)} ETB\n\n`;
    });
    
    message += "🔄 *Live data from Binance P2P*";
    await sendMessage(chatId, message, 'MarkdownV2', env);
  } catch (e) {
    console.error("Rate command error:", e);
    await sendMessage(chatId, "⚠️ Could not fetch rate information\\. Please try again later\\.", 'MarkdownV2', env);
  }
}

async function handleSell(chatId, amount, env) {
  // Validate amount
  if (isNaN(amount) || amount <= 0) {
    return await sendMessage(chatId, "❌ Please provide a valid amount \\(number greater than 0\\)\\.", 'MarkdownV2', env);
  }

  try {
    const data = await getP2PData(amount, 'SELL');
    if (!data.length || data.length < 6) {
      return await sendMessage(chatId, "❌ Could not fetch enough P2P offers\\.", 'MarkdownV2', env);
    }

    // Get the 6th best offer (index 5) as in original code
    const best = data[5];
    const rate = parseFloat(best.adv.price);
    const totalETB = amount * rate;
    
    const message = `
💰 *USDT → ETB Conversion*

📊 *Rate Analysis:*
• 1 USDT = *${formatNumber(rate)} ETB*
• ${amount} USDT = *${formatNumber(totalETB)} ETB*

👤 *Recommended Seller:*
• Name: ${escapeMarkdownV2(best.advertiser.nickName)}
• Orders: ${best.advertiser.monthOrderCount}
• Success Rate: ${(best.advertiser.monthFinishRate*100).toFixed(1)}%

🔄 *Live P2P Rate*
`;
    await sendMessage(chatId, message, 'MarkdownV2', env);
  } catch (e) {
    console.error("Sell command error:", e);
    await sendMessage(chatId, "⚠️ Could not calculate sell rate\\. Please try again later\\.", 'MarkdownV2', env);
  }
}

async function handleConvert(chatId, amount, fromCurrency, toCurrency, env) {
  // Validate amount
  if (isNaN(amount) || amount <= 0) {
    return await sendMessage(chatId, "❌ Please provide a valid amount \\(number greater than 0\\)\\.", 'MarkdownV2', env);
  }
  
  // Validate currencies
  if (!fromCurrency || !toCurrency || fromCurrency.length > 20 || toCurrency.length > 20) {
    return await sendMessage(chatId, "❌ Please provide valid currency codes\\.", 'MarkdownV2', env);
  }

  try {
    const fromId = await getCoinIdFromSymbol(fromCurrency, env);
    const toId = await getCoinIdFromSymbol(toCurrency, env);
    
    if (!fromId || !toId) {
      return await sendMessage(chatId, "❌ Could not find one or both of the specified currencies\\.", 'MarkdownV2', env);
    }

    const res = await fetch(`${COINGECKO_PRICE_URL}?ids=${fromId},${toId}&vs_currencies=usd`);
    
    if (!res.ok) {
      throw new Error(`CoinGecko API error: ${res.status}`);
    }
    
    const prices = await res.json();
    const fromUSD = prices[fromId]?.usd;
    const toUSD = prices[toId]?.usd;
    
    if (!fromUSD || !toUSD) {
      return await sendMessage(chatId, "❌ Price data not available for one or both currencies\\.", 'MarkdownV2', env);
    }

    const result = (amount * fromUSD) / toUSD;
    const message = `
🔄 *Crypto Conversion*

💱 *${amount} ${fromCurrency.toUpperCase()} ≈ ${result.toFixed(6)} ${toCurrency.toUpperCase()}*

📊 *Exchange Rates:*
• 1 ${fromCurrency.toUpperCase()} = ${(fromUSD/toUSD).toFixed(6)} ${toCurrency.toUpperCase()}
• 1 ${toCurrency.toUpperCase()} = ${(toUSD/fromUSD).toFixed(6)} ${fromCurrency.toUpperCase()}

💰 *USD Values:*
• ${fromCurrency.toUpperCase()}: $${formatNumber(fromUSD)}
• ${toCurrency.toUpperCase()}: $${formatNumber(toUSD)}

🔄 *Live prices from CoinGecko*
`;
    await sendMessage(chatId, message, 'MarkdownV2', env);
  } catch (e) {
    console.error("Convert command error:", e);
    await sendMessage(chatId, "⚠️ Could not perform conversion\\. Please try again later\\.", 'MarkdownV2', env);
  }
}

async function handleCoin(chatId, symbol, env) {
  // Validate symbol
  if (!symbol || symbol.length > 20) {
    return await sendMessage(chatId, "❌ Please provide a valid coin symbol.", 'Markdown', env);
  }

  try {
    const coinId = await getCoinIdFromSymbol(symbol, env);
    if (!coinId) {
      return await sendMessage(chatId, `❌ Could not find coin ${symbol.toUpperCase()}.`, 'Markdown', env);
    }

    const res = await fetch(`${COINGECKO_COIN_URL}${coinId}`);
    
    if (!res.ok) {
      if (res.status === 404) {
        return await sendMessage(chatId, `❌ Could not find coin ${symbol.toUpperCase()}.`, 'Markdown', env);
      }
      throw new Error(`CoinGecko API error: ${res.status}`);
    }
    
    const data = await res.json();
    const marketData = data.market_data || {};
    const currentPrice = marketData.current_price?.usd ?? 'N/A';
    const marketCap = marketData.market_cap?.usd ?? 'N/A';
    const change24h = marketData.price_change_percentage_24h ?? 'N/A';
    const change7d = marketData.price_change_percentage_7d ?? 'N/A';
    const volume24h = marketData.total_volume?.usd ?? 'N/A';
    const rank = data.market_cap_rank ?? 'N/A';

    // For now, we'll indicate that chart generation is available
    // In future implementations, chart images can be generated and sent
    const hasChartData = currentPrice !== 'N/A' && change24h !== 'N/A';

    const changeEmoji = change24h > 0 ? '📈' : change24h < 0 ? '📉' : '➡️';
    const changeColor = change24h > 0 ? '🟢' : change24h < 0 ? '🔴' : '🟡';
    
    const message = `
🪙 *${escapeMarkdownV2(data.name)} \\(${symbol.toUpperCase()}\\)*

💰 *Price:* $${formatNumber(currentPrice)}
${changeEmoji} *24h Change:* ${changeColor} ${formatNumber(change24h)}%
📊 *7d Change:* ${formatNumber(change7d)}%
🏆 *Rank:* #${rank}

📈 *Market Stats:*
• Market Cap: $${formatNumber(marketCap)}
• 24h Volume: $${formatNumber(volume24h)}

${hasChartData ? '📊 *Market data available*' : ''}
🔄 *Data from CoinGecko*
`;
    await sendMessage(chatId, message, 'MarkdownV2', env);
  } catch (e) {
    console.error("Coin command error:", e);
    await sendMessage(chatId, "⚠️ Could not fetch coin information. Please try again later.", 'Markdown', env);
  }
}

// ------------------------- MAIN HANDLER (ES Modules) -------------------------

export default {
  async fetch(request, env, ctx) {
    // Debug: log environment keys
    console.log("Environment keys:", Object.keys(env));
    
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }
    
    // Only respond to POST requests for Telegram webhooks
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const body = await request.json();
      const chatId = body.message?.chat?.id;
      const text = body.message?.text || '';
      const userId = body.message?.from?.id;

      if (!chatId || !text || !userId) {
        return new Response('ok');
      }

      // Check rate limiting
      const isAllowed = await checkRateLimit(env, userId, 10, 60);
      if (!isAllowed) {
        await sendMessage(chatId, "⚠️ Too many requests. Please wait a minute before trying again.", 'Markdown', env);
        return new Response('ok');
      }

      const args = text.trim().split(/\s+/);
      const cmd = args[0].toLowerCase();

      // Handle commands
      if (cmd === '/start') {
        await handleStart(chatId, env);
      } else if (cmd === '/p2p') {
        await handleP2P(chatId, env);
      } else if (cmd === '/rate' && args.length >= 3) {
        const amount = parseFloat(args[1]);
        await handleRate(chatId, amount, args[2], env);
      } else if (cmd === '/sell' && args.length >= 2) {
        const amount = parseFloat(args[1]);
        await handleSell(chatId, amount, env);
      } else if (cmd === '/convert' && args.length >= 4) {
        const amount = parseFloat(args[1]);
        await handleConvert(chatId, amount, args[2], args[3], env);
      } else if (cmd === '/coin' && args.length >= 2) {
        await handleCoin(chatId, args[1], env);
      } else if (cmd === '/help') {
        await handleStart(chatId, env);
      } else {
        await sendMessage(chatId, "Unknown command. Use /start to see a list of available commands.", 'Markdown', env);
      }

      return new Response('ok');
    } catch (e) {
      console.error("Request handling error:", e);
      return new Response('Error processing request', { status: 500 });
    }
  }
};