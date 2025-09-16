import { describe, it, expect } from 'vitest';
import {
  escapeMarkdownV2,
  formatNumber,
  formatLargeNumber,
  formatPercentageChange,
  safeFormatNumber,
  safeFormatLargeNumber,
  safeFormatPercentageChange,
  createSafeMarkdownV2Message,
  bold,
  italic,
  code,
  link
} from '../src/utils/formatters.js';

describe('MarkdownV2 Escaping Functions', () => {
  describe('escapeMarkdownV2', () => {
    it('should escape all special characters', () => {
      const specialChars = '_*[]()~`>#+-=|{}.!\\';
      const input = 'Test_*[]()~`>#+-=|{}.!\\special';
      const expected = 'Test\\_\\*\\[\\]\\(\\)\\~\\`\\>\\#\\+\\-\\=\\|\\{\\}\\.\\!\\\\special';
      expect(escapeMarkdownV2(input)).toBe(expected);
    });

    it('should handle periods correctly (common in prices)', () => {
      expect(escapeMarkdownV2('123.45')).toBe('123\\.45');
      expect(escapeMarkdownV2('$1,234.56')).toBe('$1,234\\.56');
    });

    it('should handle dashes correctly (common in ranges)', () => {
      expect(escapeMarkdownV2('100 - 500')).toBe('100 \\- 500');
    });

    it('should handle percentage correctly', () => {
      expect(escapeMarkdownV2('+5.23%')).toBe('\\+5\\.23%');
      expect(escapeMarkdownV2('-2.15%')).toBe('\\-2\\.15%');
    });

    it('should handle empty and non-string inputs', () => {
      expect(escapeMarkdownV2('')).toBe('');
      expect(escapeMarkdownV2(null)).toBe('');
      expect(escapeMarkdownV2(undefined)).toBe('');
      expect(escapeMarkdownV2(123)).toBe('');
    });

    it('should handle parentheses and brackets', () => {
      expect(escapeMarkdownV2('Bitcoin (BTC)')).toBe('Bitcoin \\(BTC\\)');
      expect(escapeMarkdownV2('[Website]')).toBe('\\[Website\\]');
    });
  });

  describe('Safe formatting functions', () => {
    it('should safely format numbers with escaping', () => {
      expect(safeFormatNumber(123.456, 2)).toBe('123\\.46');
      expect(safeFormatNumber(1234.567, 3)).toBe('1,234\\.567');
    });

    it('should safely format large numbers with escaping', () => {
      expect(safeFormatLargeNumber(1500)).toBe('1\\.50K');
      expect(safeFormatLargeNumber(2000000)).toBe('2\\.00M');
      expect(safeFormatLargeNumber(3000000000)).toBe('3\\.00B');
    });

    it('should safely format percentage changes', () => {
      const positiveResult = safeFormatPercentageChange(5.23);
      expect(positiveResult).toContain('\\+5\\.23%');
      
      const negativeResult = safeFormatPercentageChange(-2.15);
      expect(negativeResult).toContain('\\-2\\.15%');
    });
  });

  describe('MarkdownV2 formatting helpers', () => {
    it('should create bold text with proper escaping', () => {
      expect(bold('Bitcoin (BTC)')).toBe('*Bitcoin \\(BTC\\)*');
      expect(bold('Price: $123.45')).toBe('*Price: $123\\.45*');
    });

    it('should create italic text with proper escaping', () => {
      expect(italic('Bitcoin (BTC)')).toBe('_Bitcoin \\(BTC\\)_');
    });

    it('should create code text with proper escaping', () => {
      expect(code('/coin bitcoin')).toBe('`/coin bitcoin`');
      expect(code('price: 123.45')).toBe('`price: 123\\.45`');
    });

    it('should create links with proper escaping', () => {
      expect(link('Bitcoin (BTC)', 'https://bitcoin.org')).toBe('[Bitcoin \\(BTC\\)](https://bitcoin.org)');
    });
  });

  describe('createSafeMarkdownV2Message', () => {
    it('should replace placeholders with escaped values', () => {
      const template = '*{title}* - Price: {price}';
      const values = {
        title: 'Bitcoin (BTC)',
        price: '$123.45'
      };
      const result = createSafeMarkdownV2Message(template, values);
      expect(result).toBe('*Bitcoin \\(BTC\\)* - Price: $123\\.45');
    });

    it('should handle missing values gracefully', () => {
      const template = '*{title}* - Price: {price}';
      const values = { title: 'Bitcoin' };
      const result = createSafeMarkdownV2Message(template, values);
      expect(result).toBe('*Bitcoin* - Price: {price}');
    });
  });
});

describe('Real-world scenarios', () => {
  it('should properly escape common crypto price formats', () => {
    const testCases = [
      { input: '$1,234.56', expected: '$1,234\\.56' },
      { input: '+5.23%', expected: '\\+5\\.23%' },
      { input: '-2.15%', expected: '\\-2\\.15%' },
      { input: '100 - 500 ETB', expected: '100 \\- 500 ETB' },
      { input: 'Bitcoin (BTC)', expected: 'Bitcoin \\(BTC\\)' },
      { input: 'Limits: 100-1000', expected: 'Limits: 100\\-1000' },
      { input: 'Success: 98.5%', expected: 'Success: 98\\.5%' }
    ];

    testCases.forEach(({ input, expected }) => {
      expect(escapeMarkdownV2(input)).toBe(expected);
    });
  });

  it('should handle trader names from P2P with special characters', () => {
    const traderNames = [
      'User_123',
      'Trader.Pro',
      'Best-Trader',
      'Crypto[King]',
      'Trader(Expert)',
      'Top+Trader',
      'User=123'
    ];

    traderNames.forEach(name => {
      const escaped = escapeMarkdownV2(name);
      
      // Test specific cases to ensure they're properly escaped
      if (name === 'User_123') {
        expect(escaped).toBe('User\\_123');
      }
      if (name === 'Trader.Pro') {
        expect(escaped).toBe('Trader\\.Pro');
      }
      if (name === 'Best-Trader') {
        expect(escaped).toBe('Best\\-Trader');
      }
      if (name === 'Crypto[King]') {
        expect(escaped).toBe('Crypto\\[King\\]');
      }
      if (name === 'Trader(Expert)') {
        expect(escaped).toBe('Trader\\(Expert\\)');
      }
      if (name === 'Top+Trader') {
        expect(escaped).toBe('Top\\+Trader');
      }
      if (name === 'User=123') {
        expect(escaped).toBe('User\\=123');
      }
    });
  });
});