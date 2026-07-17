import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createMissionState } from '../sim/MissionState';
import { MissionVisuals } from './MissionVisuals';

function named(root: THREE.Object3D, name: string): THREE.Object3D {
  const object = root.getObjectByName(name);
  expect(object, name).toBeDefined();
  return object!;
}

describe('MissionVisuals', () => {
  it('uses floor decals and equipment highlights, never prototype cylinders', () => {
    const visuals = new MissionVisuals();
    let cylinders = 0;
    visuals.group.traverse((object) => {
      const geometry = (object as THREE.Mesh).geometry;
      if (geometry instanceof THREE.CylinderGeometry) cylinders += 1;
    });

    expect(cylinders).toBe(0);
    expect(named(visuals.group, 'mission:plant-highlight')).toBeDefined();
    expect(named(visuals.group, 'mission:photo:corner-office')).toBeDefined();
    expect(named(visuals.group, 'mission:photo:sticky-note')).toBeDefined();
    expect(named(visuals.group, 'mission:exfil-chevrons')).toBeDefined();
  });

  it('shows only unfinished, currently useful mission cues', () => {
    const visuals = new MissionVisuals();
    const mission = createMissionState();
    visuals.update(mission, 0, { motionLevel: 'reduced', highContrast: false });

    expect(named(visuals.group, 'mission:plant-highlight').visible).toBe(true);
    expect(named(visuals.group, 'mission:photo:corner-office').visible).toBe(true);
    expect(named(visuals.group, 'mission:exfil-chevrons').visible).toBe(false);

    mission.plantedAtMs = 100;
    mission.photos['corner-office'] = 120;
    visuals.update(mission, 800, { motionLevel: 'reduced', highContrast: false });

    expect(named(visuals.group, 'mission:plant-highlight').visible).toBe(false);
    expect(named(visuals.group, 'mission:photo:corner-office').visible).toBe(false);
    expect(named(visuals.group, 'mission:photo:sticky-note').visible).toBe(true);
    expect(named(visuals.group, 'mission:exfil-chevrons').visible).toBe(true);

    mission.exfilledAtMs = 200;
    visuals.update(mission, 1600, { motionLevel: 'full', highContrast: true });
    expect(named(visuals.group, 'mission:exfil-chevrons').visible).toBe(false);
  });

  it('keeps cues static for reduced motion and applies a restrained full-motion pulse', () => {
    const visuals = new MissionVisuals();
    const mission = createMissionState();
    const plant = named(visuals.group, 'mission:plant-highlight');

    visuals.update(mission, 0, { motionLevel: 'reduced', highContrast: false });
    const reducedScale = plant.scale.x;
    visuals.update(mission, 900, { motionLevel: 'reduced', highContrast: false });
    expect(plant.scale.x).toBe(reducedScale);

    visuals.update(mission, 0, { motionLevel: 'full', highContrast: false });
    const fullStart = plant.scale.x;
    visuals.update(mission, 900, { motionLevel: 'full', highContrast: false });
    expect(plant.scale.x).not.toBe(fullStart);
    expect(plant.scale.x).toBeLessThanOrEqual(1.04);
  });

  it('raises cue opacity for high contrast without changing the alarm-red reserve', () => {
    const visuals = new MissionVisuals();
    const mission = createMissionState();
    const opacities = (): number[] => {
      const values: number[] = [];
      visuals.group.traverse((object) => {
        const material = (object as THREE.Mesh).material;
        if (material instanceof THREE.Material && 'opacity' in material) values.push(material.opacity);
      });
      return values;
    };

    visuals.update(mission, 0, { motionLevel: 'reduced', highContrast: false });
    const normal = Math.max(...opacities());
    visuals.update(mission, 0, { motionLevel: 'reduced', highContrast: true });
    expect(Math.max(...opacities())).toBeGreaterThan(normal);

    visuals.group.traverse((object) => {
      const material = (object as THREE.Mesh).material;
      const materials = material ? (Array.isArray(material) ? material : [material]) : [];
      for (const entry of materials) {
        if ('color' in entry) expect((entry as THREE.MeshBasicMaterial).color.getHex()).not.toBe(0xff3b30);
      }
    });
  });

  it('disposes every owned geometry and material once', () => {
    const visuals = new MissionVisuals();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    visuals.group.traverse((object) => {
      const renderable = object as THREE.Mesh;
      if (renderable.geometry) geometries.add(renderable.geometry);
      if (renderable.material) {
        const list = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
        for (const material of list) materials.add(material);
      }
    });
    for (const geometry of geometries) vi.spyOn(geometry, 'dispose');
    for (const material of materials) vi.spyOn(material, 'dispose');

    visuals.dispose();
    visuals.dispose();

    for (const geometry of geometries) expect(geometry.dispose).toHaveBeenCalledTimes(1);
    for (const material of materials) expect(material.dispose).toHaveBeenCalledTimes(1);
  });
});
