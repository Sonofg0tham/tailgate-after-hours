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
const LABEL_WIDTH = 512;
const LABEL_HEIGHT = 192;

/**
 * Compact overhead sign proportions. The label straddles the top edge of
 * the 2.4 m door face, low enough to stay fully inside the default camera's
 * spawn view while leaving the three lobby signs visually separate.
 */
export const DOOR_LABEL_LAYOUT = Object.freeze({
  widthCells: 1.3,
  heightCells: 1.3 * (LABEL_HEIGHT / LABEL_WIDTH),
  centreY: PANEL_HEIGHT,
});

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
  private readonly labelMaterial: THREE.SpriteMaterial;
  private readonly labelContext: CanvasRenderingContext2D;
  private currentState: DoorAccessState | null = null;
  private disposed = false;

  constructor(def: DoorKindDef, opensEastWest: boolean, cellSize: number) {
    this.kind = def.kind;
    this.displayName = def.displayName;
    const width = opensEastWest ? PANEL_THICKNESS : cellSize * 0.92;
    const depth = opensEastWest ? cellSize * 0.92 : PANEL_THICKNESS;
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
    this.labelMaterial = new THREE.SpriteMaterial({ map: this.labelTexture, transparent: true, depthTest: true });
    const label = new THREE.Sprite(this.labelMaterial);
    label.position.set(0, DOOR_LABEL_LAYOUT.centreY, 0);
    label.scale.set(
      cellSize * DOOR_LABEL_LAYOUT.widthCells,
      cellSize * DOOR_LABEL_LAYOUT.heightCells,
      1,
    );

    this.group.position.set((def.x + 0.5) * cellSize, 0, (def.y + 0.5) * cellSize);
    this.group.add(this.mesh, label);
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
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, LABEL_WIDTH - 8, LABEL_HEIGHT - 8);

    ctx.fillStyle = PALETTE.text;
    ctx.font = '600 40px "Saira Condensed", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.displayName, 28, 55);

    ctx.strokeStyle = tone;
    ctx.fillStyle = tone;
    ctx.lineWidth = 8;
    ctx.beginPath();
    if (presentation.icon === 'ring') {
      ctx.arc(59, 132, 20, 0, Math.PI * 2);
      ctx.stroke();
    } else if (presentation.icon === 'square') {
      ctx.strokeRect(39, 112, 40, 40);
    } else {
      ctx.moveTo(59, 108);
      ctx.lineTo(83, 152);
      ctx.lineTo(35, 152);
      ctx.closePath();
      ctx.fill();
    }

    ctx.font = '600 38px "IBM Plex Mono", monospace';
    ctx.fillText(presentation.label, 105, 133);
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
    this.labelTexture.dispose();
    this.labelMaterial.dispose();
  }
}
