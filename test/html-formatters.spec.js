import { describe, it, expect } from 'vitest';
import {
  escapeHTML,
  formatNumber,
  formatLargeNumber,
  formatPercentageChange,
  safeFormatNumber,
  safeFormatLargeNumber,
  safeFormatPercentageChange,
  createSafeHTMLMessage,
  bold,
  italic,
  code,
  link
} from '../src/utils/formatters.js';

describe('HTML Escaping Functions', () => {
  describe('escapeHTML', () => {
    it('should escape HTML special characters', () => {
      const input = 'Test & <tag> "quoted"';
      const expected = 'Test &amp; &lt;tag&gt; &quot;quoted&quot;';
      expect(escapeHTML(input)).toBe(expected);
    });

    it('should handle periods correctly (no escaping needed in HTML)', () => {
      expect(escapeHTML('123.45')).toBe('123.45');
      expect(escapeHTML('$1,234.56')).toBe('$1,234.56');
    });

    it('should handle dashes correctly (no escaping needed in HTML)', () => {
      expect(escapeHTML('100 - 500')).toBe('100 - 500');
    });

    it('should handle percentage correctly (no escaping needed in HTML)', () => {
      expect(escapeHTML('+5.23%')).toBe('+5.23%');
      expect(escapeHTML('-2.15%')).toBe('-2.15%');
    });

    it('should handle empty and non-string inputs', () => {
      expect(escapeHTML('')).toBe('');
      expect(escapeHTML(null)).toBe('');
      expect(escapeHTML(undefined)).toBe('');
      expect(escapeHTML(123)).toBe('');
    });

    it('should handle parentheses and brackets (no escaping needed in HTML)', () => {
      expect(escapeHTML('Bitcoin (BTC)')).toBe('Bitcoin (BTC)');
      expect(escapeHTML('[BTC] Bitcoin')).toBe('[BTC] Bitcoin');
    });

    it('should handle ampersands correctly', () => {
      expect(escapeHTML('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });
  });

  describe('Safe formatting functions', () => {
    it('should safely format numbers with HTML escaping', () => {
      expect(safeFormatNumber(123.456, 2)).toBe('123.46');
    });

    it('should safely format large numbers with HTML escaping', () => {
      expect(safeFormatLargeNumber(1500)).toBe('1.50K');
    });

    it('should safely format percentage changes', () => {
      const result = safeFormatPercentageChange(5.23);
      expect(result).toContain('🟢');
      expect(result).toContain('+5.23%');
    });
  });

  describe('HTML formatting helpers', () => {
    it('should create bold text with HTML tags', () => {
      expect(bold('Bitcoin (BTC)')).toBe('<b>Bitcoin (BTC)</b>');
    });

    it('should create italic text with HTML tags', () => {
      expect(italic('Bitcoin (BTC)')).toBe('<i>Bitcoin (BTC)</i>');
    });

    it('should create code text with HTML tags', () => {
      expect(code('/coin bitcoin')).toBe('<code>/coin bitcoin</code>');
    });

    it('should create links with HTML tags', () => {
      expect(link('Bitcoin (BTC)', 'https://bitcoin.org')).toBe('<a href="https://bitcoin.org">Bitcoin (BTC)</a>');
    });

    it('should escape content within HTML tags', () => {
      expect(bold('Tom & Jerry')).toBe('<b>Tom &amp; Jerry</b>');
      expect(code('<script>')).toBe('<code>&lt;script&gt;</code>');
    });
  });

  describe('createSafeHTMLMessage', () => {
    it('should replace placeholders with escaped values', () => {
      const template = 'Hello {name}, your balance is {amount}';
      const values = { name: 'Tom & Jerry', amount: '123.45' };
      const expected = 'Hello Tom &amp; Jerry, your balance is 123.45';
      expect(createSafeHTMLMessage(template, values)).toBe(expected);
    });

    it('should handle missing values gracefully', () => {
      const template = 'Hello {name}, your balance is {amount}';
      const values = { name: 'Tom' };
      const expected = 'Hello Tom, your balance is {amount}';
      expect(createSafeHTMLMessage(template, values)).toBe(expected);
    });
  });

  describe('Real-world scenarios', () => {
    it('should properly handle common crypto price formats', () => {
      const testCases = [
        { input: 'Bitcoin (BTC): $45,123.67', expected: 'Bitcoin (BTC): $45,123.67' },
        { input: 'Change: +5.23%', expected: 'Change: +5.23%' },
        { input: 'Range: 100-1000 ETB', expected: 'Range: 100-1000 ETB' },
        { input: 'Success: 98.5%', expected: 'Success: 98.5%' }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(escapeHTML(input)).toBe(expected);
      });
    });

    it('should handle trader names with special HTML characters', () => {
      const traderNames = [
        'User_123',
        'Trader.Pro',
        'Best-Trader',
        'Crypto[King]',
        'Trader(Expert)',
        'Top+Trader',
        'User=123',
        'Tom & Jerry',
        '<script>alert("hack")</script>'
      ];

      traderNames.forEach(name => {
        const escaped = escapeHTML(name);
        
        // Test specific cases to ensure they're properly handled in HTML
        if (name === 'Tom & Jerry') {
          expect(escaped).toBe('Tom &amp; Jerry');
        }
        if (name === '<script>alert("hack")</script>') {
          expect(escaped).toBe('&lt;script&gt;alert(&quot;hack&quot;)&lt;/script&gt;');
        }
      });
    });
  });
});