/**
 * F1 grid overlay, F2 surface tints, F3 noise ring, F4 guard debug (state
 * label/suspicion in the HUD plus the raw unclipped vision-cone wireframe),
 * F5 light grid (the grid-vs-render agreement view), F6 greyscale (colour
 * stripped from the whole canvas — the "no state by colour alone" check).
 * Function keys because this is a dev-only aid, not a player-facing control
 * — no risk of colliding with WASD/Shift/C. preventDefault stops the
 * browser intercepting F1/F3 as page-level shortcuts while the game has
 * focus.
 */
export interface DebugState {
  gridOverlay: boolean;
  surfaceTints: boolean;
  noiseRing: boolean;
  guardDebug: boolean;
  lightGrid: boolean;
  greyscale: boolean;
}

export function createDebugToggles(onChange: (state: DebugState) => void): DebugState {
  const state: DebugState = {
    gridOverlay: false,
    surfaceTints: false,
    noiseRing: false,
    guardDebug: false,
    lightGrid: false,
    greyscale: false,
  };

  const KEY_MAP: Record<string, keyof DebugState> = {
    F1: 'gridOverlay',
    F2: 'surfaceTints',
    F3: 'noiseRing',
    F4: 'guardDebug',
    F5: 'lightGrid',
    F6: 'greyscale',
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
