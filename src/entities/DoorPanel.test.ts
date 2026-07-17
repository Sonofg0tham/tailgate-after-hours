import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FollowCamera } from '../camera/FollowCamera';
import floor12 from '../data/floor12.json';
import { isWall, parseLevel, type DoorKindDef, type LevelData } from '../world/level';

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
    faceOffsetMetres: number;
    slabWidthCells: number;
  };
  doorLabelFaceTransforms?: (opensEastWest: boolean) => readonly {
    x: number;
    y: number;
    z: number;
    rotationY: number;
  }[];
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
  it('keeps each compact access label on a plausible low door kickplate and clear of neighbouring labels', async () => {
    const module = await loadDoorPanel();
    expect(module.DOOR_LABEL_LAYOUT).toBeDefined();
    if (!module.DOOR_LABEL_LAYOUT) return;

    const layout = module.DOOR_LABEL_LAYOUT;
    const doorSpacingCells = 3;
    expect(layout.widthCells).toBeLessThanOrEqual(layout.slabWidthCells);
    expect(layout.slabWidthCells - layout.widthCells).toBeGreaterThanOrEqual(0.04);
    expect(doorSpacingCells - layout.widthCells).toBeGreaterThanOrEqual(1.7);
    expect(layout.heightCells).toBeGreaterThanOrEqual(0.3);
    expect(layout.heightCells).toBeLessThanOrEqual(0.34);
    expect(layout.centreY - layout.heightCells / 2).toBeGreaterThanOrEqual(0.12);
    expect(layout.centreY).toBeLessThanOrEqual(0.5);
    expect(layout.faceOffsetMetres).toBeGreaterThan(0.12 / 2);
    expect(layout.faceOffsetMetres).toBeLessThanOrEqual(0.08);
  });

  it('places front-sided labels just beyond both physical faces for either door orientation', async () => {
    const module = await loadDoorPanel();
    expect(module.DOOR_LABEL_LAYOUT).toBeDefined();
    expect(typeof module.doorLabelFaceTransforms).toBe('function');
    if (!module.DOOR_LABEL_LAYOUT || !module.doorLabelFaceTransforms) return;

    const { centreY, faceOffsetMetres } = module.DOOR_LABEL_LAYOUT;
    expect(module.doorLabelFaceTransforms(true)).toEqual([
      { x: faceOffsetMetres, y: centreY, z: 0, rotationY: Math.PI / 2 },
      { x: -faceOffsetMetres, y: centreY, z: 0, rotationY: -Math.PI / 2 },
    ]);
    expect(module.doorLabelFaceTransforms(false)).toEqual([
      { x: 0, y: centreY, z: faceOffsetMetres, rotationY: 0 },
      { x: 0, y: centreY, z: -faceOffsetMetres, rotationY: Math.PI },
    ]);
  });

  it.each([
    { width: 1440, height: 900, topHudBottom: 164.88 },
    { width: 1024, height: 768, topHudBottom: 165.75 },
  ])(
    'keeps both faces of every real lobby label below the top HUD at $width x $height',
    async ({ width, height, topHudBottom }) => {
      const module = await loadDoorPanel();
      expect(module.DOOR_LABEL_LAYOUT).toBeDefined();
      expect(typeof module.doorLabelFaceTransforms).toBe('function');
      if (!module.DOOR_LABEL_LAYOUT || !module.doorLabelFaceTransforms) return;

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

        const halfWidth = (module.DOOR_LABEL_LAYOUT.widthCells * level.cellSize) / 2;
        const halfHeight = (module.DOOR_LABEL_LAYOUT.heightCells * level.cellSize) / 2;

        for (const door of level.doors) {
          const opensEastWest = isWall(level, door.x, door.y - 1) && isWall(level, door.x, door.y + 1);
          for (const face of module.doorLabelFaceTransforms(opensEastWest)) {
            const projectedCorners: { x: number; y: number }[] = [];
            for (const horizontal of [-1, 1]) {
              for (const vertical of [-1, 1]) {
                const corner = new THREE.Vector3(
                  (door.x + 0.5) * level.cellSize + face.x,
                  face.y + vertical * halfHeight,
                  (door.y + 0.5) * level.cellSize + face.z,
                );
                if (opensEastWest) {
                  corner.z += horizontal * halfWidth;
                } else {
                  corner.x += horizontal * halfWidth;
                }
                const ndc = corner.project(followCamera.camera);
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
            expect(Math.min(...ys), `${door.displayName} HUD clearance`).toBeGreaterThan(topHudBottom + 2);
            expect(Math.max(...ys), `${door.displayName} bottom edge`).toBeLessThanOrEqual(height);
          }
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
    const drawnText: { text: string; maxWidth: number | undefined }[] = [];
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
      fillText: (text: string, _x: number, _y: number, maxWidth?: number) => {
        written.push(text);
        drawnText.push({ text, maxWidth });
      },
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
      expect(drawnText).toEqual(
        expect.arrayContaining([
          { text: 'TEST ACCESS', maxWidth: 404 },
          { text: 'SECURED', maxWidth: 334 },
        ]),
      );
      expect(context.strokeRect).toHaveBeenCalledWith(34, 96, 32, 32);

      const labelMeshes = panel.group.children.filter(
        (child): child is THREE.Mesh => child instanceof THREE.Mesh && child !== panel.mesh,
      );
      expect(labelMeshes).toHaveLength(2);
      const [positiveFace, negativeFace] = labelMeshes;
      expect(positiveFace.position.x).toBeGreaterThan(0.12 / 2);
      expect(negativeFace.position.x).toBeLessThan(-0.12 / 2);
      expect(positiveFace.rotation.y).toBeCloseTo(Math.PI / 2);
      expect(negativeFace.rotation.y).toBeCloseTo(-Math.PI / 2);
      expect(positiveFace.geometry).toBe(negativeFace.geometry);
      expect(positiveFace.material).toBe(negativeFace.material);

      const labelMaterial = positiveFace.material as THREE.MeshBasicMaterial;
      expect(labelMaterial.side).toBe(THREE.FrontSide);
      expect(labelMaterial.depthTest).toBe(true);
      expect(labelMaterial.map).not.toBeNull();
      if (!labelMaterial.map) return;

      panel.update(true, false);
      expect(panel.mesh.visible).toBe(false);
      expect(labelMeshes.every((label) => label.visible)).toBe(true);
      expect(written).toContain('OPEN');
      expect(context.arc).toHaveBeenCalled();

      panel.update(false, true);
      expect(panel.mesh.visible).toBe(true);
      expect(written).toContain('LOCKDOWN');
      expect(context.moveTo).toHaveBeenCalled();
      expect(context.fill).toHaveBeenCalled();

      const geometryDispose = vi.spyOn(panel.mesh.geometry, 'dispose');
      const panelMaterialDispose = vi.spyOn(panel.mesh.material as THREE.Material, 'dispose');
      const labelGeometryDispose = vi.spyOn(positiveFace.geometry, 'dispose');
      const labelMaterialDispose = vi.spyOn(labelMaterial, 'dispose');
      const textureDispose = vi.spyOn(labelMaterial.map, 'dispose');

      panel.dispose();

      expect(geometryDispose).toHaveBeenCalledOnce();
      expect(panelMaterialDispose).toHaveBeenCalledOnce();
      expect(labelGeometryDispose).toHaveBeenCalledOnce();
      expect(labelMaterialDispose).toHaveBeenCalledOnce();
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
