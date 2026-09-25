import { describe, expect, it } from 'vitest';
import { isPriorityPhone } from '../../src/deviceMeta';

describe('isPriorityPhone', () => {
  it('marks modern Apple phones as priority', () => {
    expect(isPriorityPhone('Apple iPhone X Space Grey')).toBe(true);
    expect(isPriorityPhone('Apple iPhone 11 Black')).toBe(true);
    expect(isPriorityPhone('Apple iPhone SE Black')).toBe(true);
  });

  it('leaves older Apple phones for on-demand loading', () => {
    expect(isPriorityPhone('Apple iPhone 5s Gold')).toBe(false);
    expect(isPriorityPhone('Apple iPhone 6s Space Gray')).toBe(false);
  });

  it('marks recent Samsung and Pixel models as priority', () => {
    expect(isPriorityPhone('Samsung Galaxy S9 Midnight Black')).toBe(true);
    expect(isPriorityPhone('Samsung Galaxy Note 5 Black')).toBe(true);
    expect(isPriorityPhone('Google Pixel 3 - Just Black')).toBe(true);
  });

  it('leaves older Android phones for on-demand loading', () => {
    expect(isPriorityPhone('Samsung Galaxy S5 Black')).toBe(false);
    expect(isPriorityPhone('Nexus 5x')).toBe(false);
  });
});
