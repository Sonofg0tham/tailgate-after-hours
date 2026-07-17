import * as THREE from 'three';
import { PALETTE } from '../config/palette';
import { WALL_HEIGHT } from '../world/Extruder';
import type { DoorKindDef } from '../world/level';

/**
 * A dynamic door's visible state, per kind — closed-fill colours match
 * Tailgate's Door.ts exactly (badge grey, smokers brown); `lift` has no
 * Tailgate precedent (see src/config/doors.ts's header) so it gets a new
 * colour in the same low-saturation family.
 */
const PANEL_COLOR: Record<DoorKindDef['kind'], number> = {
  badge: 0x9098a0,
  smokers: 0x8a6d43,
  lift: 0x5a7a92,
};

const PANEL_HEIGHT = WALL_HEIGHT * 0.8;
const PANEL_THICKNESS = 0.12;
const PANEL_FACE_WIDTH_CELLS = 0.92;
const LABEL_WIDTH = 440;
const LABEL_HEIGHT = 160;
const LABEL_WORLD_WIDTH_CELLS = 0.88;
const LABEL_WORLD_HEIGHT_CELLS = LABEL_WORLD_WIDTH_CELLS * (LABEL_HEIGHT / LABEL_WIDTH);
const LABEL_CENTRE_Y_METRES = 0.29;
const LABEL_FACE_GAP_METRES = 0.01;

/**
 * A compact one-line access marker mounted as a low illuminated kickplate
 * on each physical door face. Both planes remain depth-tested and
 * front-sided, so the near face reads while the door or back-face culling
 * hides the far one.
 */
export const DOOR_LABEL_LAYOUT = Object.freeze({
  widthCells: LABEL_WORLD_WIDTH_CELLS,
  heightCells: LABEL_WORLD_HEIGHT_CELLS,
  centreY: LABEL_CENTRE_Y_METRES,
  faceOffsetMetres: PANEL_THICKNESS / 2 + LABEL_FACE_GAP_METRES,
  slabWidthCells: PANEL_FACE_WIDTH_CELLS,
});

export interface DoorLabelFaceTransform {
  x: number;
  y: number;
  z: number;
  rotationY: number;
}

/** Render-safe placement for the two front-sided access-reader faces. */
export function doorLabelFaceTransforms(opensEastWest: boolean): readonly DoorLabelFaceTransform[] {
  const { centreY, faceOffsetMetres } = DOOR_LABEL_LAYOUT;
  if (opensEastWest) {
    return [
      { x: faceOffsetMetres, y: centreY, z: 0, rotationY: Math.PI / 2 },
      { x: -faceOffsetMetres, y: centreY, z: 0, rotationY: -Math.PI / 2 },
    ];
  }
  return [
    { x: 0, y: centreY, z: faceOffsetMetres, rotationY: 0 },
    { x: 0, y: centreY, z: -faceOffsetMetres, rotationY: Math.PI },
  ];
}

export type DoorAccessState = 'OPEN' | 'SECURED' | 'LOCKDOWN';
export type DoorAccessIcon = 'ring' | 'square' | 'triangle';
export type DoorAccessTone = 'clearance' | 'neutral' | 'alarm';

export interface DoorAccessPresentation {
  state: DoorAccessState;
  label: DoorAccessState;
  icon: DoorAccessIcon;
  tone: DoorAccessTone;
}

/** Pure colour-plus-shape contract for a dynamic door's current access state. */
export function selectDoorAccessPresentation(
  kind: DoorKindDef['kind'],
  open: boolean,
  lockdown: boolean,
): DoorAccessPresentation {
  if (kind !== 'lift' && lockdown && !open) {
    return { state: 'LOCKDOWN', label: 'LOCKDOWN', icon: 'triangle', tone: 'alarm' };
  }
  if (open) {
    return { state: 'OPEN', label: 'OPEN', icon: 'ring', tone: 'clearance' };
  }
  return { state: 'SECURED', label: 'SECURED', icon: 'square', tone: 'neutral' };
}

/**
 * A closed dynamic door is a solid barrier filling its cell's gap — the
 * PRIMARY legibility cue (per CLAUDE.md: never state by colour alone) is
 * the panel's presence/absence, matching exactly what closedDoorWallBounds
 * makes solid; the per-kind tint is a secondary cue only.
 */
