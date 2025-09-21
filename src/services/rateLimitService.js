/**
 * Enhanced Rate Limiting Service with Exponential Backoff, Queuing, and Circuit Breaker
 * Provides professional API rate limit handling for the Telegram bot
 */

import { RATE_LIMIT, CACHE_TTL, POPULAR_COINS } from '../config/constants.js';
import { getWithCache, setCache, getCache } from '../cache/rateLimiting.js';

/**
 * Circuit Breaker states
 */
const CircuitState = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half-open'
};

/**
 * Enhanced Rate Limiting Service
 */
export class RateLimitService {
  constructor(env) {
    this.env = env;
    this.requestQueue = new Map(); // endpoint -> array of requests
    this.circuitBreakers = new Map(); // endpoint -> circuit breaker state
    this.requestDeduplication = new Map(); // request key -> promise
  }

  /**
   * Get circuit breaker state for an endpoint
   */
  async getCircuitBreakerState(endpoint) {
    const key = `circuit_breaker_${endpoint}`;
    const state = await getCache(this.env, key);
    return state || {
      state: CircuitState.CLOSED,
      failureCount: 0,
      lastFailureTime: 0,
      nextRetryTime: 0
    };
  }

  /**
   * Update circuit breaker state
   */
  async updateCircuitBreakerState(endpoint, state) {
    const key = `circuit_breaker_${endpoint}`;
    await setCache(this.env, key, state, CACHE_TTL.RATE_LIMIT_STATUS);
    this.circuitBreakers.set(endpoint, state);
  }

