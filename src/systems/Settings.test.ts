import { describe, expect, it } from 'vitest';
import { loadSettings, saveSettings, SETTINGS_DEFAULTS, shouldApplySliderValue } from './Settings';
import type { StorageLike } from './Progress';

function mockStore(): StorageLike & { data: Record<string, string> } {
  return {
    data: {},
    getItem(key) {
      return this.data[key] ?? null;
    },
    setItem(key, value) {
      this.data[key] = value;
    },
  };
}

describe('Settings', () => {
  it('commits expensive sliders on release while ordinary sliders remain live', () => {
    expect(shouldApplySliderValue('live', 'input')).toBe(true);
    expect(shouldApplySliderValue('live', 'change')).toBe(false);
    expect(shouldApplySliderValue('release', 'input')).toBe(false);
    expect(shouldApplySliderValue('release', 'change')).toBe(true);
  });

  it('fresh visitor gets the accessibility-first defaults: shake 0, reduced motion, assist off', () => {
    const s = loadSettings(mockStore());
    expect(s).toEqual(SETTINGS_DEFAULTS);
    expect(s.cameraDistance).toBe(8.5);
    expect(s.shakeIntensity).toBe(0);
    expect(s.motionLevel).toBe('reduced');
    expect(s.assistMode).toBe(false);
  });

  it('round-trips v2 camera distance through storage', () => {
    const store = mockStore();
    saveSettings(
      { ...SETTINGS_DEFAULTS, masterVolume: 0.4, assistMode: true, motionLevel: 'full', cameraDistance: 10 },
      store,
    );
    const s = loadSettings(store);
    expect(JSON.parse(store.data['tailgate-after-hours.settings'])).toMatchObject({ version: 2, cameraDistance: 10 });
    expect(s.masterVolume).toBe(0.4);
    expect(s.assistMode).toBe(true);
    expect(s.motionLevel).toBe('full');
    expect(s.cameraDistance).toBe(10);
  });

  it('migrates valid v1 fields explicitly and adds the 8.5 m camera default', () => {
    const store = mockStore();
    store.data['tailgate-after-hours.settings'] = JSON.stringify({
      version: 1,
      masterVolume: 0.35,
      hudScale: 1.25,
      highContrast: true,
      shakeIntensity: 0.2,
      visibilityFloor: 0.4,
      motionLevel: 'full',
      assistMode: true,
      cameraDistance: 12,
    });

    expect(loadSettings(store)).toEqual({
      masterVolume: 0.35,
      hudScale: 1.25,
      highContrast: true,
      shakeIntensity: 0.2,
      visibilityFloor: 0.4,
      motionLevel: 'full',
      assistMode: true,
      cameraDistance: 8.5,
    });
  });

  it('sanitises malformed stored values back to defaults or clamps', () => {
    const store = mockStore();
    store.data['tailgate-after-hours.settings'] = JSON.stringify({
      version: 2,
      masterVolume: 9,
      hudScale: 'huge',
      shakeIntensity: -3,
      visibilityFloor: 2,
      motionLevel: 'chaotic',
      assistMode: 'yes',
      cameraDistance: 'far away',
    });
    const s = loadSettings(store);
    expect(s.masterVolume).toBe(1); // clamped
    expect(s.hudScale).toBe(SETTINGS_DEFAULTS.hudScale); // non-numeric -> default
    expect(s.shakeIntensity).toBe(0);
    expect(s.visibilityFloor).toBe(0.7); // clamped to ceiling
    expect(s.motionLevel).toBe('reduced');
    expect(s.assistMode).toBe(false); // non-boolean -> off
    expect(s.cameraDistance).toBe(8.5);
  });

  it('clamps finite v2 camera distances to the accepted 5-12 m range', () => {
    const store = mockStore();
    store.data['tailgate-after-hours.settings'] = JSON.stringify({ version: 2, cameraDistance: 99 });
    expect(loadSettings(store).cameraDistance).toBe(12);
    store.data['tailgate-after-hours.settings'] = JSON.stringify({ version: 2, cameraDistance: -2 });
    expect(loadSettings(store).cameraDistance).toBe(5);
  });

  it('ignores an unknown version and survives corrupt JSON and missing storage', () => {
    const store = mockStore();
    store.data['tailgate-after-hours.settings'] = JSON.stringify({ version: 99, masterVolume: 0.1 });
    expect(loadSettings(store)).toEqual(SETTINGS_DEFAULTS);
    store.data['tailgate-after-hours.settings'] = '{broken';
    expect(loadSettings(store)).toEqual(SETTINGS_DEFAULTS);
    expect(loadSettings(null)).toEqual(SETTINGS_DEFAULTS);
    expect(() => saveSettings(SETTINGS_DEFAULTS, null)).not.toThrow();
  });
});
