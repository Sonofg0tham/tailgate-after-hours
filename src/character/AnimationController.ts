import * as THREE from 'three';
import type { SpeedState } from '../input/InputState';
import type { CharacterClips } from './CharacterLoader';

const CROSSFADE_SECONDS = 0.25;

/**
 * Drives the three loaded clips through one AnimationMixer, crossfading
 * between them as the player's speed state changes. This is the piece
 * GAME_DESIGN.md's Phase -1 is really about proving.
 *
 * The spike only has idle/walk/run clips (see CREDITS.md for why crouch was
 * left for Phase 1), so 'creep' visually reuses the walk clip at a reduced
 * timescale rather than a true crouch-walk animation — a known placeholder,
 * not the finished feel.
 */
export class AnimationController {
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<'idle' | 'walk' | 'run', THREE.AnimationAction>;
  private current: THREE.AnimationAction;

  constructor(model: THREE.Object3D, clips: CharacterClips) {
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {
      idle: this.mixer.clipAction(clips.idle),
      walk: this.mixer.clipAction(clips.walk),
      run: this.mixer.clipAction(clips.run),
    };
    for (const action of Object.values(this.actions)) {
      action.play();
    }
    this.current = this.actions.idle;
    this.setWeights(this.actions.idle, 1);
  }

  setSpeed(speed: SpeedState): void {
    const target =
      speed === 'run' ? this.actions.run : speed === 'walk' || speed === 'creep' ? this.actions.walk : this.actions.idle;
    target.timeScale = speed === 'creep' ? 0.6 : 1;

    if (target !== this.current) {
      target.reset();
      target.play();
      this.current.crossFadeTo(target, CROSSFADE_SECONDS, false);
      this.current = target;
    }
  }

  update(deltaSeconds: number): void {
    this.mixer.update(deltaSeconds);
  }

  private setWeights(action: THREE.AnimationAction, weight: number): void {
    action.enabled = true;
    action.setEffectiveWeight(weight);
  }
}
