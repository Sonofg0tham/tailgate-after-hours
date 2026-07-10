import type { Rating } from '../report/rating';

/**
 * Best-rating persistence, ported from Tailgate's `progress.ts` and cut down
 * to this game's single floor. Stored under one versioned localStorage key.
 * Per CLAUDE.md, v1 persists a best rating (and best time) only — no per-run
 * history. Everything is guarded for headless/blocked-storage environments,
 * so a missing or throwing localStorage degrades to an in-memory no-op rather
 * than crashing the run.
 */

const STORAGE_KEY = 'tailgate-after-hours.progress';
const VERSION = 1;

/** Higher rank is better. DAWN (an incomplete engagement) ranks below every finished outcome. */
const RATING_RANK: Record<Rating, number> = {
  DAWN: 0,
  DETAINED: 1,
  NOISY: 2,
  PROFESSIONAL: 3,
  GHOST: 4,
};

export interface Progress {
  bestRating: Rating | null;
  /** Fastest successful (non-dawn) completion, seconds. */
  bestTimeSec: number | null;
  completions: number;
}

/** The subset of the Storage API this module uses — lets tests pass a mock. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function empty(): Progress {
  return { bestRating: null, bestTimeSec: null, completions: 0 };
}

export function loadProgress(store: StorageLike | null = defaultStore()): Progress {
  if (!store) {
    return empty();
  }
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) {
      return empty();
    }
    const parsed = JSON.parse(raw) as { version?: number; bestRating?: Rating | null; bestTimeSec?: number | null; completions?: number };
    if (parsed.version !== VERSION) {
      return empty();
    }
    return {
      bestRating: parsed.bestRating ?? null,
      bestTimeSec: parsed.bestTimeSec ?? null,
      completions: parsed.completions ?? 0,
    };
  } catch {
    return empty();
  }
}

/**
 * Fold one finished engagement into stored progress: bump the completion
 * count, keep the better rating, keep the faster time (successful runs only —
 * a dawn timeout has no meaningful completion time). Returns the new progress
 * whether or not the write succeeded.
 */
export function recordCompletion(rating: Rating, timeSec: number, store: StorageLike | null = defaultStore()): Progress {
  const current = loadProgress(store);

  const bestRating =
    current.bestRating === null || RATING_RANK[rating] > RATING_RANK[current.bestRating] ? rating : current.bestRating;

  const bestTimeSec =
    rating === 'DAWN'
      ? current.bestTimeSec
      : current.bestTimeSec === null || timeSec < current.bestTimeSec
        ? timeSec
        : current.bestTimeSec;

  const next: Progress = { bestRating, bestTimeSec, completions: current.completions + 1 };

  if (store) {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, ...next }));
    } catch {
      // Storage full or blocked (private mode): keep the in-memory value, drop the write.
    }
  }
  return next;
}
