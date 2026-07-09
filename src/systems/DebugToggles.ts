/**
 * F1 grid overlay, F2 surface tints, F3 noise ring. Function keys because
 * this is a dev-only aid, not a player-facing control — no risk of colliding
 * with WASD/Shift/C. preventDefault stops the browser intercepting F1/F3 as
 * page-level shortcuts while the game has focus.
 */
export interface DebugState {
  gridOverlay: boolean;
  surfaceTints: boolean;
  noiseRing: boolean;
}

export function createDebugToggles(onChange: (state: DebugState) => void): DebugState {
  const state: DebugState = { gridOverlay: false, surfaceTints: false, noiseRing: false };

  const KEY_MAP: Record<string, keyof DebugState> = {
    F1: 'gridOverlay',
    F2: 'surfaceTints',
    F3: 'noiseRing',
  };

  window.addEventListener('keydown', (event) => {
    const key = KEY_MAP[event.code];
    if (!key) return;
    event.preventDefault();
    state[key] = !state[key];
    onChange(state);
  });

  return state;
}
