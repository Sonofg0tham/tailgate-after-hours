import type { Rating } from '../report/rating';

/**
 * Best-rating and run-history persistence, ported from Tailgate's
 * `progress.ts` and cut down to this game's single floor. Stored under one
 * versioned localStorage key; v1 (Phase 4, best-only) migrates forward with
 * an empty history. Schema v3 adds the one-time briefing flag while v1/v2
 * infer it from prior completions. Per the Patch Tuesday rule, ABANDONED
 * runs are filed in the history and count as completions but can NEVER become a best; DAWN
 * ranks below every finished outcome and never sets a best time. Everything
 * is guarded for headless/blocked-storage environments.
 */

const STORAGE_KEY = 'tailgate-after-hours.progress';
const VERSION = 3;
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
  briefingSeen: boolean;
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
  return { bestRating: null, bestTimeSec: null, completions: 0, runs: [], briefingSeen: false };
}

function isRating(value: unknown): value is Rating {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(RATING_RANK, value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isCanonicalISODate(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isTimeOnSite(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const match = /^(\d{2}):([0-5]\d)$/.exec(value);
  if (!match) {
    return false;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 4 || (hours === 4 && minutes === 0);
}

function isRunRecord(value: unknown): value is RunRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const run = value as Partial<RunRecord>;
  return (
    isCanonicalISODate(run.endedISO) &&
    isRating(run.rating) &&
    isTimeOnSite(run.timeOnSite) &&
    typeof run.assist === 'boolean'
  );
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
      briefingSeen?: boolean;
    };
    if (parsed.version !== VERSION && parsed.version !== 2 && parsed.version !== 1) {
      return empty();
    }
    const completions =
      Number.isInteger(parsed.completions) && isNonNegativeNumber(parsed.completions) ? parsed.completions : 0;
    return {
      bestRating: isRating(parsed.bestRating) && parsed.bestRating !== 'ABANDONED' ? parsed.bestRating : null,
      bestTimeSec: isNonNegativeNumber(parsed.bestTimeSec) ? parsed.bestTimeSec : null,
      completions,
      // v1 predates the history — migrate with an empty one.
      runs: Array.isArray(parsed.runs) ? parsed.runs.filter(isRunRecord).slice(0, HISTORY_CAP) : [],
      briefingSeen:
        parsed.version === 1 || parsed.version === 2
          ? completions > 0
          : typeof parsed.briefingSeen === 'boolean'
            ? parsed.briefingSeen
            : false,
    };
  } catch {
    return empty();
  }
}

export function markBriefingSeen(store: StorageLike | null = defaultStore()): Progress {
  const next: Progress = { ...loadProgress(store), briefingSeen: true };
  if (store) {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, ...next }));
    } catch {
      // Storage full or blocked: the current session can still continue.
    }
  }
  return next;
}

/** Keep a browser-session acknowledgement even when persisted progress is stale after a failed write. */
export function resolveBriefingSession(
  briefingSeenInSession: boolean,
  progress: Progress,
): { briefingSeen: boolean; shouldShowBriefing: boolean } {
  const briefingSeen = briefingSeenInSession || progress.briefingSeen;
  return { briefingSeen, shouldShowBriefing: !briefingSeen };
}

/**
 * Fold one finished engagement into stored progress: file the run in the
 * history (newest first), bump completions, keep the better rating (never
 * ABANDONED), keep the faster time (finished outcomes only). Returns the
 * new progress whether or not the write succeeded. A retained briefing
 * acknowledgement is folded into the same write so a later success retries it.
 */
export function recordCompletion(
  rating: Rating,
  timeSec: number,
  run: { timeOnSite: string; assist: boolean },
  store: StorageLike | null = defaultStore(),
  briefingSeenInSession = false,
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

  const next: Progress = {
    bestRating,
    bestTimeSec,
    completions: current.completions + 1,
    runs,
    briefingSeen: current.briefingSeen || briefingSeenInSession,
  };

  if (store) {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, ...next }));
    } catch {
      // Storage full or blocked (private mode): keep the in-memory value, drop the write.
    }
  }
  return next;
}
