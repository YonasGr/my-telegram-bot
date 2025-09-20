import { describe, it, expect } from 'vitest';
import {
  escapeHTML,
  escapeMarkdownV2, // Legacy compatibility
  formatNumber,
  formatLargeNumber,
  formatPercentageChange,
  safeFormatNumber,
  safeFormatLargeNumber,
  safeFormatPercentageChange,
  createSafeHTMLMessage,
  createSafeMarkdownV2Message, // Legacy compatibility
  bold,
  italic,
  code,
  link
} from '../src/utils/formatters.js';

describe('HTML Escaping Functions', () => {
  describe('escapeHTML', () => {
    it('should escape HTML special characters', () => {
      const input = 'Test <tag> & "quotes"';
      const expected = 'Test &lt;tag&gt; &amp; "quotes"';
      expect(escapeHTML(input)).toBe(expected);
    });

    it('should handle common HTML entities', () => {
      expect(escapeHTML('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
      expect(escapeHTML('5 < 10 > 3')).toBe('5 &lt; 10 &gt; 3');
      expect(escapeHTML('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('should handle empty and non-string inputs', () => {
      expect(escapeHTML('')).toBe('');
      expect(escapeHTML(null)).toBe('');
      expect(escapeHTML(undefined)).toBe('');
      expect(escapeHTML(123)).toBe('');
    });

    it('should preserve safe characters', () => {
      expect(escapeHTML('Bitcoin (BTC)')).toBe('Bitcoin (BTC)');
      expect(escapeHTML('123.45')).toBe('123.45');
      expect(escapeHTML('$1,234.56')).toBe('$1,234.56');
      expect(escapeHTML('+5.23%')).toBe('+5.23%');
    });
  });

  describe('Legacy MarkdownV2 compatibility', () => {
    it('should delegate escapeMarkdownV2 to escapeHTML', () => {
      expect(escapeMarkdownV2('<test>')).toBe(escapeHTML('<test>'));
      expect(escapeMarkdownV2('Bitcoin & Ethereum')).toBe(escapeHTML('Bitcoin & Ethereum'));
    });
  });

  describe('Safe formatting functions', () => {
    it('should safely format numbers with HTML escaping', () => {
      expect(safeFormatNumber(123.456, 2)).toBe('123.46');
      expect(safeFormatNumber(1234.567, 3)).toBe('1,234.567');
    });

    it('should safely format large numbers with HTML escaping', () => {
      expect(safeFormatLargeNumber(1500)).toBe('1.50K');
      expect(safeFormatLargeNumber(2000000)).toBe('2.00M');
      expect(safeFormatLargeNumber(3000000000)).toBe('3.00B');
    });

    it('should safely format percentage changes', () => {
      const positiveResult = safeFormatPercentageChange(5.23);
      expect(positiveResult).toContain('+5.23%');
      
      const negativeResult = safeFormatPercentageChange(-2.15);
      expect(negativeResult).toContain('-2.15%');
    });

    it('should handle special HTML characters in numbers', () => {
      // These shouldn't occur normally, but testing edge cases
      expect(safeFormatNumber(null)).toBe('N/A');
      expect(safeFormatNumber(undefined)).toBe('N/A');
    });
  });

  describe('HTML formatting helpers', () => {
    it('should create bold text with proper HTML escaping', () => {
      expect(bold('Bitcoin (BTC)')).toBe('<b>Bitcoin (BTC)</b>');
      expect(bold('Price: $123.45')).toBe('<b>Price: $123.45</b>');
      expect(bold('<script>')).toBe('<b>&lt;script&gt;</b>');
    });

    it('should create italic text with proper HTML escaping', () => {
      expect(italic('Bitcoin (BTC)')).toBe('<i>Bitcoin (BTC)</i>');
      expect(italic('<em>text</em>')).toBe('<i>&lt;em&gt;text&lt;/em&gt;</i>');
    });

    it('should create code text with proper HTML escaping', () => {
      expect(code('/coin bitcoin')).toBe('<code>/coin bitcoin</code>');
      expect(code('price: 123.45')).toBe('<code>price: 123.45</code>');
      expect(code('<script>alert("test")</script>')).toBe('<code>&lt;script&gt;alert("test")&lt;/script&gt;</code>');
    });

    it('should create links with proper HTML escaping', () => {
      expect(link('Bitcoin (BTC)', 'https://bitcoin.org')).toBe('<a href="https://bitcoin.org">Bitcoin (BTC)</a>');
      expect(link('<script>XSS</script>', 'https://example.com')).toBe('<a href="https://example.com">&lt;script&gt;XSS&lt;/script&gt;</a>');
    });
  });

  describe('createSafeHTMLMessage', () => {
    it('should replace placeholders with HTML-escaped values', () => {
      const template = '<b>{title}</b> - Price: {price}';
      const values = {
        title: 'Bitcoin (BTC)',
        price: '$123.45'
      };
      const result = createSafeHTMLMessage(template, values);
      expect(result).toBe('<b>Bitcoin (BTC)</b> - Price: $123.45');
    });

    it('should handle HTML entities in values', () => {
      const template = 'Alert: {message}';
      const values = { message: '<script>alert("test")</script>' };
      const result = createSafeHTMLMessage(template, values);
      expect(result).toBe('Alert: &lt;script&gt;alert("test")&lt;/script&gt;');
    });

    it('should handle missing values gracefully', () => {
      const template = '<b>{title}</b> - Price: {price}';
      const values = { title: 'Bitcoin' };
      const result = createSafeHTMLMessage(template, values);
      expect(result).toBe('<b>Bitcoin</b> - Price: {price}');
    });

    it('should provide legacy compatibility for createSafeMarkdownV2Message', () => {
      const template = '{coin} and {other}';
      const values = { coin: 'Bitcoin & Ethereum', other: '<test>' };
      const result = createSafeMarkdownV2Message(template, values);
      expect(result).toBe('Bitcoin &amp; Ethereum and &lt;test&gt;');
    });
  });
});

describe('Real-world scenarios with HTML formatting', () => {
  it('should properly handle common crypto price formats with HTML escaping', () => {
    const testCases = [
      { input: '$1,234.56', expected: '$1,234.56' },
      { input: '+5.23%', expected: '+5.23%' },
      { input: '-2.15%', expected: '-2.15%' },
      { input: '100 - 500 ETB', expected: '100 - 500 ETB' },
      { input: 'Bitcoin (BTC)', expected: 'Bitcoin (BTC)' },
      { input: 'Limits: 100-1000', expected: 'Limits: 100-1000' },
      { input: 'Success: 98.5%', expected: 'Success: 98.5%' },
      { input: '<script>alert("xss")</script>', expected: '&lt;script&gt;alert("xss")&lt;/script&gt;' },
      { input: 'Tom & Jerry', expected: 'Tom &amp; Jerry' },
      { input: '5 < 10 > 3', expected: '5 &lt; 10 &gt; 3' }
    ];

    testCases.forEach(({ input, expected }) => {
      expect(escapeHTML(input)).toBe(expected);
    });
  });

  it('should handle trader names with HTML entities instead of MarkdownV2 escaping', () => {
    const traderNames = [
      'User_123',
      'Trader.Pro', 
      'Best-Trader',
      'Crypto[King]',
      'Trader(Expert)',
      'Top+Trader',
      'User=123',
      'Trader<script>',
      'User&Co'
    ];

    traderNames.forEach(name => {
      const escaped = escapeHTML(name);
      
      // Should NOT contain MarkdownV2 escapes
      expect(escaped).not.toContain('\\_');
      expect(escaped).not.toContain('\\.');
      expect(escaped).not.toContain('\\-');
      expect(escaped).not.toContain('\\[');
      expect(escaped).not.toContain('\\(');
      expect(escaped).not.toContain('\\+');
      expect(escaped).not.toContain('\\=');
      
      // Should handle HTML entities correctly
      if (name.includes('<')) {
        expect(escaped).toContain('&lt;');
      }
      if (name.includes('>')) {
        expect(escaped).toContain('&gt;');
      }
      if (name.includes('&')) {
        expect(escaped).toContain('&amp;');
      }
      
      // Regular characters should remain unchanged
      if (name === 'User_123') {
        expect(escaped).toBe('User_123');
      }
      if (name === 'Trader.Pro') {
        expect(escaped).toBe('Trader.Pro');
      }
    });
  });

  it('should test legacy escapeMarkdownV2 compatibility', () => {
    // Legacy function should now delegate to HTML escaping
    expect(escapeMarkdownV2('Bitcoin & Ethereum')).toBe('Bitcoin &amp; Ethereum');
    expect(escapeMarkdownV2('<test>')).toBe('&lt;test&gt;');
  });
});