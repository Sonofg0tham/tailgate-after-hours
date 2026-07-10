import { RENDER_LIGHTING } from '../config/renderLighting';
import type { MotionLevel } from './Motion';
import type { StorageLike } from './Progress';

/**
 * Player settings (Phase 6), persisted to localStorage and applied live
 * where feasible (main.ts's applySettings maps each field to its system).
 * Defaults are the accessibility-first shipped values: shake at zero,
 * reduced motion for a fresh visitor, the visibility floor at its readable
 * default. Assist mode (guard speed 90%, no penalty) takes effect from the
 * next engagement — the guard speed scale is part of the engagement's
 * environment, fixed for the run so replays stay pure.
 */
export interface GameSettings {
  /** 0..1, over the tuned audio base. */
  masterVolume: number;
  /** HUD/UI text scale, 0.8..1.6. */
  hudScale: number;
  /** UI contrast boost plus a raised visibility-floor preset. */
  highContrast: boolean;
  /** Screen shake master, 0..1. Ships 0. */
  shakeIntensity: number;
  /** The darkness floor of the rendered scene (the grid curve's minimum), 0.1..0.7. */
  visibilityFloor: number;
  motionLevel: MotionLevel;
  /** Guard speed 90%. No penalty, applies from the next engagement. */
  assistMode: boolean;
}

export const SETTINGS_DEFAULTS: GameSettings = {
  masterVolume: 0.8,
  hudScale: 1,
  highContrast: false,
  shakeIntensity: 0,
  visibilityFloor: RENDER_LIGHTING.grid.min,
  motionLevel: 'reduced',
  assistMode: false,
};

const STORAGE_KEY = 'tailgate-after-hours.settings';
const VERSION = 1;

function defaultStore(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

const clamp = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;

/** Loads and sanitises stored settings; anything missing or malformed falls back to its default. */
export function loadSettings(store: StorageLike | null = defaultStore()): GameSettings {
  const d = SETTINGS_DEFAULTS;
  if (!store) {
    return { ...d };
  }
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...d };
    }
    const p = JSON.parse(raw) as Partial<GameSettings> & { version?: number };
    if (p.version !== VERSION) {
      return { ...d };
    }
    return {
      masterVolume: clamp(p.masterVolume, 0, 1, d.masterVolume),
      hudScale: clamp(p.hudScale, 0.8, 1.6, d.hudScale),
      highContrast: p.highContrast === true,
      shakeIntensity: clamp(p.shakeIntensity, 0, 1, d.shakeIntensity),
      visibilityFloor: clamp(p.visibilityFloor, 0.1, 0.7, d.visibilityFloor),
      motionLevel: p.motionLevel === 'full' ? 'full' : 'reduced',
      assistMode: p.assistMode === true,
    };
  } catch {
    return { ...d };
  }
}

export function saveSettings(settings: GameSettings, store: StorageLike | null = defaultStore()): void {
  if (!store) {
    return;
  }
  try {
    store.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, ...settings }));
  } catch {
    // Storage blocked: the in-memory settings still apply this session.
  }
}
