import { MISSION } from '../config/mission';

export type MissionPhase = 'infiltrating' | 'exfilled' | 'dawn';

/**
 * Everything about the mission's progress the simulation needs to reproduce
 * exactly — the mission equivalent of PlayerState/GuardState/BoltState.
 * Deliberately flat, plain-data, JSON-serialisable, so it lives inside
 * HuntState and threads through stepHunt/replay unchanged: a recorded run
 * replays to the same plant time, the same checkpoint, the same rating.
 *
 * The report and the four-rating decision are pure functions of this object
 * (plus the mission config) — that is what makes "the report matches the
 * event log exactly" and "determinism over the full mission" both true by
 * construction rather than by a parallel side-channel counter.
 */
export interface MissionState {
  phase: MissionPhase;

  /** The objective the current interact-hold is against (plant or a photo id), or null when not holding. */
  holdObjectiveId: string | null;
  /** Milliseconds accumulated on the current hold. Resets to 0 on any interruption (Tailgate never banks progress). */
  holdProgressMs: number;

  /** Elapsed sim ms when the device was planted, or null if not yet planted. */
  plantedAtMs: number | null;
  /** Photo id -> elapsed sim ms when completed, or null. Pre-seeded with every configured photo so the report iterates deterministically. */
  photos: Record<string, number | null>;

  /** Last checkpoint position (world coords), or null before the first is reached. Detain restarts here. */
  checkpoint: { x: number; z: number } | null;
  /** Elapsed sim ms the player first crossed onto the floor proper (the first checkpoint), or null. */
  enteredFloorAtMs: number | null;

  /** Times the player has been detained this run. Preserved across a checkpoint restart. */
  detains: number;
  /** True once any guard has reached ALERT (a full spot) at least once — the PROFESSIONAL trigger. */
  everSpotted: boolean;
  /** Highest building alert level reached this run — the NOISY trigger. */
  maxAlertLevel: 0 | 1 | 2;
  /** Bolts thrown this run (a LOW report finding). */
  boltsThrown: number;

  /** Which ingress door the player first came through, or null. */
  ingressRoute: string | null;
  /** Elapsed sim ms of that first ingress, or null. */
  ingressAtMs: number | null;

  /** Elapsed sim ms at exfil (mission end), or null. */
  exfilledAtMs: number | null;
}

export function createMissionState(): MissionState {
  return {
    phase: 'infiltrating',
    holdObjectiveId: null,
    holdProgressMs: 0,
    plantedAtMs: null,
    photos: Object.fromEntries(MISSION.photos.map((p) => [p.id, null])),
    checkpoint: null,
    enteredFloorAtMs: null,
    detains: 0,
    everSpotted: false,
    maxAlertLevel: 0,
    boltsThrown: 0,
    ingressRoute: null,
    ingressAtMs: null,
    exfilledAtMs: null,
  };
}
