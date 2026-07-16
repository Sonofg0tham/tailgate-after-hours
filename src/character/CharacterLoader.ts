import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

/** The five clips the game blends between. Names match KayKit's Rig_Medium library exactly. */
export interface CharacterClips {
  idle: THREE.AnimationClip;
  walk: THREE.AnimationClip;
  run: THREE.AnimationClip;
  crouchIdle: THREE.AnimationClip;
  crouchWalk: THREE.AnimationClip;
}

export interface LoadedCharacter {
  model: THREE.Object3D;
  clips: CharacterClips;
}

/** The three clips a guard needs — no crouch, guards never creep. */
export interface GuardClips {
  idle: THREE.AnimationClip;
  walk: THREE.AnimationClip;
  run: THREE.AnimationClip;
}

export interface LoadedGuardCharacter {
  model: THREE.Object3D;
  clips: GuardClips;
}

/** The two clips a cleaner needs — no run, no crouch, cleaners never hurry. */
export interface StaffClips {
  idle: THREE.AnimationClip;
  walk: THREE.AnimationClip;
}

export interface LoadedStaffCharacter {
  model: THREE.Object3D;
  clips: StaffClips;
}

const loader = new GLTFLoader();

export interface GltfAsset {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

type GltfSourceLoader = (url: string) => Promise<GltfAsset>;
type SceneCloner = (scene: THREE.Group) => THREE.Group;

function loadGltfSource(url: string): Promise<GltfAsset> {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

/** Shares each GLB parse while still handing every animated entity its own rig. */
export class GltfAssetCache {
  private readonly sources = new Map<string, Promise<GltfAsset>>();

  constructor(
    private readonly sourceLoader: GltfSourceLoader = loadGltfSource,
    private readonly sceneCloner: SceneCloner = (scene) => cloneSkeleton(scene) as THREE.Group,
  ) {}

  load(url: string): Promise<GltfAsset> {
    const cached = this.sources.get(url);
    if (cached) {
      return cached;
    }
    const pending = this.sourceLoader(url).catch((error: unknown) => {
      this.sources.delete(url);
      throw error;
    });
    this.sources.set(url, pending);
    return pending;
  }

  async instantiate(url: string): Promise<GltfAsset> {
    const source = await this.load(url);
    return { scene: this.sceneCloner(source.scene), animations: source.animations };
  }
}

const assets = new GltfAssetCache();

function findClip(clips: THREE.AnimationClip[], name: string): THREE.AnimationClip {
  const clip = THREE.AnimationClip.findByName(clips, name);
  if (!clip) {
    throw new Error(`Animation clip "${name}" not found (looked in [${clips.map((c) => c.name).join(', ')}])`);
  }
  return clip;
}

/**
 * Loads the CC0 body plus the three KayKit animation-library files it shares
 * a skeleton with, and pulls out the five named clips the game blends
 * between. Because all four files use the same "Rig_Medium" bone names, the
 * clips bind straight onto the body's skeleton with no retargeting step —
 * see CREDITS.md for why this sidesteps Mixamo entirely.
 */
export async function loadCharacter(): Promise<LoadedCharacter> {
  const [body, general, movementBasic, movementAdvanced] = await Promise.all([
    assets.instantiate('/models/rogue_hooded.glb'),
    assets.load('/models/rig_medium_general.glb'),
    assets.load('/models/rig_medium_movementbasic.glb'),
    assets.load('/models/rig_medium_movementadvanced.glb'),
  ]);

  return {
    model: body.scene,
    clips: {
      idle: findClip(general.animations, 'Idle_A'),
      walk: findClip(movementBasic.animations, 'Walking_A'),
      run: findClip(movementBasic.animations, 'Running_A'),
      crouchIdle: findClip(movementAdvanced.animations, 'Crouching'),
      crouchWalk: findClip(movementAdvanced.animations, 'Sneaking'),
    },
  };
}

/**
 * Loads a guard: a different KayKit Adventurers body (Knight — already
 * covered by the same pack licence, see CREDITS.md) on the same Rig_Medium
 * skeleton, sharing idle/walk/run with the player. "Look-around" isn't a
 * clip — like Tailgate's original guard, it's the idle pose with facing
 * driven procedurally by the state machine (see GuardStateMachine.ts).
 */
export async function loadGuardCharacter(): Promise<LoadedGuardCharacter> {
  const [body, general, movementBasic] = await Promise.all([
    assets.instantiate('/models/knight.glb'),
    assets.load('/models/rig_medium_general.glb'),
    assets.load('/models/rig_medium_movementbasic.glb'),
  ]);

  return {
    model: body.scene,
    clips: {
      idle: findClip(general.animations, 'Idle_A'),
      walk: findClip(movementBasic.animations, 'Walking_A'),
      run: findClip(movementBasic.animations, 'Running_A'),
    },
  };
}

/**
 * Loads a cleaner. PLACEHOLDER: reuses the player's own rogue_hooded.glb
 * body rather than a distinct civilian model — no third KayKit Adventurers
 * character has been sourced for this greybox pass, so a cleaner is
 * currently visually identical to the player at a glance (flagged in the
 * Phase 3 PR; a real civilian body is a follow-up asset pull, same pack,
 * same licence, no new gate needed). Idle/walk only — cleaners never run.
 */
export async function loadStaffCharacter(): Promise<LoadedStaffCharacter> {
  const [body, general, movementBasic] = await Promise.all([
    assets.instantiate('/models/rogue_hooded.glb'),
    assets.load('/models/rig_medium_general.glb'),
    assets.load('/models/rig_medium_movementbasic.glb'),
  ]);

  return {
    model: body.scene,
    clips: {
      idle: findClip(general.animations, 'Idle_A'),
      walk: findClip(movementBasic.animations, 'Walking_A'),
    },
  };
}
