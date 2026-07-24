import { describe, expect, it } from 'vitest';
import {
  formatDeviceDisplayName,
  matchesSearchQuery,
  normalizeDeviceText,
  parseBrand,
  parseProductFamily,
  scoreSearchMatch,
  sortBySearchRelevance,
  toggleInSet,
} from '../../src/deviceMeta';

describe('deviceMeta', () => {
  describe('normalizeDeviceText', () => {
    it('normalizes separators and case', () => {
      expect(normalizeDeviceText('Apple_iPhone-11/Pro')).toBe('apple iphone 11 pro');
    });

    it('handles empty, unicode, emoji', () => {
      expect(normalizeDeviceText('')).toBe('');
      expect(normalizeDeviceText('  ')).toBe('');
      expect(normalizeDeviceText('Pixel 🎨')).toContain('pixel');
    });

    it('strips trailing -digits variants', () => {
      expect(normalizeDeviceText('Black-1')).toBe('black');
    });
  });

  describe('parseBrand', () => {
    it('detects known brands', () => {
      expect(parseBrand('Apple iPhone 11')).toBe('Apple');
      expect(parseBrand('Samsung Galaxy S9')).toBe('Samsung');
      expect(parseBrand('Google Pixel 4')).toBe('Google');
      expect(parseBrand('Pixel 4')).toBe('Google');
      expect(parseBrand('Nexus 5')).toBe('Google');
      expect(parseBrand('Motorola Moto X')).toBe('Motorola');
      expect(parseBrand('Moto G')).toBe('Motorola');
      expect(parseBrand('HTC One')).toBe('HTC');
      expect(parseBrand('Huawei P30')).toBe('Huawei');
      expect(parseBrand('Microsoft Surface')).toBe('Microsoft');
      expect(parseBrand('Lumia 950')).toBe('Microsoft');
      expect(parseBrand('Dell XPS')).toBe('Dell');
      expect(parseBrand('Sony Xperia')).toBe('Sony');
    });

    it('handles empty/undefined/unknown', () => {
      expect(parseBrand(undefined)).toBe('Other');
      expect(parseBrand('')).toBe('Other');
      expect(parseBrand('   ')).toBe('Other');
      expect(parseBrand('Nothing Phone')).toBe('Nothing');
    });
  });

  describe('parseProductFamily', () => {
    it('returns Unknown for empty', () => {
      expect(parseProductFamily(undefined)).toBe('Unknown');
      expect(parseProductFamily('')).toBe('Unknown');
    });

    it('strips colors and brands for family labels', () => {
      expect(parseProductFamily('Apple iPhone 11 Pro Max Space Grey')).toContain(
        'iPhone 11 Pro Max',
      );
    });

    it('formats watch families', () => {
      expect(parseProductFamily('Apple Watch 40mm Silver Aluminum')).toBe(
        'Apple Watch 40mm',
      );
    });
  });

  describe('formatDeviceDisplayName', () => {
    it('formats empty and variants', () => {
      expect(formatDeviceDisplayName(undefined)).toBe('Device');
      expect(formatDeviceDisplayName('')).toBe('Device');
      expect(formatDeviceDisplayName('Black-1')).toBe('Black -1');
    });
  });

  describe('search helpers', () => {
    const device = {
      name: 'Apple iPhone 11 Pro Max Space Grey',
      brand: 'Apple',
      productFamily: 'iPhone 11 Pro Max',
    };

    it('matches empty query as true', () => {
      expect(matchesSearchQuery(device, '')).toBe(true);
    });

    it('requires every token', () => {
      expect(matchesSearchQuery(device, 'iphone grey')).toBe(true);
      expect(matchesSearchQuery(device, 'iphone android')).toBe(false);
    });

    it('scores better for family prefix', () => {
      expect(scoreSearchMatch(device, 'iphone 11 pro max')).toBeGreaterThan(
        scoreSearchMatch(device, 'grey'),
      );
      expect(scoreSearchMatch(device, '')).toBe(0);
      expect(scoreSearchMatch(device, 'android')).toBe(-1);
    });

    it('sorts by relevance and alphabetical fallback', () => {
      const items = [
        { name: 'B Phone', brand: 'B', productFamily: 'B Phone' },
        { name: 'A Phone', brand: 'A', productFamily: 'A Phone' },
      ];
      expect(sortBySearchRelevance(items, '').map((i) => i.name)).toEqual([
        'A Phone',
        'B Phone',
      ]);
      expect(
        sortBySearchRelevance(
          [
            { name: 'Galaxy', brand: 'Samsung', productFamily: 'Galaxy' },
            { name: 'iPhone 11', brand: 'Apple', productFamily: 'iPhone 11' },
          ],
          'iphone',
        ).map((i) => i.name),
      ).toEqual(['iPhone 11']);
    });
  });

  describe('toggleInSet', () => {
    it('adds and removes', () => {
      expect(toggleInSet([], 'a')).toEqual(['a']);
      expect(toggleInSet(['a'], 'a')).toEqual([]);
      expect(toggleInSet(['a'], 'b')).toEqual(['a', 'b']);
    });
  });
});
