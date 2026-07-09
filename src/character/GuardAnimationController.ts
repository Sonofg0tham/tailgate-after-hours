import * as THREE from 'three';
import type { GuardClips } from './CharacterLoader';
import { ANIMATION } from '../config/animation';

type ClipKey = keyof GuardClips;

/** Same crossfade approach as AnimationController, three clips instead of five — guards never crouch. */
export class GuardAnimationController {
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<ClipKey, THREE.AnimationAction>;
  private current: THREE.AnimationAction;

  constructor(model: THREE.Object3D, clips: GuardClips) {
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {
      idle: this.mixer.clipAction(clips.idle),
      walk: this.mixer.clipAction(clips.walk),
      run: this.mixer.clipAction(clips.run),
    };
    for (const action of Object.values(this.actions)) {
      action.play();
      action.enabled = true;
      action.setEffectiveWeight(0);
    }
    this.current = this.actions.idle;
    this.current.setEffectiveWeight(1);
  }

  setState(key: ClipKey): void {
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
}
