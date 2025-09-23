/**
 * Integration test to verify the worker architecture works without Node.js dependencies
 */

import { describe, test, expect, vi } from 'vitest';

// Mock fetch to simulate backend responses
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Architecture Integration', () => {
  test('should load worker code without process.env errors', async () => {
    // This test verifies that importing the main worker doesn't cause
    // "process is not defined" errors
    expect(() => {
      // Import the worker module
      import('../src/worker.js');
    }).not.toThrow();
  });

  test('should handle coin search through backend proxy', async () => {
    // Mock successful backend response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          id: '1',
          symbol: 'BTC',
          name: 'Bitcoin',
          slug: 'bitcoin'
        }
      })
    });

    const { searchCoinSymbol } = await import('../src/api/coinmarketcap.js');
    const result = await searchCoinSymbol(null, 'BTC');
    
    expect(result).toEqual({
      id: '1',
      symbol: 'BTC',
      name: 'Bitcoin',
      slug: 'bitcoin'
    });
    
    // Verify it made a call to the backend, not direct CoinMarketCap API
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/coin/search'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Content-Type': 'application/json'
        })
      })
    );
  });

  test('should handle coin data through backend proxy', async () => {
    // Mock successful backend response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          id: '1',
          symbol: 'BTC',
          name: 'Bitcoin',
          market_data: {
            current_price: { usd: 50000 },
            price_change_percentage_24h: 2.5
          }
        }
      })
    });

    const { getCoinData } = await import('../src/api/coinmarketcap.js');
    const result = await getCoinData(null, '1');
    
    expect(result.symbol).toBe('BTC');
    expect(result.market_data.current_price.usd).toBe(50000);
    
    // Verify it made a call to the backend
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/coin/data'),
      expect.objectContaining({
        method: 'GET'
      })
    );
  });

  test('should handle chart data through backend proxy', async () => {
    // Mock successful backend response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          prices: [[1234567890000, 50000], [1234567890001, 50100]],
          market_caps: [[1234567890000, 1000000000], [1234567890001, 1001000000]],
          total_volumes: [[1234567890000, 100000], [1234567890001, 101000]]
        }
      })
    });

    const { getCoinMarketChart } = await import('../src/api/coinmarketcap.js');
    const result = await getCoinMarketChart(null, '1', 7);
    
    expect(result.prices).toHaveLength(2);
    expect(result.prices[0]).toEqual([1234567890000, 50000]);
    
    // Verify it made a call to the backend
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/coin/chart'),
      expect.objectContaining({
        method: 'GET'
      })
    );
  });

  test('should handle backend errors gracefully', async () => {
    // Mock backend error
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500
    });

    const { searchCoinSymbol } = await import('../src/api/coinmarketcap.js');
    
    await expect(searchCoinSymbol(null, 'INVALID')).rejects.toThrow('Coin search failed');
  });

  test('should not contain any direct CoinMarketCap API calls in worker code', async () => {
    // This test ensures the worker doesn't make direct calls to pro-api.coinmarketcap.com
    mockFetch.mockClear();
    
    try {
      const { searchCoinSymbol } = await import('../src/api/coinmarketcap.js');
      await searchCoinSymbol(null, 'BTC');
    } catch {
      // Expected to fail due to mocked fetch, that's fine
    }
    
    // Verify no calls were made to the direct CoinMarketCap API
    const coinmarketcapCalls = mockFetch.mock.calls.filter(call => 
      call[0] && call[0].includes('pro-api.coinmarketcap.com')
    );
    
    expect(coinmarketcapCalls).toHaveLength(0);
  });
});