import { describe, expect, it, beforeEach } from 'vitest';
import {
  applySizeScale,
  displayHeightFor,
  displayHeightForContent,
  displaySizeFromMm,
  getArtboardFormat,
  getDisplayWidth,
  getSizeScalePreset,
  persistArtboardFormatId,
  persistSizeScaleId,
  PX_PER_MM,
  readStoredArtboardFormatId,
  readStoredSizeScaleId,
} from '../../src/deviceScale';

describe('deviceScale', () => {
  beforeEach(() => localStorage.clear());

  it('getArtboardFormat falls back to default', () => {
    expect(getArtboardFormat('16-9').label).toBe('16:9');
    expect(getArtboardFormat('missing').id).toBe('16-9');
    expect(getArtboardFormat('')).toBe(getArtboardFormat('16-9'));
  });

  it('reads/persists artboard format with legacy migration', () => {
    expect(readStoredArtboardFormatId()).toBe('16-9');
    persistArtboardFormatId('1-1');
    expect(readStoredArtboardFormatId()).toBe('1-1');
    localStorage.removeItem('pixelMockup.artboardFormat');
    localStorage.setItem('mockupStudio.artboardFormat', '9-16');
    expect(readStoredArtboardFormatId()).toBe('9-16');
    localStorage.setItem('pixelMockup.artboardFormat', 'bogus');
    expect(readStoredArtboardFormatId()).toBe('16-9');
  });

  it('size scale presets and persistence', () => {
    expect(getSizeScalePreset('2x').label).toBe('Actual');
    expect(getSizeScalePreset('nope').id).toBe('1x');
    expect(readStoredSizeScaleId()).toBe('1x');
    persistSizeScaleId('0.5x');
    expect(readStoredSizeScaleId()).toBe('0.5x');
  });

  it('applySizeScale multiplies dimensions', () => {
    expect(applySizeScale(100, 200, 0.5)).toEqual({
      displayWidth: 50,
      displayHeight: 100,
    });
    expect(applySizeScale(0, 0, 2)).toEqual({ displayWidth: 0, displayHeight: 0 });
  });

  it('getDisplayWidth uses fallbacks', () => {
    expect(getDisplayWidth('phones')).toBe(100);
    expect(getDisplayWidth('unknown')).toBe(120);
    expect(getDisplayWidth('')).toBe(120);
  });

  it('displayHeightFor guards zero width', () => {
    expect(displayHeightFor(100, 0, 200)).toBe(100);
    expect(displayHeightFor(100, 50, 100)).toBe(200);
  });

  it('displayHeightForContent falls back', () => {
    expect(displayHeightForContent(100, 0, 10, 99)).toBe(99);
    expect(displayHeightForContent(100, 50, 25, 99)).toBe(50);
  });

  it('displaySizeFromMm uses mm scale', () => {
    const size = displaySizeFromMm(100, 200);
    expect(size.displayWidth).toBeCloseTo(100 * PX_PER_MM);
    expect(size.displayHeight).toBeCloseTo(200 * PX_PER_MM);
  });

  it('displaySizeFromMm swaps landscape axes', () => {
    const size = displaySizeFromMm(100, 200, { name: 'iPad Landscape' });
    expect(size.displayWidth).toBeCloseTo(200 * PX_PER_MM);
    expect(size.displayHeight).toBeCloseTo(100 * PX_PER_MM);
  });

  it('displaySizeFromMm falls back when mm missing', () => {
    const size = displaySizeFromMm(undefined, undefined, {
      category: 'phones',
      nativeWidth: 50,
      nativeHeight: 100,
    });
    expect(size.displayWidth).toBe(100);
    expect(size.displayHeight).toBe(200);
  });

  it('displaySizeFromMm open watch uses image aspect', () => {
    const size = displaySizeFromMm(40, 40, {
      name: 'Apple Watch 40mm Open',
      category: 'watches',
      nativeWidth: 100,
      nativeHeight: 400,
    });
    expect(size.displayWidth).toBeCloseTo(40 * PX_PER_MM);
    expect(size.displayHeight).toBeCloseTo(size.displayWidth * 4);
  });

  it('displaySizeFromMm invalid mm uses category fallback', () => {
    const size = displaySizeFromMm(0, -1, { category: 'tablets' });
    expect(size.displayWidth).toBe(160);
  });
});
