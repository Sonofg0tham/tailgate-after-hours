import { describe, expect, it } from 'vitest';
import { MISSION } from '../config/mission';
import { createMissionState } from './MissionState';
import { selectMissionInteractionTarget } from './MissionInteraction';

describe('selectMissionInteractionTarget', () => {
  it('selects the incomplete plant target while infiltrating', () => {
    const target = selectMissionInteractionTarget(createMissionState(), {
      x: MISSION.plant.x,
      z: MISSION.plant.z,
      facingYaw: 0,
    });

    expect(target).toEqual({
      kind: 'plant',
      id: MISSION.plant.id,
      label: MISSION.plant.label,
      holdMs: MISSION.plantHoldMs,
      x: MISSION.plant.x,
      z: MISSION.plant.z,
    });
  });

  it.each(MISSION.photos)('selects the incomplete $id photo target while infiltrating', (photo) => {
    const mission = { ...createMissionState(), plantedAtMs: 1 };
    const target = selectMissionInteractionTarget(mission, {
      x: photo.x,
      z: photo.z,
      facingYaw: 0,
    });

    expect(target).toEqual({
      kind: 'photo',
      id: photo.id,
      label: photo.label,
      holdMs: MISSION.photoHoldMs,
      x: photo.x,
      z: photo.z,
    });
  });

  it('selects the nearest eligible target instead of prioritising the plant', () => {
    const nearestPhoto = MISSION.photos[1];
    const target = selectMissionInteractionTarget(createMissionState(), {
      x: nearestPhoto.x,
      z: nearestPhoto.z,
      facingYaw: 0,
    });

    expect(target?.kind).toBe('photo');
    expect(target?.id).toBe(nearestPhoto.id);
  });

  it('does not select completed plant or photo targets', () => {
    const plantDone = { ...createMissionState(), plantedAtMs: 1 };
    expect(selectMissionInteractionTarget(plantDone, { ...MISSION.plant, facingYaw: 0 })).toBeNull();

    for (const photo of MISSION.photos) {
      const mission = createMissionState();
      const photoDone = { ...mission, photos: { ...mission.photos, [photo.id]: 1 } };
      expect(selectMissionInteractionTarget(photoDone, { ...photo, facingYaw: 0 })).toBeNull();
    }
  });

  it('returns no target outside the configured interaction range', () => {
    expect(selectMissionInteractionTarget(createMissionState(), { x: 1.5, z: 1.5, facingYaw: 0 })).toBeNull();
  });

  it.each(['exfilled', 'dawn', 'abandoned'] as const)('returns no target once mission phase is %s', (phase) => {
    const mission = { ...createMissionState(), phase };
    expect(selectMissionInteractionTarget(mission, { ...MISSION.plant, facingYaw: 0 })).toBeNull();
  });
});
