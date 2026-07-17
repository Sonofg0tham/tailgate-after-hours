import { describe, expect, it } from 'vitest';
import { AudioEngine, CUE_NAMES } from './AudioEngine';

// jsdom has no AudioContext — which is exactly the contract under test: the
// whole API must be a safe no-op before unlock() runs from a real gesture,
// and unlock() itself must cope with an environment that cannot make audio.
// (The synth registry's completeness is compile-time: SYNTHS is a
// Record<CueName, Synth>, so a cue without an implementation will not build.)

function engine(): AudioEngine {
  return new AudioEngine({ isOccluded: () => false });
}

describe('AudioEngine before unlock', () => {
  it('constructs without an AudioContext', () => {
    expect(() => engine()).not.toThrow();
  });

  it('every cue is a silent no-op before unlock', () => {
    const e = engine();
    for (const name of CUE_NAMES) {
      expect(() => e.play(name)).not.toThrow();
      expect(() => e.play(name, { at: { x: 3, z: 4 }, gain: 0.5 })).not.toThrow();
    }
  });

  it('update, duck and volume are safe before unlock', () => {
    const e = engine();
    expect(() =>
      e.update(
        {
          listenerX: 0,
          listenerZ: 0,
          forwardX: 0,
          forwardZ: -1,
          zone: 'corridor',
          mutterSource: null,
          alertLevel: 2,
          dawn: true,
        },
        1000,
      ),
    ).not.toThrow();
    expect(() => e.duck(0.3, 500)).not.toThrow();
    expect(() => e.setMasterVolume(0.5)).not.toThrow();
  });

  it('unlock is a no-op when the environment has no AudioContext', () => {
    const e = engine();
    expect(() => e.unlock()).not.toThrow();
    expect(() => e.play('sting')).not.toThrow(); // still no context, still safe
  });
});

describe('master volume', () => {
  it('clamps to 0..1', () => {
    const e = engine();
    e.setMasterVolume(1.7);
    expect(e.masterVolume).toBe(1);
    e.setMasterVolume(-2);
    expect(e.masterVolume).toBe(0);
    e.setMasterVolume(0.65);
    expect(e.masterVolume).toBe(0.65);
  });
});
