import { describe, expect, it, vi } from 'vitest';
import {
  getLayoutPreset,
  indexLibraryByCatalog,
  resolvePresetDevices,
  resolveSlotPosition,
  LAYOUT_PRESETS,
} from '../../src/layoutPresets';
import { makeDevice } from '../helpers/fixtures';

describe('layoutPresets', () => {
  it('lists presets and finds by id', () => {
    expect(LAYOUT_PRESETS.length).toBeGreaterThan(0);
    expect(getLayoutPreset('apple-lineup')?.label).toBe('Apple lineup');
    expect(getLayoutPreset('missing')).toBeUndefined();
    expect(getLayoutPreset('')).toBeUndefined();
  });

  it('resolveSlotPosition supports nx/nBottom and centering', () => {
    expect(
      resolveSlotPosition(
        { catalogFile: 'x', nx: 0.5, nBottom: 0.1 },
        100,
        200,
        1000,
        1000,
      ),
    ).toEqual({ x: 500, y: 700 });

    expect(
      resolveSlotPosition(
        { catalogFile: 'x', centerX: true, centerY: true },
        100,
        200,
        1000,
        1000,
      ),
    ).toEqual({ x: 450, y: 400 });
  });

  it('indexes library by catalog file', () => {
    const device = makeDevice({
      catalogFile: 'phones/Apple iPhone 11 Black.svg',
      name: 'Apple iPhone 11 Black',
    });
    const map = indexLibraryByCatalog({ phones: [device] });
    expect(map.get(device.catalogFile)).toBe(device);
  });

  it('resolvePresetDevices skips missing assets with warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const preset = getLayoutPreset('apple-lineup')!;
    const resolved = resolvePresetDevices(preset, new Map());
    expect(resolved).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('resolvePresetDevices returns matches', () => {
    const preset = getLayoutPreset('apple-lineup')!;
    const map = new Map(
      preset.items.map((slot) => [
        slot.catalogFile,
        makeDevice({ catalogFile: slot.catalogFile, name: slot.catalogFile }),
      ]),
    );
    expect(resolvePresetDevices(preset, map)).toHaveLength(preset.items.length);
  });
});
