import type { GuardStateName } from '../entities/GuardState';

export type IndicatorGuardState = Exclude<GuardStateName, 'patrol'>;
export type GuardIndicatorTone = 'investigation' | 'alert';

export interface GuardIndicatorProjectionInput {
  id: string;
  state: GuardStateName;
  ndcX: number;
  ndcY: number;
  behindCamera: boolean;
  viewportWidth: number;
  viewportHeight: number;
  safeInsetX: number;
  safeInsetY: number;
}

export interface GuardIndicatorPresentation {
  id: string;
  state: IndicatorGuardState;
  label: string;
  tone: GuardIndicatorTone;
  xPx: number;
  yPx: number;
  angleDegrees: number;
}

const INDICATOR_STATES: ReadonlySet<GuardStateName> = new Set(['curious', 'searching', 'sweep', 'alert']);

function isIndicatorState(state: GuardStateName): state is IndicatorGuardState {
  return INDICATOR_STATES.has(state);
}

/**
 * Selects eligible off-screen guards and intersects their direction with a
 * CSS-pixel safe rectangle. Three.js projection stays in main; this maths is
 * pure so behind-camera and degenerate directions are deterministic.
 */
export function projectGuardIndicator(input: GuardIndicatorProjectionInput): GuardIndicatorPresentation | null {
  if (!isIndicatorState(input.state)) {
    return null;
  }

  const ndcX = Number.isFinite(input.ndcX) ? input.ndcX : 0;
  const ndcY = Number.isFinite(input.ndcY) ? input.ndcY : 0;
  if (!input.behindCamera && Math.abs(ndcX) <= 1 && Math.abs(ndcY) <= 1) {
    return null;
  }

  let directionX = input.behindCamera ? -ndcX : ndcX;
  let directionY = input.behindCamera ? ndcY : -ndcY;
  if (Math.hypot(directionX, directionY) < Number.EPSILON) {
    directionX = 0;
    directionY = -1;
  }

  const width = Math.max(1, input.viewportWidth);
  const height = Math.max(1, input.viewportHeight);
  const centreX = width / 2;
  const centreY = height / 2;
  const halfSafeWidth = Math.max(0, centreX - Math.max(0, input.safeInsetX));
  const halfSafeHeight = Math.max(0, centreY - Math.max(0, input.safeInsetY));
  const xScale = directionX === 0 ? Infinity : halfSafeWidth / Math.abs(directionX);
  const yScale = directionY === 0 ? Infinity : halfSafeHeight / Math.abs(directionY);
  const edgeScale = Math.min(xScale, yScale);
  const xPx = centreX + directionX * edgeScale;
  const yPx = centreY + directionY * edgeScale;
  const rawAngle = (Math.atan2(directionY, directionX) * 180) / Math.PI;
  const angleDegrees = Object.is(rawAngle, -0) ? 0 : Object.is(rawAngle, -180) ? 180 : rawAngle;

  return {
    id: input.id,
    state: input.state,
    label: `GUARD · ${input.state.toUpperCase()}`,
    tone: input.state === 'alert' ? 'alert' : 'investigation',
    xPx,
    yPx,
    angleDegrees,
  };
}

interface IndicatorElement {
  textContent: string | null;
  hidden: boolean;
  dataset: DOMStringMap;
  style: Pick<CSSStyleDeclaration, 'setProperty'>;
  setAttribute(name: string, value: string): void;
}

export interface GuardIndicatorElements {
  root: IndicatorElement;
  label: IndicatorElement;
  chevron: IndicatorElement;
}

/** Applies projected models to fixed DOM slots created once at startup. */
export class GuardIndicatorPresenter {
  constructor(private readonly elements: readonly GuardIndicatorElements[]) {}

  render(models: readonly (GuardIndicatorPresentation | null)[]): void {
    for (let i = 0; i < this.elements.length; i++) {
      const element = this.elements[i];
      const model = models[i] ?? null;
      element.root.hidden = model === null;
      element.root.setAttribute('aria-hidden', model === null ? 'true' : 'false');
      if (!model) {
        continue;
      }

      element.root.dataset.guardState = model.state;
      element.root.dataset.tone = model.tone;
      element.root.style.setProperty('--guard-x', `${model.xPx}px`);
      element.root.style.setProperty('--guard-y', `${model.yPx}px`);
      element.label.textContent = model.label;
      element.chevron.style.setProperty('--guard-angle', `${model.angleDegrees}deg`);
    }
  }
}
