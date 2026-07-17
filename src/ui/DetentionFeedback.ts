import type { DetainCause } from '../entities/GuardStateMachine';

/** Compile-time exhaustive copy table for every deterministic detain cause. */
export const DETENTION_MESSAGES: Readonly<Record<DetainCause, string>> = Object.freeze({
  chase: 'Caught during an active chase.',
  'seen-contact': 'Seen at close range.',
  'guard-contact': 'Moved into a guard at close range.',
});

export function detentionMessageFor(cause: DetainCause): string {
  return DETENTION_MESSAGES[cause];
}
