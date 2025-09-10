// server.js
import express from "express";
import fetch from "node-fetch";

const app = express();

// Fix: Enable trust proxy for rate limiting
app.set('trust proxy', 1);

// Basic CORS middleware
app.use((req, res, next) => {
  const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : ['http://localhost:3000', 'http://localhost:3001'];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
  res.setHeader('Access-Control-Allow-Credentials', true);
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Basic rate limiting (replaces express-rate-limit to avoid the error)
const rateLimitMap = new Map();
app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxRequests = 100;
  
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, startTime: now });
    return next();
  }
  
  const window = rateLimitMap.get(ip);
  
  if (now - window.startTime > windowMs) {
    // Reset the window
    window.count = 1;
    window.startTime = now;
    return next();
  }
  
  if (window.count >= maxRequests) {
    return res.status(429).json({ 
      error: "Too many requests, please try again later." 
    });
  }
  
  window.count++;
  next();
});

// Generate realistic browser headers
const generateHeaders = () => {
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15"
  ];
  
  const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
  
  return {
    "Content-Type": "application/json",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "User-Agent": randomUserAgent,
    "Origin": "https://p2p.binance.com",
    "Referer": "https://p2p.binance.com/en/trade/all-payments/USDT?fiat=ETB",
    "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "Connection": "keep-alive",
    "TE": "trailers"
  };
};

// Request validation
const validateP2PRequest = (req) => {
  const allowedFiats = ['ETB', 'USD', 'EUR', 'GBP', 'NGN', 'KES', 'GHS'];
  const allowedAssets = ['USDT', 'BTC', 'ETH', 'BNB', 'BUSD'];
  const allowedTradeTypes = ['BUY', 'SELL'];
  
  if (!allowedFiats.includes(req.body.fiat)) {
    throw new Error(`Invalid fiat currency. Allowed: ${allowedFiats.join(', ')}`);
  }
  
  if (!allowedAssets.includes(req.body.asset)) {
    throw new Error(`Invalid asset. Allowed: ${allowedAssets.join(', ')}`);
  }
  
  if (!allowedTradeTypes.includes(req.body.tradeType)) {
    throw new Error(`Invalid trade type. Allowed: ${allowedTradeTypes.join(', ')}`);
  }
  
  if (req.body.page && (req.body.page < 1 || req.body.page > 100)) {
    throw new Error('Page must be between 1 and 100');
  }
  
  if (req.body.rows && (req.body.rows < 1 || req.body.rows > 20)) {
    throw new Error('Rows must be between 1 and 20');
  }
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Main P2P endpoint
app.post("/binancep2p", async (req, res) => {
  try {
    // Validate request
    validateP2PRequest(req);
    
    const requestBody = {
      page: Math.min(Math.max(parseInt(req.body.page) || 1, 1), 100),
      rows: Math.min(Math.max(parseInt(req.body.rows) || 10, 1), 20),
      payTypes: Array.isArray(req.body.payTypes) ? req.body.payTypes : [],
      publisherType: req.body.publisherType || null,
      fiat: req.body.fiat || "ETB",
      tradeType: req.body.tradeType || "BUY",
      asset: req.body.asset || "USDT",
      filterType: req.body.filterType || "all",
      transAmount: req.body.transAmount || ""
    };

    // Optional parameters
    if (req.body.countries) {
      requestBody.countries = Array.isArray(req.body.countries) ? req.body.countries : [req.body.countries];
    }
    
    if (req.body.pro) {
      requestBody.pro = req.body.pro;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(
      "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search",
      {
        method: "POST",
        headers: generateHeaders(),
        body: JSON.stringify(requestBody),
        signal: controller.signal,
        compress: true
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Binance API responded with status: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Add metadata to response
    const enhancedData = {
      success: true,
      data: data,
      timestamp: new Date().toISOString(),
      request: {
        fiat: requestBody.fiat,
        asset: requestBody.asset,
        tradeType: requestBody.tradeType,
        page: requestBody.page,
        rows: requestBody.rows
      }
    };
    
    res.json(enhancedData);
    
  } catch (err) {
    console.error("Proxy error:", err.message);
    
    // Different error responses based on error type
    if (err.name === 'AbortError') {
      res.status(504).json({ 
        error: "Request timeout", 
        message: "The request to Binance took too long to respond" 
      });
    } else if (err.message.includes('Invalid')) {
      res.status(400).json({ 
        error: "Validation error", 
        message: err.message 
      });
    } else {
      res.status(500).json({ 
        error: "Failed to fetch Binance P2P data", 
        message: err.message,
        timestamp: new Date().toISOString()
      });
    }
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: "Internal server error", 
    message: "An unexpected error occurred" 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`🚀 Proxy server running on port ${port}`);
  console.log(`📍 Health check available at http://localhost:${port}/health`);
});