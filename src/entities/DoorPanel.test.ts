import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FollowCamera } from '../camera/FollowCamera';
import floor12 from '../data/floor12.json';
import { parseLevel, type DoorKindDef, type LevelData } from '../world/level';

interface DoorAccessPresentation {
  state: 'OPEN' | 'SECURED' | 'LOCKDOWN';
  label: 'OPEN' | 'SECURED' | 'LOCKDOWN';
  icon: 'ring' | 'square' | 'triangle';
  tone: 'clearance' | 'neutral' | 'alarm';
}

interface DoorPanelModule {
  DOOR_LABEL_LAYOUT?: {
    widthCells: number;
    heightCells: number;
    centreY: number;
  };
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
  it('keeps each access label compact, on the upper door face, and clear of neighbouring labels', async () => {
    const module = await loadDoorPanel();
    expect(module.DOOR_LABEL_LAYOUT).toBeDefined();
    if (!module.DOOR_LABEL_LAYOUT) return;

    const layout = module.DOOR_LABEL_LAYOUT;
    const doorSpacingCells = 3;
    expect(layout.widthCells).toBeLessThanOrEqual(1.3);
    expect(doorSpacingCells - layout.widthCells).toBeGreaterThanOrEqual(1.7);
    expect(layout.heightCells).toBeCloseTo(layout.widthCells * (192 / 512));

    const doorTop = 3 * 0.8;
    expect(layout.centreY).toBeGreaterThanOrEqual(doorTop * 0.75);
    expect(layout.centreY).toBeLessThanOrEqual(doorTop);
  });

  it.each([
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
  ])(
    'keeps every real lobby door name inside the $width x $height viewport at spawn',
    async ({ width, height }) => {
      const module = await loadDoorPanel();
      expect(module.DOOR_LABEL_LAYOUT).toBeDefined();
      if (!module.DOOR_LABEL_LAYOUT) return;

      const level = parseLevel(floor12 as LevelData);
      expect(level.doors.map((door) => door.id)).toEqual(['fire-stairs', 'lobby', 'lift']);

      const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: { addEventListener: vi.fn() },
      });

      try {
        const followCamera = new FollowCamera(width / height);
        followCamera.follow(
          (level.playerStart.x + 0.5) * level.cellSize,
          (level.playerStart.y + 0.5) * level.cellSize,
          0,
          0,
          1 / 60,
        );
        followCamera.camera.updateMatrixWorld();

        const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(followCamera.camera.quaternion);
        const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(followCamera.camera.quaternion);
        const halfWidth = (module.DOOR_LABEL_LAYOUT.widthCells * level.cellSize) / 2;
        const halfHeight = (module.DOOR_LABEL_LAYOUT.heightCells * level.cellSize) / 2;

        for (const door of level.doors) {
          const centre = new THREE.Vector3(
            (door.x + 0.5) * level.cellSize,
            module.DOOR_LABEL_LAYOUT.centreY,
            (door.y + 0.5) * level.cellSize,
          );
          const projectedCorners: { x: number; y: number }[] = [];
          for (const horizontal of [-1, 1]) {
            for (const vertical of [-1, 1]) {
              const ndc = centre
                .clone()
                .addScaledVector(cameraRight, horizontal * halfWidth)
                .addScaledVector(cameraUp, vertical * halfHeight)
                .project(followCamera.camera);
              projectedCorners.push({
                x: ((ndc.x + 1) * width) / 2,
                y: ((1 - ndc.y) * height) / 2,
              });
            }
          }

          const xs = projectedCorners.map((corner) => corner.x);
          const ys = projectedCorners.map((corner) => corner.y);
          expect(Math.min(...xs), `${door.displayName} left edge`).toBeGreaterThanOrEqual(0);
          expect(Math.max(...xs), `${door.displayName} right edge`).toBeLessThanOrEqual(width);
          expect(Math.min(...ys), `${door.displayName} top edge`).toBeGreaterThanOrEqual(0);
          expect(Math.max(...ys), `${door.displayName} bottom edge`).toBeLessThanOrEqual(height);
        }
      } finally {
        if (originalWindow) {
          Object.defineProperty(globalThis, 'window', originalWindow);
        } else {
          Reflect.deleteProperty(globalThis, 'window');
        }
      }
    },
  );

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
      expect(sprite.scale.x).toBeCloseTo(1.3);
      expect(sprite.scale.y).toBeCloseTo(1.3 * (192 / 512));
      expect(sprite.position.y).toBeCloseTo(2.4);
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
