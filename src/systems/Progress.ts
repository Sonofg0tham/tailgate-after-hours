import type { Rating } from '../report/rating';

/**
 * Best-rating and run-history persistence, ported from Tailgate's
 * `progress.ts` and cut down to this game's single floor. Stored under one
 * versioned localStorage key; v1 (Phase 4, best-only) migrates forward with
 * an empty history. Per the Patch Tuesday rule, ABANDONED runs are filed in
 * the history and count as completions but can NEVER become a best; DAWN
 * ranks below every finished outcome and never sets a best time. Everything
 * is guarded for headless/blocked-storage environments.
 */

const STORAGE_KEY = 'tailgate-after-hours.progress';
const VERSION = 2;
const HISTORY_CAP = 20;

/** Higher rank is better. ABANDONED is unranked by design — it never competes. */
const RATING_RANK: Record<Rating, number> = {
  ABANDONED: -1,
  DAWN: 0,
  DETAINED: 1,
  NOISY: 2,
  PROFESSIONAL: 3,
  GHOST: 4,
};

/** Outcomes with a meaningful completion time (the job finished and the consultant left). */
const TIMED_RATINGS: ReadonlySet<Rating> = new Set<Rating>(['GHOST', 'PROFESSIONAL', 'NOISY', 'DETAINED']);

export interface RunRecord {
  /** Real-world timestamp of the run's end (UI-side; the sim never sees wall time). */
  endedISO: string;
  rating: Rating;
  /** Fictional-clock time on site, matching the report ("HH:MM"). */
  timeOnSite: string;
  assist: boolean;
}

export interface Progress {
  bestRating: Rating | null;
  /** Fastest successful (finished, non-dawn, non-abandoned) completion, seconds. */
  bestTimeSec: number | null;
  completions: number;
  /** Newest first, capped at HISTORY_CAP. */
  runs: RunRecord[];
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
  return { bestRating: null, bestTimeSec: null, completions: 0, runs: [] };
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
    const parsed = JSON.parse(raw) as {
      version?: number;
      bestRating?: Rating | null;
      bestTimeSec?: number | null;
      completions?: number;
      runs?: RunRecord[];
    };
    if (parsed.version !== VERSION && parsed.version !== 1) {
      return empty();
    }
    return {
      bestRating: parsed.bestRating ?? null,
      bestTimeSec: parsed.bestTimeSec ?? null,
      completions: parsed.completions ?? 0,
      // v1 predates the history — migrate with an empty one.
      runs: Array.isArray(parsed.runs) ? parsed.runs.slice(0, HISTORY_CAP) : [],
    };
  } catch {
    return empty();
  }
}

/**
 * Fold one finished engagement into stored progress: file the run in the
 * history (newest first), bump completions, keep the better rating (never
 * ABANDONED), keep the faster time (finished outcomes only). Returns the
 * new progress whether or not the write succeeded.
 */
export function recordCompletion(
  rating: Rating,
  timeSec: number,
  run: { timeOnSite: string; assist: boolean },
  store: StorageLike | null = defaultStore(),
): Progress {
  const current = loadProgress(store);

  const bestRating =
    rating !== 'ABANDONED' && (current.bestRating === null || RATING_RANK[rating] > RATING_RANK[current.bestRating])
      ? rating
      : current.bestRating;

  const bestTimeSec = TIMED_RATINGS.has(rating)
    ? current.bestTimeSec === null || timeSec < current.bestTimeSec
      ? timeSec
      : current.bestTimeSec
    : current.bestTimeSec;

  const record: RunRecord = {
    endedISO: new Date().toISOString(),
    rating,
    timeOnSite: run.timeOnSite,
    assist: run.assist,
  };
  const runs = [record, ...current.runs].slice(0, HISTORY_CAP);

  const next: Progress = { bestRating, bestTimeSec, completions: current.completions + 1, runs };

  if (store) {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, ...next }));
    } catch {
      // Storage full or blocked (private mode): keep the in-memory value, drop the write.
    }
  }
  return next;
}
