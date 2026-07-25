import { describe, expect, it } from 'vitest';
import {
  coverScaleForViewport,
  getWebsiteViewport,
  isValidWebsiteUrl,
  normalizeWebsiteUrl,
  websiteHostname,
} from '../../src/websiteUrl';

describe('normalizeWebsiteUrl', () => {
  it('accepts https URLs', () => {
    expect(normalizeWebsiteUrl('https://example.com/path')).toBe(
      'https://example.com/path',
    );
  });

  it('prepends https when scheme is missing', () => {
    expect(normalizeWebsiteUrl('example.com')).toBe('https://example.com/');
  });

  it('rejects empty, whitespace, and bad schemes', () => {
    expect(normalizeWebsiteUrl('')).toBeNull();
    expect(normalizeWebsiteUrl('   ')).toBeNull();
    expect(normalizeWebsiteUrl('example .com')).toBeNull();
    expect(normalizeWebsiteUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeWebsiteUrl('ftp://example.com')).toBeNull();
  });

  it('isValidWebsiteUrl mirrors normalize', () => {
    expect(isValidWebsiteUrl('https://a.co')).toBe(true);
    expect(isValidWebsiteUrl('not a url')).toBe(false);
  });
});

describe('getWebsiteViewport', () => {
  it('returns phone viewport', () => {
    expect(getWebsiteViewport('phones', 'phones/iPhone.svg')).toEqual({
      width: 390,
      height: 844,
    });
  });

  it('returns tablet portrait and landscape', () => {
    expect(getWebsiteViewport('tablets', 'tablets/iPad Gold.svg')).toEqual({
      width: 768,
      height: 1024,
    });
    expect(
      getWebsiteViewport(
        'tablets',
        'tablets/Apple iPad Pro 11-inch Silver - Landscape.svg',
      ),
    ).toEqual({ width: 1024, height: 768 });
    expect(
      getWebsiteViewport('tablets', 'displays/Dell UltraSharp 24-inch 90deg.svg'),
    ).toEqual({ width: 1024, height: 768 });
  });

  it('returns desktop for computers/displays and watch size for watches', () => {
    expect(getWebsiteViewport('computers', 'computers/Apple iMac.svg')).toEqual(
      {
        width: 1440,
        height: 900,
      },
    );
    expect(getWebsiteViewport('displays', 'displays/XDR.svg')).toEqual({
      width: 1440,
      height: 900,
    });
    expect(getWebsiteViewport('watches', 'watches/Watch.svg')).toEqual({
      width: 320,
      height: 360,
    });
  });
});

describe('websiteHostname / coverScaleForViewport', () => {
  it('extracts hostname', () => {
    expect(websiteHostname('https://www.example.com/x')).toBe('www.example.com');
  });

  it('cover scale fills destination', () => {
    const scale = coverScaleForViewport(390, 844, 195, 422);
    expect(scale).toBeCloseTo(0.5, 6);
    const tall = coverScaleForViewport(390, 844, 200, 500);
    expect(tall).toBeCloseTo(500 / 844, 6);
  });
});
