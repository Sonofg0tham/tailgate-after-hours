import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { parseLevel, type LevelData } from '../world/level';
import floor12 from '../data/floor12.json';
import { DebugVisionCone } from './DebugVisionCone';
import { TorchBeam } from './TorchBeam';

const level = parseLevel(floor12 as LevelData);

describe('threat telegraph geometry', () => {
  it('reuses the torch beam position and index buffers without generating normals', () => {
    const beam = new TorchBeam();
    const mesh = beam.group.children[0] as THREE.Mesh<THREE.BufferGeometry>;

    beam.update(level, 5, 5, 0, 8, 70, 'steady', 0);
    const positions = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.getIndex();
    beam.update(level, 5, 5, Math.PI / 2, 8, 70, 'steady', 1);

    expect(mesh.geometry.getAttribute('position')).toBe(positions);
    expect(mesh.geometry.getIndex()).toBe(index);
    expect(mesh.geometry.getAttribute('normal')).toBeUndefined();
  });

  it('reuses the debug cone buffer and leaves it untouched while hidden', () => {
    const cone = new DebugVisionCone();
    cone.mesh.visible = true;
    cone.update(5, 5, 0, 8, 70);
    const positions = cone.mesh.geometry.getAttribute('position');
    const beforeHiddenUpdate = Array.from(positions.array);

    cone.mesh.visible = false;
    cone.update(20, 20, Math.PI, 12, 100);
    expect(cone.mesh.geometry.getAttribute('position')).toBe(positions);
    expect(Array.from(positions.array)).toEqual(beforeHiddenUpdate);

    cone.mesh.visible = true;
    cone.update(20, 20, Math.PI, 12, 100);
    expect(cone.mesh.geometry.getAttribute('position')).toBe(positions);
  });
});
