import { describe, expect, it } from 'vitest';
import * as RenderLighting from './renderLighting';

describe('boundedDevicePixelRatio', () => {
  it('preserves valid ratios, caps high-DPI displays at 2 and rejects invalid values', () => {
    const bounded = (RenderLighting as unknown as { boundedDevicePixelRatio?: (value: number) => number })
      .boundedDevicePixelRatio;
    expect(bounded).toBeTypeOf('function');
    if (!bounded) return;

    expect(bounded(1)).toBe(1);
    expect(bounded(1.5)).toBe(1.5);
    expect(bounded(3.5)).toBe(2);
    expect(bounded(Number.NaN)).toBe(1);
    expect(bounded(0)).toBe(1);
  });
});
