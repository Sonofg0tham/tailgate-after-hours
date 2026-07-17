import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { DoorKindDef } from '../world/level';

interface DoorAccessPresentation {
  state: 'OPEN' | 'SECURED' | 'LOCKDOWN';
  label: 'OPEN' | 'SECURED' | 'LOCKDOWN';
  icon: 'ring' | 'square' | 'triangle';
  tone: 'clearance' | 'neutral' | 'alarm';
}

interface DoorPanelModule {
  selectDoorAccessPresentation?: (
    kind: DoorKindDef['kind'],
    open: boolean,
    lockdown: boolean,
  ) => DoorAccessPresentation;
  DoorPanel?: new (def: DoorKindDef, opensEastWest: boolean, cellSize: number) => {
    group: THREE.Group;
    mesh: THREE.Mesh;
    update(open: boolean, lockdown: boolean): void;
    dispose(): void;
  };
}

async function loadDoorPanel(): Promise<DoorPanelModule> {
  const modulePath = './DoorPanel';
  return import(/* @vite-ignore */ modulePath) as Promise<DoorPanelModule>;
}

describe('selectDoorAccessPresentation', () => {
  it('maps physical and building state to three labelled, shaped access states', async () => {
    const module = await loadDoorPanel();
    expect(typeof module.selectDoorAccessPresentation).toBe('function');
    if (!module.selectDoorAccessPresentation) return;

    expect(module.selectDoorAccessPresentation('badge', true, false)).toEqual({
      state: 'OPEN',
      label: 'OPEN',
      icon: 'ring',
      tone: 'clearance',
    });
    expect(module.selectDoorAccessPresentation('badge', false, false)).toEqual({
      state: 'SECURED',
      label: 'SECURED',
      icon: 'square',
      tone: 'neutral',
    });
    expect(module.selectDoorAccessPresentation('badge', false, true)).toEqual({
      state: 'LOCKDOWN',
      label: 'LOCKDOWN',
      icon: 'triangle',
      tone: 'alarm',
    });
  });

  it('does not rely on colour to distinguish access states', async () => {
    const module = await loadDoorPanel();
    expect(typeof module.selectDoorAccessPresentation).toBe('function');
    if (!module.selectDoorAccessPresentation) return;

    const states = [
      module.selectDoorAccessPresentation('badge', true, false),
      module.selectDoorAccessPresentation('badge', false, false),
      module.selectDoorAccessPresentation('badge', false, true),
    ];

    expect(new Set(states.map((state) => state.label)).size).toBe(3);
    expect(new Set(states.map((state) => state.icon)).size).toBe(3);
    expect(states.find((state) => state.state === 'SECURED')?.tone).not.toBe('alarm');
  });

  it('keeps the service lift on its schedule during a building lockdown', async () => {
    const module = await loadDoorPanel();
    expect(typeof module.selectDoorAccessPresentation).toBe('function');
    if (!module.selectDoorAccessPresentation) return;

    expect(module.selectDoorAccessPresentation('lift', false, true).state).toBe('SECURED');
    expect(module.selectDoorAccessPresentation('lift', true, true).state).toBe('OPEN');
  });
});

describe('DoorPanel', () => {
  it('keeps the physical open cue, redraws the readable label, and disposes every owned resource', async () => {
    const written: string[] = [];
    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      fillText: (text: string) => written.push(text),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      font: '',
      textAlign: '',
      textBaseline: '',
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
    };
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { createElement: () => canvas },
    });

    try {
      const module = await loadDoorPanel();
      expect(typeof module.DoorPanel).toBe('function');
      if (!module.DoorPanel) return;

      const panel = new module.DoorPanel(
        { x: 2, y: 1, id: 'test-door', kind: 'badge', displayName: 'TEST ACCESS' },
        true,
        1,
      );
      expect(panel.group.children).toContain(panel.mesh);
      expect(panel.mesh.visible).toBe(true);
      expect(written).toEqual(expect.arrayContaining(['TEST ACCESS', 'SECURED']));

      panel.update(true, false);
      expect(panel.mesh.visible).toBe(false);
      expect(written).toContain('OPEN');

      panel.update(false, true);
      expect(panel.mesh.visible).toBe(true);
      expect(written).toContain('LOCKDOWN');

      const sprite = panel.group.children.find((child) => child instanceof THREE.Sprite);
      expect(sprite).toBeInstanceOf(THREE.Sprite);
      if (!(sprite instanceof THREE.Sprite)) return;
      const spriteMaterial = sprite.material as THREE.SpriteMaterial;
      expect(spriteMaterial.map).not.toBeNull();
      if (!spriteMaterial.map) return;

      const geometryDispose = vi.spyOn(panel.mesh.geometry, 'dispose');
      const panelMaterialDispose = vi.spyOn(panel.mesh.material as THREE.Material, 'dispose');
      const spriteMaterialDispose = vi.spyOn(spriteMaterial, 'dispose');
      const textureDispose = vi.spyOn(spriteMaterial.map, 'dispose');

      panel.dispose();

      expect(geometryDispose).toHaveBeenCalledOnce();
      expect(panelMaterialDispose).toHaveBeenCalledOnce();
      expect(spriteMaterialDispose).toHaveBeenCalledOnce();
      expect(textureDispose).toHaveBeenCalledOnce();
    } finally {
      if (originalDocument) {
        Object.defineProperty(globalThis, 'document', originalDocument);
      } else {
        Reflect.deleteProperty(globalThis, 'document');
      }
    }
  });
});
