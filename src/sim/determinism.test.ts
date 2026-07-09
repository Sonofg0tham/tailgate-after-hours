import { describe, expect, it } from 'vitest';
import { parseLevel, type LevelData } from '../world/level';
import { extrudeLevel } from '../world/Extruder';
import { buildLightGrid } from '../systems/LightModel';
import { InputRecorder, replay, replayHunt, type InputLog } from './InputLog';
import type { HuntEnvironment, HuntState } from './stepHunt';
import { createGuardState, type GuardsData } from '../entities/GuardState';
import type { MovementIntent } from '../input/InputState';
import type { PlayerState } from './PlayerState';
import floor12 from '../data/floor12.json';
import guardsData from '../data/guards.json';

const STEP_SECONDS = 1 / 60;

const level = parseLevel(floor12 as LevelData);
const extruded = extrudeLevel(level);
const startState: PlayerState = {
  x: (level.playerStart.x + 0.5) * level.cellSize,
  z: (level.playerStart.y + 0.5) * level.cellSize,
  facingYaw: 0,
};

function intent(directionX: number, directionZ: number, speed: MovementIntent['speed'] = 'walk'): MovementIntent {
  return { directionX, directionZ, speed, crouched: speed === 'creep', device: 'keyboard' };
}

/** A scripted (not random) sequence: walk north out of reception, then east along the corridor, then stop and turn. */
function scriptedRun(): InputLog {
  const recorder = new InputRecorder('REPLAY-TEST-SEED', STEP_SECONDS, startState);
  let tick = 0;
  for (let i = 0; i < 90; i++) recorder.record(tick++, intent(0, -1, 'run')); // north, run
  for (let i = 0; i < 60; i++) recorder.record(tick++, intent(1, 0, 'walk')); // east, walk
  for (let i = 0; i < 30; i++) recorder.record(tick++, intent(0, 1, 'creep')); // south, creep
  for (let i = 0; i < 20; i++) recorder.record(tick++, intent(0, 0, 'idle'));
  return recorder.toLog();
}

describe('replay determinism (seed + input log)', () => {
  it('two replays of the same log are byte-identical', () => {
    const log = scriptedRun();
    const resultA = replay(log, extruded.wallBounds);
    const resultB = replay(log, extruded.wallBounds);
    expect(resultA).toEqual(resultB);
  });

  it('a different input sequence diverges', () => {
    const log = scriptedRun();
    const divergent: InputLog = {
      ...log,
      entries: [{ tick: 0, intent: intent(1, 0, 'run') }, ...log.entries],
    };
    const baseline = replay(log, extruded.wallBounds);
    const divergedResult = replay(divergent, extruded.wallBounds);
    expect(divergedResult).not.toEqual(baseline);
  });

  it('the scripted run actually moves and stays inside the level bounds', () => {
    const result = replay(scriptedRun(), extruded.wallBounds);
    expect(result).not.toEqual(startState);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.x).toBeLessThanOrEqual(level.width * level.cellSize);
    expect(result.z).toBeGreaterThanOrEqual(0);
    expect(result.z).toBeLessThanOrEqual(level.height * level.cellSize);
  });
});

describe('replay determinism with guards (Phase 2)', () => {
  const guardRoutes = (guardsData as GuardsData).guards;
  const lightGrid = buildLightGrid(level);
  const env: HuntEnvironment = {
    level,
    lightGrid,
    wallBounds: extruded.wallBounds,
    routes: guardRoutes.map((g) => g.route),
  };
  const huntStart: HuntState = {
    player: startState,
    guards: guardRoutes.map(createGuardState),
    alertLevel: { level: 0, msSinceIncident: 0 },
  };

  it('guards have no input of their own, yet replaying the same log reproduces them byte-identically', () => {
    const log = scriptedRun();
    const resultA = replayHunt(log, huntStart, env);
    const resultB = replayHunt(log, huntStart, env);
    expect(resultA).toEqual(resultB);
  });

  it('a different input sequence diverges the guards too, not just the player', () => {
    const log = scriptedRun();
    const divergent: InputLog = {
      ...log,
      entries: [{ tick: 0, intent: intent(1, 0, 'run') }, ...log.entries],
    };
    const baseline = replayHunt(log, huntStart, env);
    const diverged = replayHunt(divergent, huntStart, env);
    expect(diverged.guards).not.toEqual(baseline.guards);
  });

  it('guards actually patrol (move from their start position) over the scripted run', () => {
    const result = replayHunt(scriptedRun(), huntStart, env);
    for (let i = 0; i < result.guards.length; i++) {
      const moved = result.guards[i].x !== huntStart.guards[i].x || result.guards[i].z !== huntStart.guards[i].z;
      expect(moved).toBe(true);
    }
  });
});
