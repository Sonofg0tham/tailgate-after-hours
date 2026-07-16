import { describe, expect, it } from 'vitest';
import { loadProgress, markBriefingSeen, recordCompletion, type StorageLike } from './Progress';

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

describe('markBriefingSeen', () => {
  it('marks the briefing seen while preserving every other progress field', () => {
    const store = mockStore();
    const existing = {
      bestRating: 'PROFESSIONAL' as const,
      bestTimeSec: 240,
      completions: 3,
      runs: [{ endedISO: '2026-07-15T01:02:03.000Z', rating: 'NOISY' as const, timeOnSite: '01:42', assist: true }],
      briefingSeen: false,
    };
    store.data['tailgate-after-hours.progress'] = JSON.stringify({ version: 3, ...existing });

    const marked = markBriefingSeen(store);

    expect(marked).toEqual({ ...existing, briefingSeen: true });
    expect(JSON.parse(store.data['tailgate-after-hours.progress'])).toEqual({
      version: 3,
      ...existing,
      briefingSeen: true,
    });
  });

  it('returns marked progress when storage rejects the write', () => {
    const store: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked');
      },
    };

    expect(() => markBriefingSeen(store)).not.toThrow();
    expect(markBriefingSeen(null).briefingSeen).toBe(true);
  });
});

describe('loadProgress', () => {
  it('returns empty progress on a fresh store', () => {
    expect(loadProgress(mockStore())).toEqual({
      bestRating: null,
      bestTimeSec: null,
      completions: 0,
      runs: [],
      briefingSeen: false,
    });
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
    expect(p.briefingSeen).toBe(true);
  });

  it('migrates a v2 record without losing summary fields or valid run history', () => {
    const store = mockStore();
    const runs = [
      { endedISO: '2026-07-15T01:02:03.000Z', rating: 'GHOST' as const, timeOnSite: '01:42', assist: false },
      { endedISO: '2026-07-14T02:03:04.000Z', rating: 'NOISY' as const, timeOnSite: '02:07', assist: true },
    ];
    store.data['tailgate-after-hours.progress'] = JSON.stringify({
      version: 2,
      bestRating: 'GHOST',
      bestTimeSec: 102,
      completions: 2,
      runs,
    });

    expect(loadProgress(store)).toEqual({
      bestRating: 'GHOST',
      bestTimeSec: 102,
      completions: 2,
      runs,
      briefingSeen: true,
    });
  });

  it.each([1, 2])('migrates a zero-completion v%s record as unseen', (version) => {
    const store = mockStore();
    store.data['tailgate-after-hours.progress'] = JSON.stringify({
      version,
      bestRating: null,
      bestTimeSec: null,
      completions: 0,
      runs: [],
    });

    expect(loadProgress(store).briefingSeen).toBe(false);
  });

  it('honours only a boolean briefing flag in v3 data', () => {
    const store = mockStore();
    store.data['tailgate-after-hours.progress'] = JSON.stringify({
      version: 3,
      bestRating: null,
      bestTimeSec: null,
      completions: 0,
      runs: [],
      briefingSeen: 'yes',
    });
    expect(loadProgress(store).briefingSeen).toBe(false);

    store.data['tailgate-after-hours.progress'] = JSON.stringify({
      version: 3,
      bestRating: null,
      bestTimeSec: null,
      completions: 0,
      runs: [],
      briefingSeen: true,
    });
    expect(loadProgress(store).briefingSeen).toBe(true);
  });

  it('returns fresh progress for unsupported versions', () => {
    const store = mockStore();
    store.data['tailgate-after-hours.progress'] = JSON.stringify({
      version: 99,
      bestRating: 'GHOST',
      bestTimeSec: 10,
      completions: 8,
      runs: [],
      briefingSeen: true,
    });

    expect(loadProgress(store)).toEqual({
      bestRating: null,
      bestTimeSec: null,
      completions: 0,
      runs: [],
      briefingSeen: false,
    });
  });

  it('sanitises summary fields and drops malformed history records without losing valid ones', () => {
    const store = mockStore();
    store.data['tailgate-after-hours.progress'] = JSON.stringify({
      version: 2,
      bestRating: 'ROOT',
      bestTimeSec: -20,
      completions: 'many',
      runs: [
        { endedISO: '2026-07-15T01:02:03.000Z', rating: 'GHOST', timeOnSite: '01:42', assist: false },
        { endedISO: '2026-02-31T01:02:03.000Z', rating: 'GHOST', timeOnSite: '01:42', assist: false },
        { endedISO: '2026-07-15T01:02:03Z', rating: 'GHOST', timeOnSite: '01:42', assist: false },
        { endedISO: '2026-07-15T01:02:03.000Z', rating: 'GHOST', timeOnSite: '05:00', assist: false },
        { endedISO: '2026-07-15T01:02:03.000Z', rating: 'GHOST', timeOnSite: '04:01', assist: false },
        { endedISO: null, rating: 'GHOST', timeOnSite: '01:42', assist: false },
        { endedISO: 'not-a-date', rating: 'ROOT', timeOnSite: {}, assist: 'yes' },
      ],
    });

    expect(loadProgress(store)).toEqual({
      bestRating: null,
      bestTimeSec: null,
      completions: 0,
      runs: [{ endedISO: '2026-07-15T01:02:03.000Z', rating: 'GHOST', timeOnSite: '01:42', assist: false }],
      briefingSeen: false,
    });
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

  it('preserves the briefing flag when recording a completion', () => {
    const store = mockStore();
    markBriefingSeen(store);

    expect(recordCompletion('GHOST', 100, RUN, store).briefingSeen).toBe(true);
    expect(loadProgress(store).briefingSeen).toBe(true);
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
