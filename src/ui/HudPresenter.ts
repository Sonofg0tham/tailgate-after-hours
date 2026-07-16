import type { InputDevice, SpeedState } from '../input/InputState';
import { selectMissionInteractionTarget } from '../sim/MissionInteraction';
import type { MissionState } from '../sim/MissionState';
import type { PlayerState } from '../sim/PlayerState';
import { nightClockLabel } from '../systems/NightClock';

export type PlayerAlertState = 'calm' | 'cautious' | 'alarm';
export type PlayerAlertMarker = 'circle' | 'diamond' | 'triangle';

export interface PlayerHudPresentation {
  objective: string;
  clock: string;
  alert: {
    state: PlayerAlertState;
    label: 'CALM' | 'CAUTIOUS' | 'ALARM';
    marker: PlayerAlertMarker;
    suspicionPercent: number;
    suspicionText: string;
  };
  inventory: {
    deviceStatus: 'READY' | 'DEPLOYED';
    boltsRemaining: number;
  };
  interaction: {
    prompt: '[ HOLD E / A ] PLANT DEVICE' | '[ HOLD E / A ] CAPTURE EVIDENCE';
    progressPercent: number;
    progressText: string;
  } | null;
}

export interface PlayerHudInput {
  mission: MissionState;
  player: PlayerState;
  simTimeMs: number;
  suspicion: number;
  alertLevel: 0 | 1 | 2;
  boltsUsed: number;
  boltCount: number;
}

export interface DebugHudInput {
  currentFps: number;
  worstFps: number;
  speed: SpeedState;
  crouched: boolean;
  noiseRadius: number;
  inputDevice: InputDevice;
  simTimeMs: number;
  doors: ReadonlyArray<{ id: string; open: boolean }>;
  guards: ReadonlyArray<{ id: string; state: string; suspicion: number }>;
  grid: { x: number; y: number; simValue: number; rendered: number | null; curve: number } | null;
}

const ALERT_PRESENTATION: Record<
  PlayerHudInput['alertLevel'],
  Pick<PlayerHudPresentation['alert'], 'state' | 'label' | 'marker'>
> = {
  0: { state: 'calm', label: 'CALM', marker: 'circle' },
  1: { state: 'cautious', label: 'CAUTIOUS', marker: 'diamond' },
  2: { state: 'alarm', label: 'ALARM', marker: 'triangle' },
};

function objectiveLabel(mission: MissionState): string {
  if (mission.phase === 'exfilled') return 'ENGAGEMENT COMPLETE';
  if (mission.phase === 'dawn') return 'DAWN WINDOW CLOSED';
  if (mission.phase === 'abandoned') return 'ENGAGEMENT ABANDONED';
  return mission.plantedAtMs === null ? 'PLANT DEVICE IN SERVER ROOM' : 'RETURN TO SERVICE LIFT';
}

function percentage(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Builds the complete player-facing HUD model without reading or mutating browser state. */
export function buildPlayerHudPresentation(input: PlayerHudInput): PlayerHudPresentation {
  const suspicionPercent = percentage(input.suspicion);
  const alert = ALERT_PRESENTATION[input.alertLevel];
  const target = selectMissionInteractionTarget(input.mission, input.player);
  const heldMs = target !== null && input.mission.holdObjectiveId === target.id ? input.mission.holdProgressMs : 0;
  const progressPercent = target === null ? 0 : percentage((heldMs / target.holdMs) * 100);

  return {
    objective: objectiveLabel(input.mission),
    clock: nightClockLabel(input.simTimeMs),
    alert: {
      ...alert,
      suspicionPercent,
      suspicionText: `${suspicionPercent}%`,
    },
    inventory: {
      deviceStatus: input.mission.plantedAtMs === null ? 'READY' : 'DEPLOYED',
      boltsRemaining: Math.max(0, input.boltCount - input.boltsUsed),
    },
    interaction:
      target === null
        ? null
        : {
            prompt: target.kind === 'plant' ? '[ HOLD E / A ] PLANT DEVICE' : '[ HOLD E / A ] CAPTURE EVIDENCE',
            progressPercent,
            progressText: `${progressPercent}%`,
          },
  };
}

/** Formats diagnostics for the separate development-only debug surface. */
export function buildDebugLines(input: DebugHudInput): string[] {
  const lines = [
    `fps ${input.currentFps.toFixed(0)} (worst ${input.worstFps.toFixed(0)})`,
    `speed ${input.speed}${input.crouched ? ' (crouched)' : ''}`,
    `noise ${input.noiseRadius.toFixed(1)}m`,
    `input ${input.inputDevice}`,
    `sim ${(input.simTimeMs / 1000).toFixed(1)}s`,
    ...input.doors.map((door) => `${door.id}: ${door.open ? 'open' : 'shut'}`),
  ];

  for (const guard of input.guards) {
    lines.push(`${guard.id}: ${guard.state} (${guard.suspicion.toFixed(0)})`);
  }
  if (input.grid) {
    const { x, y, simValue, rendered, curve } = input.grid;
    lines.push(
      `grid @(${x},${y}) sim ${simValue.toFixed(2)} | rendered ${rendered?.toFixed(2) ?? 'n/a'} | curve ${curve.toFixed(2)}`,
    );
  }
  return lines;
}
