/**
 * Background Cache Warming Service
 * Proactively refreshes popular currency data to improve user experience
 */

import { POPULAR_COINS, CACHE_TTL } from '../config/constants.js';
import { getMultipleCoinPrices } from '../api/coinGecko.js';
import { getRateLimitService } from './rateLimitService.js';

/**
 * Background Cache Warming Service
 */
export class CacheWarmingService {
  constructor(env) {
    this.env = env;
    this.warmingInProgress = false;
    this.lastWarmingTime = 0;
  }

  /**
   * Check if cache warming should run
   */
  shouldWarmCache() {
    const now = Date.now();
    const timeSinceLastWarming = now - this.lastWarmingTime;
    const warmingInterval = CACHE_TTL.POPULAR_PRICES * 1000 * 0.8; // 80% of cache TTL
    
    return !this.warmingInProgress && timeSinceLastWarming > warmingInterval;
  }

  /**
   * Warm cache for popular coins
   */
  async warmPopularCoinsCache() {
    if (this.warmingInProgress) {
      console.log('Cache warming already in progress, skipping...');
      return;
    }

    try {
      this.warmingInProgress = true;
      this.lastWarmingTime = Date.now();
      
      console.log('Starting cache warming for popular coins...');
      
      const rateLimitService = getRateLimitService(this.env);
      const status = await rateLimitService.getRateLimitStatus();
      
      // Only warm cache if service is healthy
      if (!status.isHealthy) {
        console.log('Service not healthy, skipping cache warming');
        return;
      }

      // Warm popular coin prices
      await this.warmCoinPrices();
      
      console.log('Cache warming completed successfully');
    } catch (error) {
      console.error('Cache warming failed:', error);
    } finally {
      this.warmingInProgress = false;
    }
  }

  /**
   * Warm coin prices cache
   */
  async warmCoinPrices() {
    try {
      // Warm USD prices for popular coins
      await getMultipleCoinPrices(this.env, POPULAR_COINS, ['usd']);
      console.log(`Warmed price cache for ${POPULAR_COINS.length} popular coins`);
      
      // Also warm some popular fiat conversions
      const popularFiats = ['eur', 'gbp'];
      for (const fiat of popularFiats) {
        await getMultipleCoinPrices(this.env, POPULAR_COINS.slice(0, 3), [fiat]);
      }
      console.log('Warmed popular fiat conversion cache');
      
    } catch (error) {
      console.log('Price cache warming failed, will retry next cycle:', error.message);
    }
  }

  /**
   * Schedule cache warming (can be called periodically)
   */
  async scheduleWarming() {
    if (this.shouldWarmCache()) {
      // Run in background without blocking
      this.warmPopularCoinsCache().catch(error => {
        console.error('Background cache warming error:', error);
      });
    }
  }

  /**
   * Get cache warming status
   */
  getWarmingStatus() {
    return {
      inProgress: this.warmingInProgress,
      lastWarmingTime: this.lastWarmingTime,
      nextWarmingTime: this.lastWarmingTime + (CACHE_TTL.POPULAR_PRICES * 1000 * 0.8)
    };
  }
}

/**
 * Global cache warming service instance
 */
let cacheWarmingInstance = null;

export function getCacheWarmingService(env) {
  if (!cacheWarmingInstance) {
    cacheWarmingInstance = new CacheWarmingService(env);
  }
  return cacheWarmingInstance;
}

/**
 * Trigger cache warming if needed (can be called from webhook handlers)
 */
export async function triggerCacheWarmingIfNeeded(env) {
  try {
    const service = getCacheWarmingService(env);
    await service.scheduleWarming();
  } catch (error) {
    // Don't let cache warming errors affect main functionality
    console.error('Cache warming trigger failed:', error);
  }
}