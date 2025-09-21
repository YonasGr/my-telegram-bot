# Enhanced API Rate Limiting System

This document describes the professional rate limiting system implemented to handle CoinGecko API limits and improve bot reliability.

## Features

### 🔄 Exponential Backoff with Jitter
- Automatic retry with increasing delays (1s → 2s → 4s → 8s → 16s)
- Random jitter prevents thundering herd problems
- Configurable retry attempts and backoff multipliers

### 🔐 Circuit Breaker Pattern
- Opens circuit after 5 consecutive failures
- Prevents cascading failures and API hammering
- Automatic recovery detection and half-open testing
- 60-second recovery timeout by default

### 🎯 Smart Caching Strategy
- **Popular coins** (BTC, ETH, USDT, etc.): 5-minute cache
- **Regular coins**: 1-minute cache
- **Fallback cache**: 1-hour extended cache for API failures
- **Background refresh**: Proactive cache warming for popular pairs

### 📊 Request Deduplication
- Eliminates identical concurrent API requests
- Shares results across multiple users requesting same data
- Reduces API load and improves response times

### 🏗 Priority-Based Request Handling
- **Popular pairs** get priority processing
- **Batch requests** for multiple coins (up to 10 per request)
- **Intelligent batching** optimizes API usage

### 📢 Enhanced User Communication
- Real-time service health status
- Specific retry timing information
- Graceful degradation messages
- Fallback to cached data notifications

## Configuration

### Rate Limiting Constants (`src/config/constants.js`)

```javascript
export const RATE_LIMIT = {
  // Retry Configuration
  COINGECKO_MAX_RETRIES: 5,
  COINGECKO_INITIAL_BACKOFF: 1000, // 1 second
  COINGECKO_MAX_BACKOFF: 32000, // 32 seconds
  COINGECKO_BACKOFF_MULTIPLIER: 2,
  COINGECKO_JITTER_MAX: 1000, // max random jitter in ms
  
  // Circuit Breaker
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: 5,
  CIRCUIT_BREAKER_RECOVERY_TIMEOUT: 60000, // 1 minute
  
  // Request Queue
  QUEUE_MAX_SIZE: 100,
  QUEUE_TIMEOUT: 30000 // 30 seconds max wait
};
```

### Cache TTL Settings

```javascript
export const CACHE_TTL = {
  SIMPLE_PRICES: 60,      // 1 minute for regular coins
  POPULAR_PRICES: 300,    // 5 minutes for BTC, ETH, etc.
  FALLBACK_PRICES: 3600,  // 1 hour fallback cache
  COIN_DATA: 3600,        // 1 hour for detailed data
  RATE_LIMIT_STATUS: 300  // 5 minutes for rate limit tracking
};
```

### Popular Coins List

```javascript
export const POPULAR_COINS = [
  'bitcoin', 'ethereum', 'tether', 'binancecoin', 
  'cardano', 'solana', 'dogecoin'
];
```

## Usage

### Basic Implementation

The rate limiting service is automatically used by all CoinGecko API functions:

```javascript
import { getMultipleCoinPrices, getCoinData } from '../api/coinGecko.js';

// Automatically uses enhanced rate limiting
const prices = await getMultipleCoinPrices(env, ['bitcoin', 'ethereum'], ['usd']);
const coinData = await getCoinData(env, 'bitcoin');
```

### Service Status Checking

```javascript
import { getRateLimitService } from '../services/rateLimitService.js';

const rateLimitService = getRateLimitService(env);
const status = await rateLimitService.getRateLimitStatus();

console.log({
  isHealthy: status.isHealthy,
  circuitState: status.circuitState,
  failureCount: status.failureCount,
  retryAfter: status.retryAfter
});
```

### User-Friendly Error Messages

The system automatically provides contextual error messages:

```javascript
const rateLimitMessage = await rateLimitService.getRateLimitMessage();
if (rateLimitMessage) {
  // Show user-friendly message
  console.log(rateLimitMessage);
}
```

## Error Handling

### Circuit Breaker States

1. **CLOSED**: Normal operation, requests pass through
2. **OPEN**: Circuit is open, requests fail fast with helpful messages
3. **HALF_OPEN**: Testing recovery, limited requests allowed

### Fallback Strategies

1. **Fresh data** → **Cached data** → **Extended fallback cache** → **Error message**
2. Automatic fallback to cached data when API is unavailable
3. Extended cache (1 hour) for critical data during outages

### User Messaging

- ⚠️ **Rate limit messages**: Clear explanation with retry timing
- 🔄 **Service status**: Real-time health indicators
- 💡 **Suggestions**: Alternative actions and commands
- 📊 **Diagnostics**: Failure counts and recovery estimates

## Monitoring

### Service Health Indicators

- **Service Health**: Good/Degraded status
- **Failure Count**: Current consecutive failures
- **Retry Timer**: Seconds until next retry allowed
- **Circuit State**: Current circuit breaker status

### Logging

All rate limiting events are logged with context:

```
[INFO] Cache hit for key: simple_prices_bitcoin_usd
[INFO] Retrying request after 2000ms (attempt 2/5)
[WARN] Circuit breaker opened for endpoint /simple/price
[INFO] Using fallback cache for: coin_data_bitcoin
```

## Performance Optimizations

### Request Batching
- Groups multiple coin requests into single API calls
- Reduces API usage by up to 10x for multiple coin requests
- Automatic batch size optimization (10 coins per request)

### Cache Warming
- Popular coins cached proactively
- Background refresh before cache expiration
- Reduces user-facing API delays

### Request Deduplication
- Eliminates redundant API calls for identical requests
- Shares results across concurrent users
- Reduces API load significantly during peak usage

## Testing

The system includes comprehensive tests for:

- Exponential backoff timing
- Circuit breaker state transitions
- Cache fallback mechanisms
- Error message formatting
- Request deduplication

Run tests with:
```bash
npm test
```

## Migration Notes

### Breaking Changes
- All CoinGecko API functions now require `env` parameter
- Error messages have changed format (more user-friendly)
- Cache keys have been updated for consistency

### Backward Compatibility
- Old function signatures still work (with warnings)
- Graceful degradation for missing configuration
- Automatic fallback to basic rate limiting if service fails

## Configuration Examples

### High-Traffic Setup
```javascript
export const RATE_LIMIT = {
  COINGECKO_MAX_RETRIES: 7,
  COINGECKO_INITIAL_BACKOFF: 500,
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: 3,
  QUEUE_MAX_SIZE: 200
};
```

### Conservative Setup
```javascript
export const RATE_LIMIT = {
  COINGECKO_MAX_RETRIES: 3,
  COINGECKO_INITIAL_BACKOFF: 2000,
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: 8,
  COINGECKO_DELAY: 10000
};
```

This enhanced rate limiting system provides enterprise-grade reliability and user experience for API interactions while staying within service limits.