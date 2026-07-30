import { describe, expect, it } from 'vitest';
import {
  coverScaleForViewport,
  getWebsiteViewport,
  isBlockedAddress,
  isValidWebsiteUrl,
  normalizeWebsiteUrl,
  websiteHostname,
  websiteInputIssue,
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

  it('rejects empty, whitespace, bad schemes, credentials, and private hosts', () => {
    expect(normalizeWebsiteUrl('')).toBeNull();
    expect(normalizeWebsiteUrl('   ')).toBeNull();
    expect(normalizeWebsiteUrl('example .com')).toBeNull();
    expect(normalizeWebsiteUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeWebsiteUrl('ftp://example.com')).toBeNull();
    expect(normalizeWebsiteUrl('http://user:pass@example.com')).toBeNull();
    expect(normalizeWebsiteUrl('http://127.0.0.1/')).toBeNull();
    expect(normalizeWebsiteUrl('http://localhost/')).toBeNull();
    expect(normalizeWebsiteUrl('http://169.254.169.254/latest/meta-data/')).toBeNull();
    expect(normalizeWebsiteUrl('http://10.1.2.3/')).toBeNull();
    expect(normalizeWebsiteUrl('http://192.168.1.1/')).toBeNull();
    expect(normalizeWebsiteUrl('http://172.16.0.1/')).toBeNull();
    expect(normalizeWebsiteUrl('http://[::1]/')).toBeNull();
  });

  it('isBlockedAddress covers private and metadata ranges', () => {
    expect(isBlockedAddress('127.0.0.1')).toBe(true);
    expect(isBlockedAddress('169.254.169.254')).toBe(true);
    expect(isBlockedAddress('10.1.2.3')).toBe(true);
    expect(isBlockedAddress('192.168.1.1')).toBe(true);
    expect(isBlockedAddress('::1')).toBe(true);
    expect(isBlockedAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedAddress('::ffff:7f00:1')).toBe(true);
    expect(isBlockedAddress('::ffff:a9fe:a9fe')).toBe(true);
    expect(isBlockedAddress('::ffff:0a00:1')).toBe(true);
    expect(isBlockedAddress('::ffff:c0a8:1')).toBe(true);
    expect(isBlockedAddress('example.com')).toBe(false);
    expect(isBlockedAddress('::ffff:0808:0808')).toBe(false); // 8.8.8.8
  });

  it('rejects mapped IPv6 literals in URLs', () => {
    expect(normalizeWebsiteUrl('http://[::ffff:7f00:1]/')).toBeNull();
    expect(normalizeWebsiteUrl('http://[::ffff:a9fe:a9fe]/')).toBeNull();
  });

  it('isValidWebsiteUrl mirrors normalize', () => {
    expect(isValidWebsiteUrl('https://a.co')).toBe(true);
    expect(isValidWebsiteUrl('not a url')).toBe(false);
  });

  it('websiteInputIssue distinguishes blocked hosts from invalid input', () => {
    expect(websiteInputIssue('https://example.com')).toBeNull();
    expect(websiteInputIssue('http://127.0.0.1/')).toBe('blocked_host');
    expect(websiteInputIssue('http://localhost/')).toBe('blocked_host');
    expect(websiteInputIssue('')).toBe('invalid_url');
    expect(websiteInputIssue('ftp://example.com')).toBe('invalid_url');
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
