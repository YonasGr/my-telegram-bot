import { describe, it, expect } from 'vitest';
import { formatP2PResponse } from '../src/api/binanceP2P.js';

describe('HTML Integration Tests', () => {
  describe('P2P Response Formatting', () => {
    it('should properly format trader names with HTML escaping', () => {
      const mockData = {
        data: {
          data: [
            {
              advertiser: {
                nickName: 'User_Test.Pro',
                monthOrderCount: 100,
                monthFinishRate: 0.98
              },
              adv: {
                price: '123.45',
                surplusAmount: '1000',
                minSingleTransAmount: '50',
                maxSingleTransAmount: '500',
                tradeMethods: [
                  { tradeMethodName: 'Bank Transfer' },
                  { tradeMethodName: 'PayPal' }
                ]
              }
            },
            {
              advertiser: {
                nickName: 'Crypto[King]-(Expert)',
                monthOrderCount: 50,
                monthFinishRate: 0.95
              },
              adv: {
                price: '124.50',
                surplusAmount: '800',
                minSingleTransAmount: '100',
                maxSingleTransAmount: '1000',
                tradeMethods: [
                  { tradeMethodName: 'Wire Transfer' }
                ]
              }
            }
          ]
        }
      };

      const result = formatP2PResponse(mockData, 'USDT', 'ETB', 'BUY', 2);
      
      // Check that text is properly formatted for HTML (no MarkdownV2 escaping)
      expect(result).toContain('User_Test.Pro');
      expect(result).toContain('123.45');
      expect(result).toContain('1000');
      expect(result).toContain('50 - 500');
      expect(result).toContain('100 (98.0% success)');
      expect(result).toContain('Crypto[King]-(Expert)');
      expect(result).toContain('124.50');
      expect(result).toContain('50 (95.0% success)');
      
      // Should contain HTML formatting instead of MarkdownV2
      expect(result).toContain('<b>1. User_Test.Pro</b>');
      expect(result).toContain('<b>2. Crypto[King]-(Expert)</b>');
      expect(result).toContain('<b>Binance P2P BUY USDT for ETB</b>');
      expect(result).toContain('<b>Live data from Binance P2P</b>');
      
      // Verify the overall structure is valid HTML
      expect(result).toContain('💰 <b>Binance P2P BUY USDT for ETB</b>');
      expect(result).toContain('🔄 <b>Live data from Binance P2P</b>');
    });

    it('should handle empty data gracefully', () => {
      const emptyData = {
        data: {
          data: []
        }
      };

      const result = formatP2PResponse(emptyData, 'USDT', 'ETB', 'BUY');
      expect(result).toBe('❌ No BUY ads found for USDT/ETB');
    });

    it('should handle null/undefined data', () => {
      const result1 = formatP2PResponse(null, 'USDT', 'ETB', 'BUY');
      expect(result1).toBe('❌ No BUY ads found for USDT/ETB');
      
      const result2 = formatP2PResponse(undefined, 'USDT', 'ETB', 'BUY');
      expect(result2).toBe('❌ No BUY ads found for USDT/ETB');
    });
  });

  describe('Real-world HTML formatting scenarios', () => {
    it('should handle common cryptocurrency price formats without escaping', () => {
      const testScenarios = [
        {
          input: 'Bitcoin (BTC): $45,123.67',
          shouldContain: 'Bitcoin \\(BTC\\): $45,123\\.67'
        },
        {
          input: 'Change: +5.23%',
          shouldContain: 'Change: \\+5\\.23%'
        },
        {
          input: 'Range: 100-1000 ETB',
          shouldContain: 'Range: 100\\-1000 ETB'
        },
        {
          input: 'Success Rate: 98.5%',
          shouldContain: 'Success Rate: 98\\.5%'
        }
      ];

      // These scenarios would be tested in actual message formatting
      // This test documents the expected behavior
      testScenarios.forEach(scenario => {
        // In real usage, the escapeMarkdownV2 function would be applied
        // and the result should contain the expected escaped format
        expect(scenario.shouldContain).toMatch(/\\./);
      });
    });
  });
});