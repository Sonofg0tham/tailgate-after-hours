/**
 * The motion level: 'reduced' is the FRESH-VISITOR DEFAULT per the
 * accessibility spec (not merely honouring prefers-reduced-motion, a new
 * player gets calm motion until they opt up in Phase 6's settings). An
 * OS-level reduce request is also respected, and the current level is
 * mirrored onto <body> as a class so CSS animations (the report arrival)
 * can obey it without JS in the loop.
 */
export type MotionLevel = 'full' | 'reduced';

let requestedLevel: MotionLevel = 'reduced';
let osReducedMotion = false;
let preferenceQuery: MediaQueryList | null = null;

function handlePreferenceChange(event: MediaQueryListEvent): void {
  osReducedMotion = event.matches;
  apply();
}

export function initMotion(): MotionLevel {
  preferenceQuery?.removeEventListener('change', handlePreferenceChange);
  preferenceQuery = null;
  osReducedMotion = false;

  if (typeof matchMedia === 'function') {
    preferenceQuery = matchMedia('(prefers-reduced-motion: reduce)');
    osReducedMotion = preferenceQuery.matches;
    preferenceQuery.addEventListener('change', handlePreferenceChange);
  }
  apply();
  return motionLevel();
}

export function setMotionLevel(next: MotionLevel): void {
  requestedLevel = next;
  apply();
}

export function motionLevel(): MotionLevel {
  return osReducedMotion ? 'reduced' : requestedLevel;
}

function apply(): void {
  if (typeof document !== 'undefined') {
    document.body.classList.toggle('reduced-motion', motionLevel() === 'reduced');
  }
}
