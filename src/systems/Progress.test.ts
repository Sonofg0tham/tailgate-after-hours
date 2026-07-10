import { describe, expect, it } from 'vitest';
import { loadProgress, recordCompletion, type StorageLike } from './Progress';

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

describe('loadProgress', () => {
  it('returns empty progress on a fresh store', () => {
    expect(loadProgress(mockStore())).toEqual({ bestRating: null, bestTimeSec: null, completions: 0 });
  });

  it('returns empty progress when storage is unavailable', () => {
    expect(loadProgress(null)).toEqual({ bestRating: null, bestTimeSec: null, completions: 0 });
  });

  it('recovers from corrupt stored JSON', () => {
    const store = mockStore();
    store.data['tailgate-after-hours.progress'] = '{not valid json';
    expect(loadProgress(store)).toEqual({ bestRating: null, bestTimeSec: null, completions: 0 });
  });
});

describe('recordCompletion', () => {
  it('records the first completion', () => {
    const store = mockStore();
    const p = recordCompletion('NOISY', 200, store);
    expect(p).toEqual({ bestRating: 'NOISY', bestTimeSec: 200, completions: 1 });
    expect(loadProgress(store)).toEqual(p); // persisted
  });

  it('keeps the better rating and the faster time across runs', () => {
    const store = mockStore();
    recordCompletion('NOISY', 200, store);
    recordCompletion('GHOST', 300, store); // better rating, slower time
    const p = recordCompletion('DETAINED', 100, store); // worse rating, faster time
    expect(p.bestRating).toBe('GHOST'); // better rating held
    expect(p.bestTimeSec).toBe(100); // faster time taken
    expect(p.completions).toBe(3);
  });

  it('does not record a completion time for a dawn timeout', () => {
    const store = mockStore();
    recordCompletion('GHOST', 250, store);
    const p = recordCompletion('DAWN', 720, store);
    expect(p.bestTimeSec).toBe(250); // dawn does not overwrite the successful best time
    expect(p.completions).toBe(2);
  });

  it('lets DAWN be the best rating only when nothing better exists', () => {
    const store = mockStore();
    const p = recordCompletion('DAWN', 720, store);
    expect(p.bestRating).toBe('DAWN');
    const p2 = recordCompletion('PROFESSIONAL', 240, store);
    expect(p2.bestRating).toBe('PROFESSIONAL'); // any finished run beats a dawn
  });

  it('degrades to a no-op write when storage is unavailable, still returning the folded value', () => {
    const p = recordCompletion('GHOST', 100, null);
    expect(p).toEqual({ bestRating: 'GHOST', bestTimeSec: 100, completions: 1 });
  });
});
