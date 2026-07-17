import { describe, expect, it } from 'vitest';
import type { MovementIntent } from '../input/InputState';
import type { PlayerState } from '../sim/PlayerState';
import { EngagementLifecycle } from './EngagementLifecycle';

const STEP_SECONDS = 1 / 60;
const START: PlayerState = { x: 3.5, z: 12.5, facingYaw: 0 };
const DRIVEN_INTENT: MovementIntent = {
  directionX: 1,
  directionZ: 0,
  speed: 'run',
  crouched: false,
  device: 'keyboard',
};

describe('engagement lifecycle', () => {
  it('builds a clean run reset and clears input state on every engagement', () => {
    const lifecycle = new EngagementLifecycle('LIFECYCLE-TEST', STEP_SECONDS, START);

    lifecycle.inputSession.intentFrozen = true;
    lifecycle.inputSession.drivenIntent = DRIVEN_INTENT;
    lifecycle.inputSession.drivenInteract = true;
    lifecycle.inputSession.record(DRIVEN_INTENT, { x: 5, z: 6 }, true);

    const nextStart = { ...START, x: START.x + 2 };
    const reset = lifecycle.beginEngagement(nextStart, 3);

    expect(lifecycle.appState).toBe('running');
    expect(lifecycle.reportShown).toBe(false);
    expect(lifecycle.inputSession.toLog()).toMatchObject({ startState: nextStart, entries: [] });
    expect(lifecycle.inputSession.intentFrozen).toBe(false);
    expect(lifecycle.inputSession.drivenIntent).toBeNull();
    expect(lifecycle.inputSession.drivenInteract).toBeNull();
    expect(reset).toMatchObject({
      lastIntent: { directionX: 0, directionZ: 0, speed: 'idle', crouched: false, device: 'none' },
      pointerWorld: { x: nextStart.x, z: nextStart.z },
      mouseHeld: false,
      previousThrowHeld: false,
      previousDoorId: null,
      playerStepTimerMs: 0,
      guardStepTimersMs: [0, 0, 0],
      detainedFlashRemainingMs: 0,
      detainImpactRemainingMs: 0,
      shakeRemainingMs: 0,
      boltLandingRingRemainingMs: 0,
    });
    expect(reset.telemetry.summary()).toMatchObject({ runtimeSeconds: 0, detections: 0, detains: 0 });
  });

  it('owns pause, report and kiosk transitions without allowing invalid changes', () => {
    const lifecycle = new EngagementLifecycle('LIFECYCLE-TEST', STEP_SECONDS, START);

    expect(lifecycle.appState).toBe('kiosk');
    expect(lifecycle.togglePause(true)).toBe(false);

    lifecycle.beginEngagement(START, 0);
    expect(lifecycle.togglePause(true)).toBe(true);
    expect(lifecycle.appState).toBe('paused');
    expect(lifecycle.togglePause(true)).toBe(true);
    expect(lifecycle.appState).toBe('running');
    expect(lifecycle.togglePause(false)).toBe(false);

    expect(lifecycle.beginReport()).toBe(true);
    expect(lifecycle.reportShown).toBe(true);
    expect(lifecycle.appState).toBe('running');
    expect(lifecycle.beginReport()).toBe(false);
    expect(lifecycle.togglePause(true)).toBe(false);

    lifecycle.showKiosk();
    expect(lifecycle.appState).toBe('kiosk');
  });
});
