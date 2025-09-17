/**
 * Caching and rate limiting utilities for Cloudflare Workers
 */

/**
 * Checks rate limiting for a user
 * @param {object} env - Cloudflare environment object
 * @param {string|number} identifier - User identifier
 * @param {number} limit - Request limit
 * @param {number} windowSeconds - Time window in seconds
 * @returns {Promise<boolean>} True if request is allowed
 */
export async function checkRateLimit(env, identifier, limit = 10, windowSeconds = 60) {
  try {
    const key = `rate_limit_${identifier}`;
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - windowSeconds;

    const recentRequests = await env.BOT_CACHE.get(key);
    let requests = recentRequests ? JSON.parse(recentRequests) : [];

    // Filter out expired requests
    requests = requests.filter(timestamp => timestamp > windowStart);

    if (requests.length >= limit) {
      console.log(`Rate limit exceeded for ${identifier}: ${requests.length}/${limit} requests in ${windowSeconds}s window`);
      return false;
    }

    // Add current request
    requests.push(now);
    await env.BOT_CACHE.put(key, JSON.stringify(requests), { expirationTtl: windowSeconds });

    return true;
  } catch (error) {
    console.error("Rate limiting error:", error);
    // On error, allow the request to proceed
    return true;
  }
}

/**
 * Generic caching wrapper with TTL support
 * @param {object} env - Cloudflare environment object
 * @param {string} key - Cache key
 * @param {Function} fetchFunction - Function to fetch data if not cached
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<any>} Cached or fresh data
 */
export async function getWithCache(env, key, fetchFunction, ttl = 300) {
  try {
    // Try to get from cache first
    const cached = await env.BOT_CACHE.get(key);
    if (cached) {
      console.log(`Cache hit for key: ${key}`);
      return JSON.parse(cached);
    }

    console.log(`Cache miss for key: ${key}, fetching fresh data`);
    // If not in cache, fetch fresh data
    const data = await fetchFunction();
    
    // Store in cache with TTL
    await env.BOT_CACHE.put(key, JSON.stringify(data), { expirationTtl: ttl });
    
    return data;
  } catch (error) {
    console.error(`Cache error for key ${key}:`, error);
    // On cache error, still try to fetch fresh data
    return await fetchFunction();
  }
}

/**
 * Invalidates cache entries by key pattern
 * @param {object} env - Cloudflare environment object
 * @param {string} keyPattern - Pattern to match for deletion
 * @returns {Promise<void>}
 */
export async function invalidateCache(env, keyPattern) {
  try {
    // Note: Cloudflare KV doesn't support pattern deletion natively
    // This is a placeholder for future implementation if needed
    console.log(`Cache invalidation requested for pattern: ${keyPattern}`);
    // Could maintain a list of keys to delete if pattern matching is needed
  } catch (error) {
    console.error("Cache invalidation error:", error);
  }
}

/**
 * Sets cache data with optional TTL
 * @param {object} env - Cloudflare environment object
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<void>}
 */
export async function setCache(env, key, data, ttl = 300) {
  try {
    await env.BOT_CACHE.put(key, JSON.stringify(data), { expirationTtl: ttl });
    console.log(`Cached data for key: ${key} with TTL: ${ttl}s`);
  } catch (error) {
    console.error(`Failed to cache data for key ${key}:`, error);
  }
}

/**
 * Gets cache data without fallback
 * @param {object} env - Cloudflare environment object
 * @param {string} key - Cache key
 * @returns {Promise<any|null>} Cached data or null
 */
export async function getCache(env, key) {
  try {
    const cached = await env.BOT_CACHE.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error(`Failed to get cache for key ${key}:`, error);
    return null;
  }
}

/**
 * Deletes cache entry
 * @param {object} env - Cloudflare environment object
 * @param {string} key - Cache key to delete
 * @returns {Promise<void>}
 */
export async function deleteCache(env, key) {
  try {
    await env.BOT_CACHE.delete(key);
    console.log(`Deleted cache for key: ${key}`);
  } catch (error) {
    console.error(`Failed to delete cache for key ${key}:`, error);
  }
}

/**
 * Enhanced rate limiter with sliding window
 * @param {object} env - Cloudflare environment object
 * @param {string} identifier - User identifier
 * @param {object} config - Rate limit configuration
 * @returns {Promise<object>} Rate limit status
 */
export async function advancedRateLimit(env, identifier, config = {}) {
  const {
    limit = 10,
    windowSeconds = 60,
    burstLimit = 15,
    burstWindowSeconds = 10
  } = config;

  try {
    const now = Math.floor(Date.now() / 1000);
    const key = `advanced_rate_limit_${identifier}`;
    
    const existing = await env.BOT_CACHE.get(key);
    let rateData = existing ? JSON.parse(existing) : {
      requests: [],
      burstRequests: []
    };

    // Clean expired requests
    const windowStart = now - windowSeconds;
    const burstWindowStart = now - burstWindowSeconds;
    
    rateData.requests = rateData.requests.filter(t => t > windowStart);
    rateData.burstRequests = rateData.burstRequests.filter(t => t > burstWindowStart);

    // Check limits
    const regularLimitExceeded = rateData.requests.length >= limit;
    const burstLimitExceeded = rateData.burstRequests.length >= burstLimit;

    if (regularLimitExceeded || burstLimitExceeded) {
      const retryAfter = regularLimitExceeded 
        ? rateData.requests[0] + windowSeconds - now
        : rateData.burstRequests[0] + burstWindowSeconds - now;

      return {
        allowed: false,
        retryAfter: Math.max(retryAfter, 1),
        remaining: Math.max(0, limit - rateData.requests.length),
        resetTime: now + retryAfter
      };
    }

    // Add current request
    rateData.requests.push(now);
    rateData.burstRequests.push(now);

    // Save updated rate data
    await env.BOT_CACHE.put(key, JSON.stringify(rateData), { 
      expirationTtl: Math.max(windowSeconds, burstWindowSeconds) 
    });

    return {
      allowed: true,
      remaining: limit - rateData.requests.length,
      resetTime: now + windowSeconds
    };
  } catch (error) {
    console.error("Advanced rate limiting error:", error);
    return { allowed: true, remaining: limit, resetTime: now + windowSeconds };
  }
}