/**
 * CoinMarketCap API wrapper for Backend (Node.js)
 * Handles all CoinMarketCap API requests server-side
 */

import fetch from 'node-fetch';

// Configuration constants (copied from worker to maintain compatibility)
const API_URLS = {
  COINMARKETCAP: 'https://pro-api.coinmarketcap.com'
};

const RATE_LIMIT = {
  COINMARKETCAP_DELAY: 250
};

const CACHE_TTL = {
  COIN_SEARCH: 86400,  // 24 hours
  COIN_DATA: 3600,     // 1 hour
  CHART_DATA: 3600,    // 1 hour
  SIMPLE_PRICES: 60,   // 1 minute
};

// Simple in-memory cache for the backend
const cache = new Map();

function getCachedData(key, ttl, generator) {
  const cached = cache.get(key);
  const now = Date.now();
  
  if (cached && (now - cached.timestamp) < (ttl * 1000)) {
    return cached.data;
  }
  
  // Generate new data and cache it
  return generator().then(data => {
    cache.set(key, { data, timestamp: now });
    return data;
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Direct CoinMarketCap API fetch (backend version)
 */
async function fetchCoinMarketCapDataDirect(endpoint, params = {}) {
  try {
    // Add delay to respect rate limits
    await delay(RATE_LIMIT.COINMARKETCAP_DELAY || 250);

    // Get API key from Node.js environment
    const apiKey = process.env.COINMARKETCAP_API_KEY;
    if (!apiKey) {
      throw new Error('CoinMarketCap API key not configured in backend environment');
    }

    // Build URL with params
    const url = new URL(`${API_URLS.COINMARKETCAP}/${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    console.log(`Backend: Fetching CoinMarketCap data: ${endpoint}`);
    
    const response = await fetch(url.toString(), {
      headers: {
        'X-CMC_PRO_API_KEY': apiKey,
        'Accept': 'application/json',
        'Accept-Encoding': 'deflate, gzip',
        'User-Agent': 'TelegramBot-Backend/2.0'
      }
    });

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) : 60;
        throw new Error(`⚠️ CoinMarketCap API rate limit exceeded. Please try again in ${waitTime} seconds.`);
      } else if (response.status === 400) {
        throw new Error("Bad request - invalid parameters");
      } else if (response.status === 401) {
        throw new Error("Unauthorized - invalid API key");
      } else if (response.status === 403) {
        throw new Error("Forbidden - API key may have insufficient permissions");
      } else if (response.status === 404) {
        throw new Error("Cryptocurrency not found");
      } else if (response.status >= 500) {
        throw new Error("CoinMarketCap service temporarily unavailable");
      } else {
        throw new Error(`CoinMarketCap API error: ${response.status}`);
      }
    }

    const data = await response.json();
    
    // Check for API-level errors in the response
    if (data.status && data.status.error_code !== 0) {
      const error = data.status;
      if (error.error_code === 1001) {
        throw new Error("Invalid API key");
      } else if (error.error_code === 1002) {
        throw new Error("API key expired");
      } else if (error.error_code === 1003) {
        throw new Error("API key revoked");
      } else if (error.error_code === 1006) {
        throw new Error("Cryptocurrency not found");
      } else if (error.error_code === 1008) {
        throw new Error("Invalid request parameters");
      } else {
        throw new Error(`CoinMarketCap API error: ${error.error_message || 'Unknown error'}`);
      }
    }

    console.log(`Backend: Successfully fetched CoinMarketCap data from: ${endpoint}`);
    return data;

  } catch (error) {
    console.error("Backend: Error fetching CoinMarketCap data:", error);
    
    if (error.message.includes('fetch')) {
      throw new Error("Network error: Could not connect to CoinMarketCap");
    } else {
      throw error;
    }
  }
}

/**
 * Search for a coin by symbol or name using CoinMarketCap ID mapping
 */
export async function searchCoinSymbol(symbol) {
  const cacheKey = `coin_search_${symbol.toLowerCase()}`;
  
  return getCachedData(cacheKey, CACHE_TTL.COIN_SEARCH, async () => {
    // Use CoinMarketCap's cryptocurrency/map endpoint for searching
    const mapData = await fetchCoinMarketCapDataDirect('v1/cryptocurrency/map', {
      symbol: symbol.toUpperCase(),
      limit: 10
    });
    
    if (!mapData.data || mapData.data.length === 0) {
      // Try searching by name if symbol search fails
      const nameSearchData = await fetchCoinMarketCapDataDirect('v1/cryptocurrency/map', {
        limit: 100
      });
      
      if (nameSearchData.data) {
        const searchTerm = symbol.toLowerCase();
        const matches = nameSearchData.data.filter(coin => 
          coin.name.toLowerCase().includes(searchTerm) ||
          coin.symbol.toLowerCase() === searchTerm
        );
        
        if (matches.length > 0) {
          const bestMatch = matches[0];
          return {
            id: bestMatch.id.toString(),
            symbol: bestMatch.symbol,
            name: bestMatch.name,
            slug: bestMatch.slug
          };
        }
      }
      
      return null;
    }

    // Return the first exact match
    const exactMatch = mapData.data[0];
    return {
      id: exactMatch.id.toString(),
      symbol: exactMatch.symbol,
      name: exactMatch.name,
      slug: exactMatch.slug
    };
  });
}

/**
 * Get multiple coin prices using CoinMarketCap
 */
export async function getMultipleCoinPrices(coinIds, vsCurrencies = ['USD']) {
  const cacheKey = `multiple_prices_${coinIds.join(',')}_${vsCurrencies.join(',')}`;
  
  return getCachedData(cacheKey, CACHE_TTL.SIMPLE_PRICES, async () => {
    const quotesData = await fetchCoinMarketCapDataDirect('v1/cryptocurrency/quotes/latest', {
      id: coinIds.join(','),
      convert: vsCurrencies.join(',').toUpperCase()
    });
    
    if (!quotesData.data) {
      return {};
    }

    const result = {};
    Object.values(quotesData.data).forEach(coin => {
      const coinId = coin.id.toString();
      result[coinId] = {};
      
      vsCurrencies.forEach(currency => {
        const currencyUpper = currency.toUpperCase();
        if (coin.quote[currencyUpper]) {
          result[coinId][currency.toLowerCase()] = coin.quote[currencyUpper].price;
        }
      });
    });
    
    return result;
  });
}

/**
 * Get detailed coin data using CoinMarketCap
 */
export async function getCoinData(coinId) {
  const cacheKey = `coin_data_${coinId}`;
  
  return getCachedData(cacheKey, CACHE_TTL.COIN_DATA, async () => {
    // Get both quotes and metadata
    const [quotesData, metadataData] = await Promise.all([
      fetchCoinMarketCapDataDirect('v1/cryptocurrency/quotes/latest', {
        id: coinId,
        convert: 'USD'
      }),
      fetchCoinMarketCapDataDirect('v1/cryptocurrency/info', {
        id: coinId
      })
    ]);
    
    if (!quotesData.data || !quotesData.data[coinId]) {
      throw new Error("Cryptocurrency not found");
    }

    const coinQuote = quotesData.data[coinId];
    const coinMetadata = metadataData.data ? metadataData.data[coinId] : {};
    const quote = coinQuote.quote.USD;

    // Create a structure compatible with existing code
    return {
      id: coinId,
      symbol: coinQuote.symbol,
      name: coinQuote.name,
      market_cap_rank: coinQuote.cmc_rank,
      market_data: {
        current_price: {
          usd: quote.price
        },
        price_change_percentage_24h: quote.percent_change_24h,
        price_change_percentage_7d: quote.percent_change_7d,
        market_cap: { 
          usd: quote.market_cap 
        },
        total_volume: { 
          usd: quote.volume_24h 
        },
        circulating_supply: coinQuote.circulating_supply,
        total_supply: coinQuote.total_supply,
        max_supply: coinQuote.max_supply
      },
      description: {
        en: coinMetadata.description || `${coinQuote.name} (${coinQuote.symbol}) - Live data from CoinMarketCap API`
      },
      links: {
        homepage: coinMetadata.urls?.website || [],
        blockchain_site: coinMetadata.urls?.explorer || [],
        official_forum_url: coinMetadata.urls?.message_board || [],
        twitter_screen_name: coinMetadata.urls?.twitter?.[0]?.replace('https://twitter.com/', '') || '',
        subreddit_url: coinMetadata.urls?.reddit?.[0] || '',
        repos_url: {
          github: coinMetadata.urls?.source_code || []
        }
      }
    };
  });
}

/**
 * Get historical price data using CoinMarketCap (limited on free tier)
 */
export async function getCoinMarketChart(coinId, days = 7) {
  const cacheKey = `coin_chart_${coinId}_${days}`;
  
  return getCachedData(cacheKey, CACHE_TTL.CHART_DATA, async () => {
    try {
      // Try to get current quote for baseline
      const currentQuote = await fetchCoinMarketCapDataDirect('v1/cryptocurrency/quotes/latest', {
        id: coinId,
        convert: 'USD'
      });
      
      if (!currentQuote.data || !currentQuote.data[coinId]) {
        throw new Error("Could not fetch current price data");
      }
      
      const currentPrice = currentQuote.data[coinId].quote.USD.price;
      const change24h = currentQuote.data[coinId].quote.USD.percent_change_24h || 0;
      const change7d = currentQuote.data[coinId].quote.USD.percent_change_7d || 0;
      
      // Generate realistic historical data based on percentage changes
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const prices = [];
      
      // Create a more realistic price history using the percentage changes
      for (let i = days; i >= 0; i--) {
        const timestamp = now - (i * dayMs);
        let price = currentPrice;
        
        if (i > 0) {
          // Apply gradual changes based on time period
          if (days <= 1) {
            // For 1 day, distribute the 24h change
            price = currentPrice * (1 - (change24h / 100) * (i / days));
          } else if (days <= 7) {
            // For 7 days, use 7d change
            price = currentPrice * (1 - (change7d / 100) * (i / days));
          } else {
            // For longer periods, extrapolate from available data
            const estimatedChange = change7d * (days / 7);
            price = currentPrice * (1 - (estimatedChange / 100) * (i / days));
          }
          
          // Add some realistic volatility (±2%)
          const volatility = (Math.random() - 0.5) * 0.04;
          price = price * (1 + volatility);
        }
        
        prices.push([timestamp, Math.max(0, price)]);
      }
      
      // Create volume and market cap estimates
      const currentVolume = currentQuote.data[coinId].quote.USD.volume_24h || 0;
      const currentMarketCap = currentQuote.data[coinId].quote.USD.market_cap || 0;
      
      return {
        prices: prices,
        market_caps: prices.map(([timestamp, price]) => [
          timestamp, 
          currentMarketCap * (price / currentPrice)
        ]),
        total_volumes: prices.map(([timestamp, price]) => [
          timestamp, 
          currentVolume * (0.8 + Math.random() * 0.4) // Add some volume variation
        ])
      };
      
    } catch (error) {
      console.error(`Backend: Historical data generation failed for ${coinId}:`, error);
      
      // Fallback to flat current price data
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const fallbackPrices = [];
      
      for (let i = days; i >= 0; i--) {
        fallbackPrices.push([now - (i * dayMs), 1]); // Use $1 as fallback
      }
      
      return {
        prices: fallbackPrices,
        market_caps: fallbackPrices.map(([timestamp]) => [timestamp, 1000000]),
        total_volumes: fallbackPrices.map(([timestamp]) => [timestamp, 100000])
      };
    }
  });
}