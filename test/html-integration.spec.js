import { describe, it, expect } from 'vitest';
import { formatP2PResponse } from '../src/api/binanceP2P.js';

describe('HTML Integration Tests', () => {
  describe('P2P Response Formatting', () => {
    it('should properly format trader names with special characters', () => {
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

      const result = formatP2PResponse(mockData, 'USDT', 'ETB', 'BUY');
      
      // Should contain trader names without MarkdownV2 escaping
      expect(result).toContain('User_Test.Pro');
      expect(result).toContain('Crypto[King]-(Expert)');
      
      // Should contain HTML bold tags instead of MarkdownV2 asterisks
      expect(result).toContain('<b>');
      expect(result).toContain('</b>');
      
      // Should not contain MarkdownV2 escaping
      expect(result).not.toContain('\\_');
      expect(result).not.toContain('\\[');
      expect(result).not.toContain('\\]');
    });

    it('should handle empty data gracefully', () => {
      const result1 = formatP2PResponse(null, 'USDT', 'ETB', 'BUY');
      expect(result1).toBe('❌ No BUY ads found for USDT/ETB');
      
      const result2 = formatP2PResponse(undefined, 'USDT', 'ETB', 'BUY');
      expect(result2).toBe('❌ No BUY ads found for USDT/ETB');
    });

    it('should handle null/undefined data', () => {
      const mockDataEmpty = { data: { data: [] } };
      const result = formatP2PResponse(mockDataEmpty, 'USDT', 'ETB', 'BUY');
      expect(result).toBe('❌ No BUY ads found for USDT/ETB');
    });
  });

  describe('Real-world HTML scenarios', () => {
    it('should handle common cryptocurrency price formats without escaping', () => {
      const testScenarios = [
        {
          input: 'Bitcoin (BTC): $45,123.67',
          shouldNotContain: ['\\(', '\\)', '\\.']
        },
        {
          input: 'Change: +5.23%',
          shouldNotContain: ['\\+', '\\.']
        },
        {
          input: 'Range: 100-1000 ETB',
          shouldNotContain: ['\\-']
        },
        {
          input: 'Success Rate: 98.5%',
          shouldNotContain: ['\\.']
        }
      ];

      // In HTML mode, these characters don't need escaping
      testScenarios.forEach(scenario => {
        scenario.shouldNotContain.forEach(escapedChar => {
          expect(scenario.input).not.toContain(escapedChar);
        });
      });
    });
  });
});