export class DoorPanel {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  private readonly kind: DoorKindDef['kind'];
  private readonly displayName: string;
  private readonly panelMaterial: THREE.MeshStandardMaterial;
  private readonly labelTexture: THREE.CanvasTexture;
  private readonly labelGeometry: THREE.PlaneGeometry;
  private readonly labelMaterial: THREE.MeshBasicMaterial;
  private readonly labelContext: CanvasRenderingContext2D;
  private currentState: DoorAccessState | null = null;
  private disposed = false;

  constructor(def: DoorKindDef, opensEastWest: boolean, cellSize: number) {
    this.kind = def.kind;
    this.displayName = def.displayName;
    const width = opensEastWest ? PANEL_THICKNESS : cellSize * PANEL_FACE_WIDTH_CELLS;
    const depth = opensEastWest ? cellSize * PANEL_FACE_WIDTH_CELLS : PANEL_THICKNESS;
    const geometry = new THREE.BoxGeometry(width, PANEL_HEIGHT, depth);
    this.panelMaterial = new THREE.MeshStandardMaterial({ color: PANEL_COLOR[def.kind], roughness: 0.7 });
    this.mesh = new THREE.Mesh(geometry, this.panelMaterial);
    this.mesh.position.y = PANEL_HEIGHT / 2;

    const canvas = document.createElement('canvas');
    canvas.width = LABEL_WIDTH;
    canvas.height = LABEL_HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error(`Could not create the access label for door "${def.id}"`);
    }
    this.labelContext = context;
    this.labelTexture = new THREE.CanvasTexture(canvas);
    this.labelTexture.colorSpace = THREE.SRGBColorSpace;
    this.labelGeometry = new THREE.PlaneGeometry(
      cellSize * DOOR_LABEL_LAYOUT.widthCells,
      cellSize * DOOR_LABEL_LAYOUT.heightCells,
    );
    this.labelMaterial = new THREE.MeshBasicMaterial({
      map: this.labelTexture,
      transparent: true,
      depthTest: true,
      side: THREE.FrontSide,
    });
    const labels = doorLabelFaceTransforms(opensEastWest).map((face) => {
      const label = new THREE.Mesh(this.labelGeometry, this.labelMaterial);
      label.position.set(face.x, face.y, face.z);
      label.rotation.y = face.rotationY;
      return label;
    });

    this.group.position.set((def.x + 0.5) * cellSize, 0, (def.y + 0.5) * cellSize);
    this.group.add(this.mesh, ...labels);
    this.update(false, false);
  }

  update(open: boolean, lockdown = false): void {
    this.mesh.visible = !open;
    const presentation = selectDoorAccessPresentation(this.kind, open, lockdown);
    if (presentation.state === this.currentState) {
      return;
    }
    this.currentState = presentation.state;
    this.drawLabel(presentation);
  }

  private drawLabel(presentation: DoorAccessPresentation): void {
    const ctx = this.labelContext;
    const tone =
      presentation.tone === 'alarm'
        ? PALETTE.alarm
        : presentation.tone === 'clearance'
          ? PALETTE.amber
          : PALETTE.text;

    ctx.clearRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT);
    ctx.fillStyle = 'rgba(14, 17, 22, 0.94)';
    ctx.fillRect(4, 4, LABEL_WIDTH - 8, LABEL_HEIGHT - 8);
    ctx.strokeStyle = PALETTE.text;
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, LABEL_WIDTH - 8, LABEL_HEIGHT - 8);

    ctx.fillStyle = PALETTE.text;
    ctx.font = '600 52px "Saira Condensed", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.displayName, 18, 50, 404);

    ctx.strokeStyle = tone;
    ctx.fillStyle = tone;
    ctx.lineWidth = 7;
    ctx.beginPath();
    if (presentation.icon === 'ring') {
      ctx.arc(50, 112, 16, 0, Math.PI * 2);
      ctx.stroke();
    } else if (presentation.icon === 'square') {
      ctx.strokeRect(34, 96, 32, 32);
    } else {
      ctx.moveTo(50, 92);
      ctx.lineTo(68, 130);
      ctx.lineTo(32, 130);
      ctx.closePath();
      ctx.fill();
    }

    ctx.font = '600 44px "IBM Plex Mono", monospace';
    ctx.fillText(presentation.label, 88, 112, 334);
    this.labelTexture.needsUpdate = true;
  }

  /** Releases every GPU resource owned by this panel and its canvas label. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.mesh.geometry.dispose();
    this.panelMaterial.dispose();
    this.labelGeometry.dispose();
    this.labelTexture.dispose();
    this.labelMaterial.dispose();
  }
}
