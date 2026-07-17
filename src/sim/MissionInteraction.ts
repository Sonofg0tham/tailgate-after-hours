import { MISSION } from '../config/mission';
import type { MissionState } from './MissionState';
import type { PlayerState } from './PlayerState';

interface MissionInteractionTargetFields {
  readonly id: string;
  readonly label: string;
  readonly holdMs: number;
  readonly x: number;
  readonly z: number;
}

export type MissionInteractionTarget =
  | Readonly<MissionInteractionTargetFields & { kind: 'plant' }>
  | Readonly<MissionInteractionTargetFields & { kind: 'photo' }>;

export function selectMissionInteractionTarget(
  mission: MissionState,
  player: PlayerState,
): MissionInteractionTarget | null {
  if (mission.phase !== 'infiltrating') {
    return null;
  }

  const candidates: MissionInteractionTarget[] = [];
  if (mission.plantedAtMs === null) {
    candidates.push({
      kind: 'plant',
      id: MISSION.plant.id,
      label: MISSION.plant.label,
      holdMs: MISSION.plantHoldMs,
      x: MISSION.plant.x,
      z: MISSION.plant.z,
    });
  }
  for (const photo of MISSION.photos) {
    if (mission.photos[photo.id] === null) {
      candidates.push({
        kind: 'photo',
        id: photo.id,
        label: photo.label,
        holdMs: MISSION.photoHoldMs,
        x: photo.x,
        z: photo.z,
      });
    }
  }

  let best: MissionInteractionTarget | null = null;
  let bestDistance: number = MISSION.interactRangeMetres;
  for (const candidate of candidates) {
    const distance = Math.hypot(player.x - candidate.x, player.z - candidate.z);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}
