import * as THREE from 'three';
import type { SpeedState } from '../input/InputState';
import type { CharacterClips } from './CharacterLoader';
import { ANIMATION } from '../config/animation';

type ClipKey = keyof CharacterClips;

/**
 * Drives the five loaded clips through one AnimationMixer, crossfading
 * between them as the player's speed and crouch state change. Which clip
 * plays is a pure function of (speed, crouched):
 *
 * | speed | crouched | clip       |
 * | ----- | -------- | ---------- |
 * | idle  | false    | idle       |
 * | idle  | true     | crouchIdle |
 * | creep | (always) | crouchWalk |
 * | walk  | *        | walk       |
 * | run   | *        | run        |
 *
 * `creep` always implies crouched by construction (see InputState.ts), and
 * `walk`/`run` ignore the crouch flag — there is no crouch-run clip.
 */
export class AnimationController {
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<ClipKey, THREE.AnimationAction>;
  private current: THREE.AnimationAction;

  constructor(model: THREE.Object3D, clips: CharacterClips) {
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {
      idle: this.mixer.clipAction(clips.idle),
      walk: this.mixer.clipAction(clips.walk),
      run: this.mixer.clipAction(clips.run),
      crouchIdle: this.mixer.clipAction(clips.crouchIdle),
      crouchWalk: this.mixer.clipAction(clips.crouchWalk),
    };
    for (const action of Object.values(this.actions)) {
      action.play();
      action.enabled = true;
      action.setEffectiveWeight(0);
    }
    this.current = this.actions.idle;
    this.current.setEffectiveWeight(1);
  }

  setState(speed: SpeedState, crouched: boolean): void {
    const key = AnimationController.clipFor(speed, crouched);
    const target = this.actions[key];

    if (target !== this.current) {
      target.reset();
      target.play();
      this.current.crossFadeTo(target, ANIMATION.crossfadeSeconds, false);
      this.current = target;
    }
  }

  update(deltaSeconds: number): void {
    this.mixer.update(deltaSeconds);
  }

  static clipFor(speed: SpeedState, crouched: boolean): ClipKey {
    if (speed === 'run') return 'run';
    if (speed === 'walk') return 'walk';
    if (speed === 'creep') return 'crouchWalk';
    return crouched ? 'crouchIdle' : 'idle';
  }
}
