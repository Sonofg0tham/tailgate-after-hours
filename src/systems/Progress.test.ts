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

const RUN = { timeOnSite: '01:30', assist: false };

describe('loadProgress', () => {
  it('returns empty progress on a fresh store', () => {
    expect(loadProgress(mockStore())).toEqual({ bestRating: null, bestTimeSec: null, completions: 0, runs: [] });
  });

  it('returns empty progress when storage is unavailable', () => {
    expect(loadProgress(null).completions).toBe(0);
  });

  it('recovers from corrupt stored JSON', () => {
    const store = mockStore();
    store.data['tailgate-after-hours.progress'] = '{not valid json';
    expect(loadProgress(store).completions).toBe(0);
  });

  it('migrates a Phase 4 v1 record forward, carrying bests, with an empty history', () => {
    const store = mockStore();
    store.data['tailgate-after-hours.progress'] = JSON.stringify({
      version: 1,
      bestRating: 'PROFESSIONAL',
      bestTimeSec: 240,
      completions: 5,
    });
    const p = loadProgress(store);
    expect(p.bestRating).toBe('PROFESSIONAL');
    expect(p.bestTimeSec).toBe(240);
    expect(p.completions).toBe(5);
    expect(p.runs).toEqual([]);
  });
});

describe('recordCompletion', () => {
  it('records the first completion with a history entry', () => {
    const store = mockStore();
    const p = recordCompletion('NOISY', 200, RUN, store);
    expect(p.bestRating).toBe('NOISY');
    expect(p.bestTimeSec).toBe(200);
    expect(p.completions).toBe(1);
    expect(p.runs).toHaveLength(1);
    expect(p.runs[0].rating).toBe('NOISY');
    expect(p.runs[0].timeOnSite).toBe('01:30');
    expect(loadProgress(store)).toEqual(p); // persisted
  });

  it('keeps the better rating and the faster time across runs', () => {
    const store = mockStore();
    recordCompletion('NOISY', 200, RUN, store);
    recordCompletion('GHOST', 300, RUN, store);
    const p = recordCompletion('DETAINED', 100, RUN, store);
    expect(p.bestRating).toBe('GHOST');
    expect(p.bestTimeSec).toBe(100);
    expect(p.completions).toBe(3);
    expect(p.runs).toHaveLength(3);
    expect(p.runs[0].rating).toBe('DETAINED'); // newest first
  });

  it('ABANDONED is filed in history but never a best (the Patch Tuesday rule)', () => {
    const store = mockStore();
    const first = recordCompletion('ABANDONED', 50, { timeOnSite: '00:20', assist: false }, store);
    expect(first.bestRating).toBeNull(); // not even as the only run
    expect(first.bestTimeSec).toBeNull();
    expect(first.runs[0].rating).toBe('ABANDONED');
    const p = recordCompletion('DETAINED', 400, RUN, store);
    expect(p.bestRating).toBe('DETAINED');
    expect(p.completions).toBe(2);
  });

  it('DAWN never sets a best time, and any finished run outranks it', () => {
    const store = mockStore();
    recordCompletion('GHOST', 250, RUN, store);
    const p = recordCompletion('DAWN', 720, { timeOnSite: '03:57', assist: false }, store);
    expect(p.bestTimeSec).toBe(250);
    expect(p.bestRating).toBe('GHOST');
  });

  it('caps the history at 20, newest first', () => {
    const store = mockStore();
    for (let i = 0; i < 25; i++) {
      recordCompletion('GHOST', 100 + i, RUN, store);
    }
    const p = loadProgress(store);
    expect(p.runs).toHaveLength(20);
    expect(p.completions).toBe(25);
  });

  it('degrades to a no-op write when storage is unavailable, still returning the folded value', () => {
    const p = recordCompletion('GHOST', 100, RUN, null);
    expect(p.bestRating).toBe('GHOST');
    expect(p.runs).toHaveLength(1);
  });
});
