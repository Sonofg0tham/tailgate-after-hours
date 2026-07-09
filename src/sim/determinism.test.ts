import { describe, expect, it } from 'vitest';
import { parseLevel, type LevelData } from '../world/level';
import { extrudeLevel } from '../world/Extruder';
import { InputRecorder, replay, type InputLog } from './InputLog';
import type { MovementIntent } from '../input/InputState';
import type { PlayerState } from './PlayerState';
import floor12 from '../data/floor12.json';

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
