import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageLike } from './Progress';
import { loadSettings, saveSettings, SETTINGS_DEFAULTS } from './Settings';

type LegacyMediaQueryListener = (this: MediaQueryList, event: MediaQueryListEvent) => unknown;

interface MutableMediaQueryList extends MediaQueryList {
  setMatches(next: boolean): void;
}

function mediaQuery(initialMatches: boolean): MutableMediaQueryList {
  let matches = initialMatches;
  const eventListeners = new Set<EventListenerOrEventListenerObject>();
  const legacyListeners = new Set<LegacyMediaQueryListener>();
  const query = {
    get matches() {
      return matches;
    },
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener(_type: string, listener: EventListenerOrEventListenerObject | null) {
      if (listener) eventListeners.add(listener);
    },
    removeEventListener(_type: string, listener: EventListenerOrEventListenerObject | null) {
      if (listener) eventListeners.delete(listener);
    },
    dispatchEvent(event: Event) {
      for (const listener of eventListeners) {
        if (typeof listener === 'function') listener.call(query, event);
        else listener.handleEvent(event);
      }
      return !event.defaultPrevented;
    },
    addListener(listener: LegacyMediaQueryListener | null) {
      if (listener) legacyListeners.add(listener);
    },
    removeListener(listener: LegacyMediaQueryListener | null) {
      if (listener) legacyListeners.delete(listener);
    },
    setMatches(next: boolean) {
      matches = next;
      const event = Object.assign(new Event('change'), {
        matches,
        media: query.media,
      }) as MediaQueryListEvent;
      query.dispatchEvent(event);
      for (const listener of legacyListeners) listener.call(query, event);
      query.onchange?.call(query, event);
    },
  } as MutableMediaQueryList;
  return query;
}

function store(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe('Motion', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('honours OS reduced motion when persisted settings request full motion', async () => {
    const settingsStore = store();
    saveSettings({ ...SETTINGS_DEFAULTS, motionLevel: 'full' }, settingsStore);
    const persisted = loadSettings(settingsStore);
    const preference = mediaQuery(true);
    vi.stubGlobal('matchMedia', vi.fn(() => preference));
    const motion = await import('./Motion');

    expect(motion.initMotion()).toBe('reduced');
    motion.setMotionLevel(persisted.motionLevel);

    expect(persisted.motionLevel).toBe('full');
    expect(motion.motionLevel()).toBe('reduced');
  });

  it('tracks OS preference changes without discarding the player full-motion setting', async () => {
    const preference = mediaQuery(false);
    vi.stubGlobal('matchMedia', vi.fn(() => preference));
    const motion = await import('./Motion');

    motion.initMotion();
    motion.setMotionLevel('full');
    expect(motion.motionLevel()).toBe('full');

    preference.setMatches(true);
    expect(motion.motionLevel()).toBe('reduced');

    preference.setMatches(false);
    expect(motion.motionLevel()).toBe('full');
  });
});
