import type { MovementIntent } from '../input/InputState';
import type { PlayerState } from './PlayerState';
import { stepPlayer } from './step';
import type { WallBounds } from '../physics/CapsuleCollider';

export interface InputLogEntry {
  tick: number;
  intent: MovementIntent;
}

/**
 * A recorded run: a seed plus every tick's input. The seed is carried for
 * forward compatibility (Patch Tuesday's `rngState`-threading pattern) but
 * is inert in Phase 1 — nothing consumes randomness yet, since there's no
 * guard AI. It earns its keep from Phase 2 onward without changing this
 * format.
 */
export interface InputLog {
  seed: string;
  stepSeconds: number;
  startState: PlayerState;
  entries: InputLogEntry[];
}

/** Accumulates ticks during a live run; call toLog() to snapshot it. */
export class InputRecorder {
  private readonly entries: InputLogEntry[] = [];

  constructor(
    private readonly seed: string,
    private readonly stepSeconds: number,
    private readonly startState: PlayerState,
  ) {}

  record(tick: number, intent: MovementIntent): void {
    this.entries.push({ tick, intent });
  }

  toLog(): InputLog {
    return { seed: this.seed, stepSeconds: this.stepSeconds, startState: this.startState, entries: [...this.entries] };
  }
}

/**
 * Folds an input log through stepPlayer, tick by tick, and returns the final
 * state. Two replays of the same log against the same walls always produce
 * the same result — see src/sim/determinism.test.ts.
 */
export function replay(log: InputLog, walls: readonly WallBounds[]): PlayerState {
  let state = log.startState;
  for (const entry of log.entries) {
    state = stepPlayer(state, entry.intent, log.stepSeconds, walls);
  }
  return state;
}
