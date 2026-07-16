import { MISSION } from '../config/mission';
import type { InputDevice, SpeedState } from '../input/InputState';
import type { MissionState } from '../sim/MissionState';

export interface HudPresentation {
  clockLabel: string;
  mission: MissionState;
  currentFps: number;
  worstFps: number;
  speed: SpeedState;
  crouched: boolean;
  noiseRadius: number;
  device: InputDevice;
  suspicion: number;
  alertLevel: number;
  simTimeMs: number;
  boltsUsed: number;
  boltCount: number;
  doors: ReadonlyArray<{ id: string; open: boolean }>;
  guards: ReadonlyArray<{ id: string; state: string; suspicion: number }>;
  grid: { x: number; y: number; simValue: number; rendered: number | null; curve: number } | null;
}

function objectiveLine(mission: MissionState): string {
  const photosDone = MISSION.photos.filter((photo) => mission.photos[photo.id] !== null).length;
  const photoTally = `  ·  photos ${photosDone}/${MISSION.photos.length}`;
  if (mission.plantedAtMs === null) {
    return `OBJECTIVE: plant the device (server room)${photoTally}`;
  }
  if (mission.exfilledAtMs === null) {
    return `OBJECTIVE: exfil to the lift lobby${photoTally}`;
  }
  return `OBJECTIVE: complete${photoTally}`;
}

function holdLine(mission: MissionState): string {
  if (mission.holdObjectiveId === null || mission.holdProgressMs <= 0) {
    return '';
  }
  const isPlant = mission.holdObjectiveId === MISSION.plant.id;
  const holdMs = isPlant ? MISSION.plantHoldMs : MISSION.photoHoldMs;
  const pct = Math.min(100, Math.round((mission.holdProgressMs / holdMs) * 100));
  return `${isPlant ? 'PLANTING' : 'PHOTOGRAPHING'}... ${pct}%`;
}

/** Formats the shipped Phase 6 HUD without reading or mutating game state. */
export function buildHudLines(input: HudPresentation): string[] {
  const lines = [
    `${input.clockLabel}   ${objectiveLine(input.mission)}`,
    holdLine(input.mission),
    '',
    `fps ${input.currentFps.toFixed(0)} (worst ${input.worstFps.toFixed(0)})`,
    `speed ${input.speed}${input.crouched ? ' (crouched)' : ''}`,
    `noise ${input.noiseRadius.toFixed(1)}m`,
    `device ${input.device}`,
    `suspicion ${input.suspicion.toFixed(0)}`,
    `alert level ${input.alertLevel}`,
    `sim ${(input.simTimeMs / 1000).toFixed(1)}s`,
    `bolts ${input.boltsUsed}/${input.boltCount}`,
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