  /**
   * Execute request with circuit breaker pattern
   */
  async executeWithCircuitBreaker(endpoint, requestFn) {
    const state = await this.getCircuitBreakerState(endpoint);
    const now = Date.now();

    // Check if circuit is open
    if (state.state === CircuitState.OPEN) {
      if (now < state.nextRetryTime) {
        const waitTime = Math.ceil((state.nextRetryTime - now) / 1000);
        throw new Error(`⚠️ Service temporarily unavailable. Circuit breaker open. Retry in ${waitTime} seconds.`);
      }
      // Transition to half-open
      state.state = CircuitState.HALF_OPEN;
      await this.updateCircuitBreakerState(endpoint, state);
    }

    try {
      const result = await requestFn();
      
      // Success - reset or close circuit
      if (state.state === CircuitState.HALF_OPEN || state.failureCount > 0) {
        state.state = CircuitState.CLOSED;
        state.failureCount = 0;
        state.lastFailureTime = 0;
        await this.updateCircuitBreakerState(endpoint, state);
      }
      
      return result;
    } catch (error) {
      // Failure - increment counter and potentially open circuit
      state.failureCount++;
      state.lastFailureTime = now;

      if (state.failureCount >= RATE_LIMIT.CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
        state.state = CircuitState.OPEN;
        state.nextRetryTime = now + RATE_LIMIT.CIRCUIT_BREAKER_RECOVERY_TIMEOUT;
      }

      await this.updateCircuitBreakerState(endpoint, state);
      throw error;
    }
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  calculateBackoffDelay(attempt) {
    const baseDelay = RATE_LIMIT.COINLAYER_INITIAL_BACKOFF;
    const exponentialDelay = Math.min(
      baseDelay * Math.pow(RATE_LIMIT.COINLAYER_BACKOFF_MULTIPLIER, attempt),
      RATE_LIMIT.COINLAYER_MAX_BACKOFF
    );
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * RATE_LIMIT.COINLAYER_JITTER_MAX;
    return exponentialDelay + jitter;
  }

  /**
   * Execute API request with exponential backoff retry
   */
  async executeWithRetry(requestFn, maxRetries = RATE_LIMIT.COINLAYER_MAX_RETRIES) {
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.calculateBackoffDelay(attempt - 1);
          console.log(`Retrying request after ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        const result = await requestFn();
        return result;
      } catch (error) {
        lastError = error;
        
        // Don't retry on certain error types
        if (error.message.includes('404') || 
            error.message.includes('not found') ||
            error.message.includes('invalid')) {
          throw error;
        }
        
        // Log retry attempt
        console.log(`Request failed (attempt ${attempt + 1}/${maxRetries}):`, error.message);
        
        // If this was the last attempt, throw the error
        if (attempt === maxRetries - 1) {
          throw new Error(`⚠️ Request failed after ${maxRetries} attempts. ${error.message}`);
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Deduplicate identical concurrent requests
   */
  async deduplicateRequest(requestKey, requestFn) {
    // Check if identical request is already in progress
    if (this.requestDeduplication.has(requestKey)) {
      console.log(`Deduplicating request: ${requestKey}`);
      return await this.requestDeduplication.get(requestKey);
    }

    // Execute request and cache the promise
    const promise = this.executeRequest(requestFn);
    this.requestDeduplication.set(requestKey, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      // Clean up after request completes
      this.requestDeduplication.delete(requestKey);
    }
  }

  /**
   * Execute request with full enhanced handling
   */
  async executeRequest(requestFn) {
    return await this.executeWithRetry(requestFn);
  }

  /**
   * Check if request should use fallback cache
   */
  async shouldUseFallbackCache(endpoint) {
    const state = await this.getCircuitBreakerState(endpoint);
    return state.state === CircuitState.OPEN || state.failureCount > 2;
  }

  /**
   * Get cached data with fallback strategy
   */
  async getCachedDataWithFallback(cacheKey, requestFn, ttl = CACHE_TTL.SIMPLE_PRICES) {
    try {
      // Try to get fresh data first
      const result = await getWithCache(this.env, cacheKey, requestFn, ttl);
      
      // Store as fallback cache with longer TTL
      await setCache(this.env, `fallback_${cacheKey}`, result, CACHE_TTL.FALLBACK_PRICES);
      
      return result;
    } catch (error) {
      console.log(`Primary request failed, attempting fallback cache for: ${cacheKey}`);
      
      // Try fallback cache
      const fallbackData = await getCache(this.env, `fallback_${cacheKey}`);
      if (fallbackData) {
        console.log(`Using fallback cache for: ${cacheKey}`);
        return fallbackData;
      }
      
      throw error;
    }
  }

  /**
   * Determine cache TTL based on coin popularity
   */
  getCacheTTLForCoin(coinId) {
    return POPULAR_COINS.includes(coinId) 
      ? CACHE_TTL.POPULAR_PRICES 
      : CACHE_TTL.SIMPLE_PRICES;
  }

  /**
   * Batch multiple coin price requests efficiently
   */
  async batchPriceRequests(coinIds, vsCurrencies = ['usd']) {
    // Group requests to optimize API calls
    const batchSize = 10; // CoinGecko limit
    const batches = [];
    
    for (let i = 0; i < coinIds.length; i += batchSize) {
      batches.push(coinIds.slice(i, i + batchSize));
    }
    
    const results = {};
    
    for (const batch of batches) {
      const batchKey = `batch_${batch.join(',')}_${vsCurrencies.join(',')}`;
      
      try {
        const batchResult = await this.deduplicateRequest(batchKey, async () => {
          const coinIdString = batch.join(',');
          const vsCurrencyString = vsCurrencies.join(',');
          const endpoint = `/live?symbols=${coinIdString}&target=${vsCurrencyString}&include_24hr_change=true`;
          
          return await this.executeWithCircuitBreaker(endpoint, async () => {
            // Import the function dynamically to avoid circular imports
            const { fetchCoinlayerData } = await import('../api/coinlayer.js');
            return await this.executeRequest(() => fetchCoinlayerData('live', { symbols: coinIdString }));
          });
        });
        
        Object.assign(results, batchResult);
      } catch (error) {
        console.error(`Batch request failed for coins: ${batch.join(',')}`, error);
        // Continue with other batches
      }
    }
    
    return results;
  }

  /**
   * Enhanced status reporting for rate limits
   */
  async getRateLimitStatus(endpoint = 'general') {
    const state = await this.getCircuitBreakerState(endpoint);
    const now = Date.now();
    
    return {
      circuitState: state.state,
      failureCount: state.failureCount,
      isHealthy: state.state === CircuitState.CLOSED && state.failureCount < 3,
      retryAfter: state.nextRetryTime > now ? Math.ceil((state.nextRetryTime - now) / 1000) : 0,
      queueSize: this.requestQueue.get(endpoint)?.length || 0
    };
  }

  /**
   * Get user-friendly rate limit message
   */
  async getRateLimitMessage(endpoint = 'general') {
    const status = await this.getRateLimitStatus(endpoint);
    
    if (status.circuitState === CircuitState.OPEN) {
      return `⚠️ Service temporarily unavailable due to API limits. Retry in ${status.retryAfter} seconds.`;
    }
    
    if (status.failureCount > 2) {
      return `⚠️ Service experiencing issues. Using cached data when available.`;
    }
    
    if (status.queueSize > 0) {
      return `⏳ Request queued (${status.queueSize} requests ahead). Please wait...`;
    }
    
    return null; // No issues
  }

  // This method needs to be implemented with the actual fetch logic
  async fetchCoinlayerData(endpoint, params = {}) {
    throw new Error('fetchCoinlayerData must be implemented by the calling code');
  }
}

/**
 * Create singleton instance for the service
 */
let rateLimitServiceInstance = null;

export function getRateLimitService(env) {
  if (!rateLimitServiceInstance) {
    rateLimitServiceInstance = new RateLimitService(env);
  }
  return rateLimitServiceInstance;
}