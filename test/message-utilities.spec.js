import { describe, it, expect } from 'vitest';
import {
  chunkMessage,
  createSafeMessageChunks,
  safe
} from '../src/utils/formatters.js';

describe('Message Utilities', () => {
  describe('chunkMessage', () => {
    it('should return single chunk for short messages', () => {
      const message = 'This is a short message';
      const chunks = chunkMessage(message);
      expect(chunks).toEqual([message]);
    });

    it('should split long messages into multiple chunks', () => {
      // Create a message longer than 4096 characters
      const longMessage = 'A'.repeat(5000);
      const chunks = chunkMessage(longMessage);
      
      expect(chunks.length).toBeGreaterThan(1);
      
      // Check that all chunks are within the limit
      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(4096);
      });
      
      // Check that total content is preserved (accounting for ellipsis in force-split words)
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      expect(totalLength).toBeGreaterThan(4500); // Should preserve most of the content
    });

    it('should preserve line breaks when chunking', () => {
      const lines = Array(100).fill('This is a line of text that should be preserved').join('\n');
      const chunks = chunkMessage(lines);
      
      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(4096);
        // Each chunk should maintain line structure
        expect(chunk.split('\n').length).toBeGreaterThan(0);
      });
    });

    it('should handle empty messages gracefully', () => {
      expect(chunkMessage('')).toEqual(['']);
      expect(chunkMessage(null)).toEqual(['']);
      expect(chunkMessage(undefined)).toEqual(['']);
    });
  });

  describe('createSafeMessageChunks', () => {
    it('should create safe chunks with escaped values', () => {
      const template = 'Bitcoin (BTC) price: ${price}. Change: ${change}%';
      const values = {
        price: '45,123.67',
        change: '+5.23'
      };
      
      const chunks = createSafeMessageChunks(template, values);
      expect(chunks[0]).toContain('45,123\\.67');
      expect(chunks[0]).toContain('\\+5\\.23%');
    });
  });

  describe('safe formatters', () => {
    describe('safe.coinName', () => {
      it('should escape coin names with special characters', () => {
        const result = safe.coinName('Bitcoin Cash', 'BCH');
        expect(result).toBe('Bitcoin Cash \\(BCH\\)');
        
        const result2 = safe.coinName('Test.Coin-Pro', 'TEST');
        expect(result2).toBe('Test\\.Coin\\-Pro \\(TEST\\)');
      });
    });

    describe('safe.traderName', () => {
      it('should escape trader names with special characters', () => {
        expect(safe.traderName('User_Test.Pro')).toBe('User\\_Test\\.Pro');
        expect(safe.traderName('Crypto[King]-(Expert)')).toBe('Crypto\\[King\\]\\-\\(Expert\\)');
        expect(safe.traderName('Normal_User')).toBe('Normal\\_User');
      });
    });

    describe('safe.price', () => {
      it('should format and escape prices correctly', () => {
        expect(safe.price(45123.67, 'USD')).toContain('45,123\\.67 USD');
        expect(safe.price(1.5, 'BTC')).toContain('1\\.50 BTC');
      });
    });

    describe('safe.percentage', () => {
      it('should format and escape percentages correctly', () => {
        expect(safe.percentage(5.23)).toBe('\\+5\\.23%');
        expect(safe.percentage(-2.15)).toBe('\\-2\\.15%');
        expect(safe.percentage(0)).toBe('\\+0\\.00%');
      });

      it('should handle null/undefined values', () => {
        expect(safe.percentage(null)).toBe('N/A');
        expect(safe.percentage(undefined)).toBe('N/A');
        expect(safe.percentage(NaN)).toBe('N/A');
      });
    });

    describe('safe.range', () => {
      it('should format and escape ranges correctly', () => {
        expect(safe.range(100, 500)).toBe('100 \\- 500');
        expect(safe.range('50.5', '100.25')).toBe('50\\.5 \\- 100\\.25');
      });
    });

    describe('safe.paymentMethods', () => {
      it('should format and escape payment methods', () => {
        const methods = [
          { tradeMethodName: 'Bank Transfer' },
          { tradeMethodName: 'PayPal' },
          { tradeMethodName: 'Wire-Transfer' }
        ];
        
        const result = safe.paymentMethods(methods);
        expect(result).toBe('Bank Transfer, PayPal, Wire\\-Transfer');
      });

      it('should handle empty arrays', () => {
        expect(safe.paymentMethods([])).toBe('N/A');
        expect(safe.paymentMethods(null)).toBe('N/A');
        expect(safe.paymentMethods(undefined)).toBe('N/A');
      });
    });
  });
});