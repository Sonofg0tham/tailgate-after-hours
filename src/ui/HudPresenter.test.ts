import { describe, expect, it } from 'vitest';
import { MISSION } from '../config/mission';
import { createMissionState, type MissionState } from '../sim/MissionState';

interface PlayerHudModel {
  objective: string;
  clock: string;
  alert: {
    state: 'calm' | 'cautious' | 'alarm';
    label: 'CALM' | 'CAUTIOUS' | 'ALARM';
    marker: 'circle' | 'diamond' | 'triangle';
    suspicionPercent: number;
    suspicionText: string;
  };
  inventory: {
    deviceStatus: 'READY' | 'DEPLOYED';
    boltsRemaining: number;
  };
  interaction: {
    prompt: string;
    progressPercent: number;
    progressText: string;
  } | null;
}

interface HudPresenterModule {
  buildPlayerHudPresentation?: (input: Record<string, unknown>) => PlayerHudModel;
  buildDebugLines?: (input: Record<string, unknown>) => string[];
}

async function loadPresenter(): Promise<HudPresenterModule> {
  const modulePath = './HudPresenter';
  return import(/* @vite-ignore */ modulePath) as Promise<HudPresenterModule>;
}

function playerInput(mission: MissionState = createMissionState(), overrides: Record<string, unknown> = {}) {
  return {
    mission,
    player: { x: 1.5, z: 1.5, facingYaw: 0 },
    simTimeMs: 90_000,
    suspicion: 0,
    alertLevel: 0,
    boltsUsed: 0,
    boltCount: 3,
    ...overrides,
  };
}

