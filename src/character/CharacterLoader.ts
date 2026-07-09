import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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

const loader = new GLTFLoader();

function loadGltf(url: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

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
    loadGltf('/models/rogue_hooded.glb'),
    loadGltf('/models/rig_medium_general.glb'),
    loadGltf('/models/rig_medium_movementbasic.glb'),
    loadGltf('/models/rig_medium_movementadvanced.glb'),
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
