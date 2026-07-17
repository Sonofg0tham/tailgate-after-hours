import type { MovementIntent } from '../input/InputState';
import { EngagementInputSession } from '../sim/InputLog';
import type { PlayerState } from '../sim/PlayerState';
import { Telemetry, type TelemetryDoorDefinition } from '../telemetry/Telemetry';

export type AppState = 'kiosk' | 'running' | 'paused';

export interface EngagementRunReset {
  lastIntent: MovementIntent;
  pointerWorld: { x: number; z: number };
  mouseHeld: false;
  previousThrowHeld: false;
  telemetry: Telemetry;
  previousDoorId: null;
  playerStepTimerMs: 0;
  guardStepTimersMs: number[];
  detainedFlashRemainingMs: 0;
  detainImpactRemainingMs: 0;
  shakeRemainingMs: 0;
  boltLandingRingRemainingMs: 0;
}

/**
 * Owns the app-level lifecycle around the deterministic simulation. It does
 * not advance or mutate HuntState, so the fixed-step fold stays unchanged.
 */
export class EngagementLifecycle {
  readonly inputSession: EngagementInputSession;

  private currentAppState: AppState = 'kiosk';
  private hasShownReport = false;

  constructor(seed: string, stepSeconds: number, startState: PlayerState) {
    this.inputSession = new EngagementInputSession(seed, stepSeconds, startState);
  }

  get appState(): AppState {
    return this.currentAppState;
  }

  get reportShown(): boolean {
    return this.hasShownReport;
  }

  beginEngagement(
    startState: PlayerState,
    guardCount: number,
    doors: readonly TelemetryDoorDefinition[] = [],
  ): EngagementRunReset {
    this.inputSession.reset(startState);
    this.currentAppState = 'running';
    this.hasShownReport = false;

    return {
      lastIntent: { directionX: 0, directionZ: 0, speed: 'idle', crouched: false, device: 'none' },
      pointerWorld: { x: startState.x, z: startState.z },
      mouseHeld: false,
      previousThrowHeld: false,
      telemetry: new Telemetry(doors),
      previousDoorId: null,
      playerStepTimerMs: 0,
      guardStepTimersMs: Array.from({ length: guardCount }, () => 0),
      detainedFlashRemainingMs: 0,
      detainImpactRemainingMs: 0,
      shakeRemainingMs: 0,
      boltLandingRingRemainingMs: 0,
    };
  }

  beginReport(): boolean {
    if (this.hasShownReport) {
      return false;
    }
    this.hasShownReport = true;
    this.currentAppState = 'running';
    return true;
  }

  showKiosk(): void {
    this.currentAppState = 'kiosk';
  }

  togglePause(canPause: boolean): boolean {
    if (!canPause || this.hasShownReport) {
      return false;
    }
    if (this.currentAppState === 'running') {
      this.currentAppState = 'paused';
      return true;
    }
    if (this.currentAppState === 'paused') {
      this.currentAppState = 'running';
      return true;
    }
    return false;
  }
}
