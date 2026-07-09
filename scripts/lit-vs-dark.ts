// One-off calculation for the Phase 2 PR: same guard distance and player
// speed, lit cell versus dark cell, using the real shipped stepSuspicion
// formula against the real Floor 12 light grid — not eyeballed off a
// screen recording. Run with: npx vite-node scripts/lit-vs-dark.ts
import { parseLevel, type LevelData } from '../src/world/level';
import { lightLevelAt } from '../src/systems/LightModel';
import { stepSuspicion } from '../src/systems/Suspicion';
import floor12 from '../src/data/floor12.json';

const level = parseLevel(floor12 as LevelData);

// Two real Floor 12 cells at the same distance category (both "close range,
// walk speed"), one lit (office, under a desk lamp) and one dark (the
// corridor spine, which has no placed light source at all).
const LIT_CELL = { x: 4, y: 4, label: 'office, under a desk lamp' };
const DARK_CELL = { x: 20, y: 9, label: 'corridor spine, no placed light' };

function fillRatePerSecond(lightLevel: number): number {
  // One fixed tick (1/60s), scaled back up to a per-second rate. The raw
  // formula saturates the 0-100 scale within a fraction of a second at
  // close range even at max darkness (100 * 3.0 proximity * 2.2 walk =
  // 660/sec before the darkness multiplier even applies) — that fast-fill
  // behaviour is ported deliberately from Tailgate, not a bug here. Reading
  // one tick's worth keeps the comparison in the pre-clamp regime so the
  // darkness multiplier's effect is visible rather than hidden by the cap.
  const dt = 1 / 60;
  return stepSuspicion(0, { seen: true, distanceCells: 5, speed: 'walk', lightLevel }, dt) / dt;
}

for (const cell of [LIT_CELL, DARK_CELL]) {
  const light = lightLevelAt(level.lights, cell.x, cell.y);
  const rate = fillRatePerSecond(light);
  console.log(`${cell.label} — cell (${cell.x},${cell.y}): light ${light.toFixed(2)}, suspicion fill/sec ${rate.toFixed(1)}`);
}
