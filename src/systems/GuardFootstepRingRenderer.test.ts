import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { PALETTE_HEX } from '../config/palette';
import type { GuardFootstepRingSlot } from './GuardFootstepRingPool';

interface RingRendererModule {
  GuardFootstepRingRenderer?: new (capacity: number) => {
    group: THREE.Group;
    render(rings: readonly GuardFootstepRingSlot[]): void;
    dispose(): void;
  };
}

async function loadRenderer(): Promise<RingRendererModule | null> {
  const modulePath = './GuardFootstepRingRenderer';
  return import(/* @vite-ignore */ modulePath).catch(() => null) as Promise<RingRendererModule | null>;
}

function ring(overrides: Partial<GuardFootstepRingSlot> = {}): GuardFootstepRingSlot {
  return {
    active: true,
    x: 4,
    z: 7,
    ageMs: 100,
    mode: 'expanding',
    scale: 1.25,
    opacity: 0.18,
    ...overrides,
  };
}

describe('GuardFootstepRingRenderer', () => {
  it('preallocates cool-grey floor meshes and only mutates them while rendering pool state', async () => {
    const module = await loadRenderer();
    expect(typeof module?.GuardFootstepRingRenderer).toBe('function');
    if (!module?.GuardFootstepRingRenderer) return;

    const renderer = new module.GuardFootstepRingRenderer(2);
    const meshes = renderer.group.children as THREE.Mesh[];
    const originalMeshes = [...meshes];
    const originalMaterials = meshes.map((mesh) => mesh.material);

    renderer.render([ring(), ring({ active: false, opacity: 0 })]);

    expect(renderer.group.children).toEqual(originalMeshes);
    expect(meshes.map((mesh) => mesh.material)).toEqual(originalMaterials);
    expect(meshes[0].visible).toBe(true);
    expect(meshes[0].position.toArray()).toEqual([4, 0.025, 7]);
    expect(meshes[0].scale.x).toBe(1.25);
    expect((meshes[0].material as THREE.MeshBasicMaterial).opacity).toBe(0.18);
    expect((meshes[0].material as THREE.MeshBasicMaterial).color.getHex()).toBe(PALETTE_HEX.text);
    expect(meshes[1].visible).toBe(false);
  });

  it('disposes its one shared geometry and every preallocated material exactly once', async () => {
    const module = await loadRenderer();
    expect(typeof module?.GuardFootstepRingRenderer).toBe('function');
    if (!module?.GuardFootstepRingRenderer) return;

    const renderer = new module.GuardFootstepRingRenderer(3);
    const meshes = renderer.group.children as THREE.Mesh[];
    const geometryDispose = vi.spyOn(meshes[0].geometry, 'dispose');
    const materialDisposals = meshes.map((mesh) => vi.spyOn(mesh.material as THREE.Material, 'dispose'));

    renderer.dispose();
    renderer.dispose();

    expect(geometryDispose).toHaveBeenCalledOnce();
    for (const dispose of materialDisposals) {
      expect(dispose).toHaveBeenCalledOnce();
    }
  });
});
