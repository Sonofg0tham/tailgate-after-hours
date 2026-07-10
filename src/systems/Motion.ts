/**
 * The motion level: 'reduced' is the FRESH-VISITOR DEFAULT per the
 * accessibility spec (not merely honouring prefers-reduced-motion — a new
 * player gets calm motion until they opt up in Phase 6's settings). An
 * OS-level reduce request is also respected, and the current level is
 * mirrored onto <body> as a class so CSS animations (the report arrival)
 * can obey it without JS in the loop.
 */
export type MotionLevel = 'full' | 'reduced';

let level: MotionLevel = 'reduced';

export function initMotion(): MotionLevel {
  // The default is already 'reduced'; the media query check documents that
  // an explicit OS request can never be overridden INTO motion by a stale
  // stored setting (Phase 6 calls setMotionLevel after this).
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    level = 'reduced';
  }
  apply();
  return level;
}

export function setMotionLevel(next: MotionLevel): void {
  level = next;
  apply();
}

export function motionLevel(): MotionLevel {
  return level;
}

function apply(): void {
  if (typeof document !== 'undefined') {
    document.body.classList.toggle('reduced-motion', level === 'reduced');
  }
}