describe('buildPlayerHudPresentation', () => {
  it('formats the plant objective and fictional engagement clock', async () => {
    const presenter = await loadPresenter();
    expect(typeof presenter.buildPlayerHudPresentation).toBe('function');
    if (!presenter.buildPlayerHudPresentation) return;

    const model = presenter.buildPlayerHudPresentation(playerInput());

    expect(model.objective).toBe('PLANT DEVICE IN SERVER ROOM');
    expect(model.clock).toBe('01:30');
  });

  it.each([
    { alertLevel: 0, label: 'CALM', state: 'calm', marker: 'circle' },
    { alertLevel: 1, label: 'CAUTIOUS', state: 'cautious', marker: 'diamond' },
    { alertLevel: 2, label: 'ALARM', state: 'alarm', marker: 'triangle' },
  ] as const)('formats alert level $alertLevel as $label with a distinct marker', async (expected) => {
    const presenter = await loadPresenter();
    expect(typeof presenter.buildPlayerHudPresentation).toBe('function');
    if (!presenter.buildPlayerHudPresentation) return;

    const model = presenter.buildPlayerHudPresentation(
      playerInput(createMissionState(), { alertLevel: expected.alertLevel, suspicion: 42.6 }),
    );

    expect(model.alert).toEqual({
      state: expected.state,
      label: expected.label,
      marker: expected.marker,
      suspicionPercent: 43,
      suspicionText: '43%',
    });
  });

  it('formats mission-device state and remaining bolts', async () => {
    const presenter = await loadPresenter();
    expect(typeof presenter.buildPlayerHudPresentation).toBe('function');
    if (!presenter.buildPlayerHudPresentation) return;

    expect(presenter.buildPlayerHudPresentation(playerInput()).inventory).toEqual({
      deviceStatus: 'READY',
      boltsRemaining: 3,
    });

    const planted = { ...createMissionState(), plantedAtMs: 1 };
    expect(presenter.buildPlayerHudPresentation(playerInput(planted, { boltsUsed: 2 })).inventory).toEqual({
      deviceStatus: 'DEPLOYED',
      boltsRemaining: 1,
    });
  });

  it('uses the mission selector for the plant prompt and hold progress', async () => {
    const presenter = await loadPresenter();
    expect(typeof presenter.buildPlayerHudPresentation).toBe('function');
    if (!presenter.buildPlayerHudPresentation) return;

    const mission = { ...createMissionState(), holdObjectiveId: MISSION.plant.id, holdProgressMs: 1_500 };
    const model = presenter.buildPlayerHudPresentation(
      playerInput(mission, { player: { ...MISSION.plant, facingYaw: 0 } }),
    );

    expect(model.interaction).toEqual({
      prompt: '[ HOLD E / A ] PLANT DEVICE',
      progressPercent: 50,
      progressText: '50%',
    });
  });

  it('uses the mission selector for the photo prompt', async () => {
    const presenter = await loadPresenter();
    expect(typeof presenter.buildPlayerHudPresentation).toBe('function');
    if (!presenter.buildPlayerHudPresentation) return;

    const photo = MISSION.photos[0];
    const mission = { ...createMissionState(), plantedAtMs: 1 };
    const model = presenter.buildPlayerHudPresentation(
      playerInput(mission, { player: { ...photo, facingYaw: 0 } }),
    );

    expect(model.interaction).toEqual({
      prompt: '[ HOLD E / A ] CAPTURE EVIDENCE',
      progressPercent: 0,
      progressText: '0%',
    });
  });

  it('hides interaction when no mission target is in range or the mission has ended', async () => {
    const presenter = await loadPresenter();
    expect(typeof presenter.buildPlayerHudPresentation).toBe('function');
    if (!presenter.buildPlayerHudPresentation) return;

    expect(presenter.buildPlayerHudPresentation(playerInput()).interaction).toBeNull();

    const ended = { ...createMissionState(), phase: 'dawn' as const };
    expect(
      presenter.buildPlayerHudPresentation(
        playerInput(ended, { player: { ...MISSION.plant, facingYaw: 0 } }),
      ).interaction,
    ).toBeNull();
  });

  it('keeps exfil passive while directing the player to the service lift', async () => {
    const presenter = await loadPresenter();
    expect(typeof presenter.buildPlayerHudPresentation).toBe('function');
    if (!presenter.buildPlayerHudPresentation) return;

    const mission = { ...createMissionState(), plantedAtMs: 1 };
    const model = presenter.buildPlayerHudPresentation(
      playerInput(mission, { player: { ...MISSION.exfil, facingYaw: 0 } }),
    );

    expect(model.objective).toBe('RETURN TO SERVICE LIFT');
    expect(model.interaction).toBeNull();
  });

  it('clamps hold progress at zero and 100 per cent', async () => {
    const presenter = await loadPresenter();
    expect(typeof presenter.buildPlayerHudPresentation).toBe('function');
    if (!presenter.buildPlayerHudPresentation) return;

    const atPlant = { player: { ...MISSION.plant, facingYaw: 0 } };
    const belowZero = { ...createMissionState(), holdObjectiveId: MISSION.plant.id, holdProgressMs: -100 };
    const aboveDone = { ...createMissionState(), holdObjectiveId: MISSION.plant.id, holdProgressMs: 4_000 };

    expect(presenter.buildPlayerHudPresentation(playerInput(belowZero, atPlant)).interaction?.progressPercent).toBe(0);
    expect(presenter.buildPlayerHudPresentation(playerInput(aboveDone, atPlant)).interaction?.progressPercent).toBe(100);
  });
});

describe('buildDebugLines', () => {
  it('keeps the development diagnostics separate from the player model', async () => {
    const presenter = await loadPresenter();
    expect(typeof presenter.buildDebugLines).toBe('function');
    if (!presenter.buildDebugLines) return;

    expect(
      presenter.buildDebugLines({
        currentFps: 60.2,
        worstFps: 47.8,
        speed: 'walk',
        crouched: false,
        noiseRadius: 2.25,
        inputDevice: 'keyboard',
        simTimeMs: 30_000,
        doors: [{ id: 'lobby', open: true }],
        guards: [{ id: 'guard-1', state: 'curious', suspicion: 33.2 }],
        grid: { x: 5, y: 7, simValue: 0.25, rendered: 0.5, curve: 0.5 },
      }),
    ).toEqual([
      'fps 60 (worst 48)',
      'speed walk',
      'noise 2.3m',
      'input keyboard',
      'sim 30.0s',
      'lobby: open',
      'guard-1: curious (33)',
      'grid @(5,7) sim 0.25 | rendered 0.50 | curve 0.50',
    ]);
  });
});
