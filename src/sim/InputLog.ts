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
  /** Whether the interact control was held this tick (hold-to-plant / hold-to-photograph). */
  interactHeld: boolean;
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

  record(
    tick: number,
    intent: MovementIntent,
    throwAction: { x: number; z: number } | null = null,
    interactHeld = false,
  ): void {
    this.entries.push({ tick, intent, throwAction, interactHeld });
  }

  toLog(): InputLog {
    return { seed: this.seed, stepSeconds: this.stepSeconds, startState: this.startState, entries: [...this.entries] };
  }
}

/**
 * Owns every mutable input value that must be fresh for a new engagement.
 * Keeping these together prevents a restarted run inheriting a replay queue,
 * a forced control or recorded ticks from the previous engagement.
 */
export class EngagementInputSession {
  private recorder: InputRecorder;
  private nextTick = 0;
  private replayQueue: InputLogEntry[] | null = null;

  intentFrozen = false;
  drivenIntent: MovementIntent | null = null;
  drivenInteract: boolean | null = null;

  constructor(
    private readonly seed: string,
    private readonly stepSeconds: number,
    startState: PlayerState,
  ) {
    this.recorder = new InputRecorder(seed, stepSeconds, startState);
  }

  reset(startState: PlayerState): void {
    this.recorder = new InputRecorder(this.seed, this.stepSeconds, startState);
    this.nextTick = 0;
    this.replayQueue = null;
    this.intentFrozen = false;
    this.drivenIntent = null;
    this.drivenInteract = null;
  }

  record(
    intent: MovementIntent,
    throwAction: { x: number; z: number } | null = null,
    interactHeld = false,
  ): void {
    this.recorder.record(this.nextTick++, intent, throwAction, interactHeld);
  }

  toLog(): InputLog {
    return this.recorder.toLog();
  }

  startReplay(log: InputLog): void {
    this.replayQueue = [...log.entries];
  }

  takeReplayEntry(): InputLogEntry | null {
    const entry = this.replayQueue?.shift() ?? null;
    if (!entry) {
      this.replayQueue = null;
    }
    return entry;
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
    state = stepHunt(state, entry.intent, entry.throwAction, entry.interactHeld, env, log.stepSeconds, log.stepSeconds * 1000).state;
  }
  return state;
}
