import { describe, expect, it } from 'vitest';
import { MISSION } from '../config/mission';
import { createMissionState } from '../sim/MissionState';

interface HudPresenterModule {
  buildHudLines(input: Record<string, unknown>): string[];
}

async function loadPresenter(): Promise<HudPresenterModule | null> {
  const modulePath = './HudPresenter';
  return import(/* @vite-ignore */ modulePath).catch(() => null) as Promise<HudPresenterModule | null>;
}

describe('HUD presentation extraction', () => {
  it('preserves the shipped player and debug readout ordering', async () => {
    const presenter = await loadPresenter();
    expect(presenter).not.toBeNull();
    if (!presenter) return;

    const lines = presenter.buildHudLines({
      clockLabel: '01:30',
      mission: createMissionState(),
      currentFps: 60.2,
      worstFps: 47.8,
      speed: 'walk',
      crouched: false,
      noiseRadius: 2.25,
      device: 'keyboard',
      suspicion: 12.4,
      alertLevel: 1,
      simTimeMs: 30_000,
      boltsUsed: 1,
      boltCount: 3,
      doors: [{ id: 'lobby', open: true }],
      guards: [{ id: 'guard-1', state: 'curious', suspicion: 33.2 }],
      grid: { x: 5, y: 7, simValue: 0.25, rendered: 0.5, curve: 0.5 },
    });

    expect(lines).toEqual([
      '01:30   OBJECTIVE: plant the device (server room)  ·  photos 0/2',
      '',
      '',
      'fps 60 (worst 48)',
      'speed walk',
      'noise 2.3m',
      'device keyboard',
      'suspicion 12',
      'alert level 1',
      'sim 30.0s',
      'bolts 1/3',
      'lobby: open',
      'guard-1: curious (33)',
      'grid @(5,7) sim 0.25 | rendered 0.50 | curve 0.50',
    ]);
  });

  it('formats an active plant hold from mission state', async () => {
    const presenter = await loadPresenter();
    expect(presenter).not.toBeNull();
    if (!presenter) return;

    const mission = { ...createMissionState(), holdObjectiveId: MISSION.plant.id, holdProgressMs: 1_500 };
    const input = {
      clockLabel: '01:05',
      mission,
      currentFps: 60,
      worstFps: 60,
      speed: 'idle',
      crouched: false,
      noiseRadius: 0,
      device: 'keyboard',
      suspicion: 0,
      alertLevel: 0,
      simTimeMs: 15_000,
      boltsUsed: 0,
      boltCount: 3,
      doors: [],
      guards: [],
      grid: null,
    };
    const lines = presenter.buildHudLines(input);

    expect(lines[1]).toBe('PLANTING... 50%');
    expect(presenter.buildHudLines({ ...input, mission: { ...createMissionState(), plantedAtMs: 1 } })[0]).toBe(
      '01:05   OBJECTIVE: exfil to the lift lobby  ·  photos 0/2',
    );
    expect(
      presenter.buildHudLines({
        ...input,
        mission: { ...createMissionState(), plantedAtMs: 1, exfilledAtMs: 2 },
      })[0],
    ).toBe('01:05   OBJECTIVE: complete  ·  photos 0/2');
  });
});
