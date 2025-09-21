import { describe, test, expect } from 'vitest';
import { RateLimitService, getRateLimitService } from '../src/services/rateLimitService.js';

describe('Enhanced Rate Limiting Service', () => {
  const mockEnv = {
    BOT_CACHE: {
      get: async (key) => null,
      put: async (key, value, options) => {},
      delete: async (key) => {}
    }
  };

  test('should calculate exponential backoff with jitter', () => {
    const service = new RateLimitService(mockEnv);
    
    // Test backoff calculation
    const delay1 = service.calculateBackoffDelay(0);
    const delay2 = service.calculateBackoffDelay(1);
    const delay3 = service.calculateBackoffDelay(2);
    
    expect(delay1).toBeGreaterThanOrEqual(1000); // Base delay + jitter
    expect(delay1).toBeLessThanOrEqual(2000);    // Base delay + max jitter
    
    expect(delay2).toBeGreaterThanOrEqual(2000); // 2x base + jitter
    expect(delay2).toBeLessThanOrEqual(3000);    // 2x base + max jitter
    
    expect(delay3).toBeGreaterThanOrEqual(4000); // 4x base + jitter
    expect(delay3).toBeLessThanOrEqual(5000);    // 4x base + max jitter
  });

  test('should determine cache TTL based on coin popularity', () => {
    const service = new RateLimitService(mockEnv);
    
    // Popular coin should get longer cache
    const btcTTL = service.getCacheTTLForCoin('bitcoin');
    expect(btcTTL).toBe(300); // POPULAR_PRICES TTL
    
    // Unknown coin should get shorter cache
    const unknownTTL = service.getCacheTTLForCoin('unknown-coin');
    expect(unknownTTL).toBe(60); // SIMPLE_PRICES TTL
  });

  test('should get rate limit status correctly', async () => {
    const service = new RateLimitService(mockEnv);
    
    const status = await service.getRateLimitStatus();
    
    expect(status).toHaveProperty('circuitState');
    expect(status).toHaveProperty('failureCount');
    expect(status).toHaveProperty('isHealthy');
    expect(status).toHaveProperty('retryAfter');
    expect(status).toHaveProperty('queueSize');
    
    // Default state should be healthy
    expect(status.isHealthy).toBe(true);
    expect(status.circuitState).toBe('closed');
    expect(status.failureCount).toBe(0);
  });

  test('should create singleton service instance', () => {
    const service1 = getRateLimitService(mockEnv);
    const service2 = getRateLimitService(mockEnv);
    
    expect(service1).toBe(service2); // Same instance
  });

  test('should provide user-friendly rate limit messages', async () => {
    const service = new RateLimitService(mockEnv);
    
    const message = await service.getRateLimitMessage();
    
    // Should return null for healthy service
    expect(message).toBeNull();
  });

  test('should handle circuit breaker state changes', async () => {
    const mockCache = new Map();
    const mockEnvWithCache = {
      BOT_CACHE: {
        get: async (key) => mockCache.get(key) || null,
        put: async (key, value, options) => { mockCache.set(key, value); },
        delete: async (key) => { mockCache.delete(key); }
      }
    };
    
    const service = new RateLimitService(mockEnvWithCache);
    
    // Get initial state
    const initialState = await service.getCircuitBreakerState('test-endpoint');
    expect(initialState.state).toBe('closed');
    expect(initialState.failureCount).toBe(0);
    
    // Update state
    const newState = {
      state: 'open',
      failureCount: 5,
      lastFailureTime: Date.now(),
      nextRetryTime: Date.now() + 60000
    };
    
    await service.updateCircuitBreakerState('test-endpoint', newState);
    
    // Verify state was updated
    const updatedState = await service.getCircuitBreakerState('test-endpoint');
    expect(updatedState.state).toBe('open');
    expect(updatedState.failureCount).toBe(5);
  });
});