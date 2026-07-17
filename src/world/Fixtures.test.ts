import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import floor12 from '../data/floor12.json';
import { buildFixtures } from './Fixtures';
import { parseLevel, type LevelData } from './level';

const level = parseLevel(floor12 as LevelData);

function resources(root: THREE.Object3D): {
  geometries: Set<THREE.BufferGeometry>;
  materials: Set<THREE.Material>;
} {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) {
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of list) materials.add(material);
    }
  });
  return { geometries, materials };
}

describe('fixture resource ownership', () => {
  it('returns an owned visual handle rather than a bare group', () => {
    const fixtures = buildFixtures(level);
    expect(fixtures.group).toBeInstanceOf(THREE.Group);
    expect(typeof fixtures.dispose).toBe('function');
    fixtures.dispose();
  });

  it('does not share disposable resources between builds', () => {
    const first = buildFixtures(level);
    const second = buildFixtures(level);
    const a = resources(first.group);
    const b = resources(second.group);

    expect([...a.geometries].filter((entry) => b.geometries.has(entry))).toEqual([]);
    expect([...a.materials].filter((entry) => b.materials.has(entry))).toEqual([]);
    first.dispose();
    second.dispose();
  });

  it('disposes each geometry and material exactly once', () => {
    const fixtures = buildFixtures(level);
    const owned = resources(fixtures.group);
    for (const geometry of owned.geometries) vi.spyOn(geometry, 'dispose');
    for (const material of owned.materials) vi.spyOn(material, 'dispose');

    fixtures.dispose();
    fixtures.dispose();

    for (const geometry of owned.geometries) expect(geometry.dispose).toHaveBeenCalledTimes(1);
    for (const material of owned.materials) expect(material.dispose).toHaveBeenCalledTimes(1);
    expect(fixtures.group.children).toHaveLength(0);
  });
});
