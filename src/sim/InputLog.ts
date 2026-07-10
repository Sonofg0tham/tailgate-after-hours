import type { MovementIntent } from '../input/InputState';
import type { PlayerState } from './PlayerState';
import { stepPlayer } from './step';
import { stepHunt, type HuntEnvironment, type HuntState } from './stepHunt';
import type { WallBounds } from '../physics/CapsuleCollider';

export interface InputLogEntry {
  tick: number;
  intent: MovementIntent;
  /** A bolt released this tick, already resolved to a landing point (src/systems/ThrowAim.ts), or null. */
  throwAction: { x: number; z: number } | null;
}

/**
 * A recorded run: a seed plus every tick's input. The seed is carried for
 * forward compatibility (Patch Tuesday's `rngState`-threading pattern) and
 * is still inert — guards have no randomness of their own either (see
 * stepHunt.ts), they're a pure function of player position and dt. It's
 * kept for whenever this project's first RNG consumer actually arrives,
 * without needing to change this format then either.
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

  record(tick: number, intent: MovementIntent, throwAction: { x: number; z: number } | null = null): void {
    this.entries.push({ tick, intent, throwAction });
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

/**
 * The Phase 2 equivalent of replay(): folds a log through stepHunt instead
 * of stepPlayer, so it reproduces guard state too. Guards aren't part of
 * InputLog itself (see the header above) — the caller supplies their
 * starting state and the environment (level/lights/routes) fresh each time.
 */
export function replayHunt(log: InputLog, startState: HuntState, env: HuntEnvironment): HuntState {
  let state = startState;
  for (const entry of log.entries) {
    state = stepHunt(state, entry.intent, entry.throwAction, env, log.stepSeconds, log.stepSeconds * 1000).state;
  }
  return state;
}
