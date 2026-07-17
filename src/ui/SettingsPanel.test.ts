import { describe, expect, it } from 'vitest';

interface SettingsPanelModule {
  CAMERA_DISTANCE_CONTROL?: {
    label: string;
    min: number;
    max: number;
    step: number;
    applyMode: 'live' | 'release';
  };
  formatSliderValue?: (value: number, format?: 'percent' | 'metres') => string;
}

async function loadSettingsPanel(): Promise<SettingsPanelModule> {
  const modulePath = './SettingsPanel';
  return import(/* @vite-ignore */ modulePath) as Promise<SettingsPanelModule>;
}

describe('camera distance control', () => {
  it('uses the accepted range and a metre readout while applying live', async () => {
    const module = await loadSettingsPanel();
    expect(module.CAMERA_DISTANCE_CONTROL).toEqual({
      label: 'Camera distance',
      min: 5,
      max: 12,
      step: 0.5,
      applyMode: 'live',
    });
    expect(module.formatSliderValue?.(8.5, 'metres')).toBe('8.5 m');
    expect(module.formatSliderValue?.(10, 'metres')).toBe('10 m');
    expect(module.formatSliderValue?.(0.8)).toBe('80%');
  });
});
