import { LIGHTING } from '../config/lighting';
import { stampClock } from '../systems/NightClock';
import type { GuardEvent } from '../entities/GuardStateMachine';
import type { MissionState } from '../sim/MissionState';
import type { Rating } from '../report/rating';

export interface ObjectiveTimestamp {
  label: string;
  atMs: number;
}

/** Read-only facts observed during one hunt tick. These never enter HuntState. */
export interface TelemetryTickObservation {
  /** True when one or more guards had direct line of sight during this tick. */
  anyGuardCanSeePlayer: boolean;
  /** The closed dynamic door currently being waited on, or null. */
  closedDoorWaitTarget: { doorId: string; displayName: string } | null;
}

export interface TelemetryDoorDefinition {
  id: string;
  displayName: string;
}

export interface TelemetrySummary {
  runtimeSeconds: number;
  detections: number;
  nearMisses: number;
  /** Seconds where at least one guard had direct line of sight. Each tick counts once. */
  coneExposureSeconds: number;
  timeInLightSeconds: number;
  chaseEscapes: number;
  detains: number;
  /** Wait seconds grouped by stable dynamic-door ID. */
  doorWaitSecondsByDoorId: Record<string, number>;
  ingressRoutesUsed: string[];
  tailgatesAttempted: number;
  tailgatesClean: number;
  tailgatesSeen: number;
  boltsThrown: number;
  /** The engagement rating, once the mission has ended, else null. */
  rating: Rating | null;
  /** Successful GHOST exfil duration from first ingress to exfil, otherwise null. */
  cleanRunTimeSeconds: number | null;
  /** The mission's actual first ingress route, once the mission has ended, else null. */
  ingressRoute: string | null;
  /** IDs of completed photo objectives, ordered by completion time. */
  completedSecondaryIds: string[];
  /** Mission end minus first ingress, with zero used only when no ingress occurred. */
  timeOnSiteSeconds: number | null;
  /** Per-objective completion times, in chronological order. */
  objectiveTimestamps: ObjectiveTimestamp[];
}

/**
 * Per-run event recording for the telemetry worksheet GAME_DESIGN.md's
 * measurement discipline calls for: "detections, near-misses (cone entries
 * that did not fill), time-in-light, chase escapes." No existing code in
 * this project or Tailgate produces this — Tailgate's runStats.ts tracks
 * different fields entirely (detains, bolts thrown, disguise timing) and
 * never dumps to a file; Patch Tuesday's console-summary scripts are the
 * closer precedent for the OUTPUT shape (a plain-text worksheet), not the
 * event categories. Built from scratch against GAME_DESIGN's own list.
 *
 * Definitions, precise because "near-miss" and "chase escape" are otherwise
 * ambiguous:
 *   detection   — a guard's stateChanged event lands on 'alert' (direct sight achieved).
 *   near-miss   — a guard drops from 'curious' straight back to 'patrol':
 *                 suspicion rose enough to notice, then fully recovered
 *                 without ever committing to a search. The lightest-touch
 *                 "the cone touched you and let go" case.
 *   chase escape — a guard drops from 'alert' to 'searching': an active
 *                 chase lost its target without a detain.
 *   time-in-light — cumulative seconds the player's cell read above pure
 *                 ambient (LIGHTING.ambientLevel), i.e. actually lit by a
 *                 placed source, not just the darkness floor.
 */
export class Telemetry {
  private runtimeSeconds = 0;
  private detections = 0;
  private nearMisses = 0;
  private coneExposureSeconds = 0;
  private timeInLightSeconds = 0;
  private chaseEscapes = 0;
  private detains = 0;
  private readonly doorWaitSecondsByDoorId = new Map<string, number>();
  private readonly doorDisplayNamesById = new Map<string, string>();
  private readonly ingressRoutesUsed = new Set<string>();
  private tailgatesAttempted = 0;
  private tailgatesClean = 0;
  private tailgatesSeen = 0;
  private boltsThrown = 0;
  private rating: Rating | null = null;
  private cleanRunTimeSeconds: number | null = null;
  private ingressRoute: string | null = null;
  private completedSecondaryIds: string[] = [];
  private timeOnSiteSeconds: number | null = null;
  private objectiveTimestamps: ObjectiveTimestamp[] = [];
  private readonly log: string[] = [];

  constructor(doors: readonly TelemetryDoorDefinition[] = []) {
    for (const door of doors) {
      this.doorWaitSecondsByDoorId.set(door.id, 0);
      this.doorDisplayNamesById.set(door.id, door.displayName);
    }
  }

  recordTick(dtSeconds: number, playerLightLevel: number, observation?: TelemetryTickObservation): void {
    this.runtimeSeconds += dtSeconds;
    if (playerLightLevel > LIGHTING.ambientLevel + 0.01) {
      this.timeInLightSeconds += dtSeconds;
    }
    if (observation?.anyGuardCanSeePlayer) {
      this.coneExposureSeconds += dtSeconds;
    }
    const waitTarget = observation?.closedDoorWaitTarget;
    if (waitTarget) {
      const previous = this.doorWaitSecondsByDoorId.get(waitTarget.doorId) ?? 0;
      this.doorWaitSecondsByDoorId.set(waitTarget.doorId, previous + dtSeconds);
      this.doorDisplayNamesById.set(waitTarget.doorId, waitTarget.displayName);
    }
  }

  /** Idempotent per route id — ported from Tailgate's runStats.recordIngress, safe to call every tick the player is standing in an open ingress door. */
  recordIngressRoute(routeId: string): void {
    if (this.ingressRoutesUsed.has(routeId)) {
      return;
    }
    this.ingressRoutesUsed.add(routeId);
    this.log.push(this.timestamp() + `INGRESS — ${routeId} route used`);
  }

  /** One crossing of the lobby badge door: clean if no guard's tailgateWitnessed event fired this tick, seen otherwise. */
  recordTailgateAttempt(witnessed: boolean): void {
    this.tailgatesAttempted++;
    if (witnessed) {
      this.tailgatesSeen++;
      this.log.push(this.timestamp() + 'TAILGATE — attempted, seen by a guard');
    } else {
      this.tailgatesClean++;
      this.log.push(this.timestamp() + 'TAILGATE — attempted, clean');
    }
  }

  recordBoltThrown(): void {
    this.boltsThrown++;
    this.log.push(this.timestamp() + 'BOLT — thrown');
  }

  /**
   * Fold the finished mission into the worksheet: the rating, the time on
   * site, and the per-objective completion times (each stamped on the night
   * clock). Read from the final MissionState, the deterministic source of
   * truth, so the worksheet agrees with the Engagement Report exactly.
   */
  recordMissionEnd(mission: MissionState, rating: Rating, endMs: number): void {
    this.rating = rating;
    this.ingressRoute = mission.ingressRoute;
    this.timeOnSiteSeconds = (endMs - (mission.ingressAtMs ?? 0)) / 1000;
    this.cleanRunTimeSeconds =
      rating === 'GHOST' &&
      mission.phase === 'exfilled' &&
      mission.ingressAtMs !== null &&
      mission.exfilledAtMs !== null
        ? (mission.exfilledAtMs - mission.ingressAtMs) / 1000
        : null;

    const stamps: ObjectiveTimestamp[] = [];
    const completedSecondaries: Array<{ id: string; atMs: number }> = [];
    if (mission.ingressAtMs !== null) {
      stamps.push({ label: `ingress (${mission.ingressRoute ?? 'unknown'})`, atMs: mission.ingressAtMs });
    }
    if (mission.plantedAtMs !== null) {
      stamps.push({ label: 'device planted', atMs: mission.plantedAtMs });
    }
    for (const [id, at] of Object.entries(mission.photos)) {
      if (at !== null) {
        stamps.push({ label: `photo (${id})`, atMs: at });
        completedSecondaries.push({ id, atMs: at });
      }
    }
    if (mission.exfilledAtMs !== null) {
      stamps.push({ label: 'exfil', atMs: mission.exfilledAtMs });
    }
    stamps.sort((a, b) => a.atMs - b.atMs);
    this.objectiveTimestamps = stamps;
    completedSecondaries.sort((a, b) => a.atMs - b.atMs || a.id.localeCompare(b.id));
    this.completedSecondaryIds = completedSecondaries.map((secondary) => secondary.id);

    this.log.push(this.timestamp() + `MISSION END: ${rating}, time on site ${this.timeOnSiteSeconds.toFixed(1)}s`);
  }

  recordEvents(events: readonly GuardEvent[]): void {
    for (const event of events) {
      if (event.type === 'stateChanged') {
        if (event.to === 'alert') {
          this.detections++;
          this.log.push(this.timestamp() + `DETECTION — ${event.guardId} spotted the player`);
        } else if (event.from === 'curious' && event.to === 'patrol') {
          this.nearMisses++;
          this.log.push(this.timestamp() + `NEAR-MISS — ${event.guardId} noticed something, suspicion recovered`);
        } else if (event.from === 'alert' && event.to === 'searching') {
          this.chaseEscapes++;
          this.log.push(this.timestamp() + `CHASE ESCAPE — ${event.guardId} lost the player`);
        }
      } else if (event.type === 'detain') {
        this.detains++;
        this.log.push(this.timestamp() + `DETAIN: ${event.guardId} caught the player (cause: ${event.cause})`);
      } else if (event.type === 'radioCall') {
        this.log.push(this.timestamp() + `RADIO — ${event.guardId} called it in`);
      }
    }
  }

  summary(): TelemetrySummary {
    return {
      runtimeSeconds: this.runtimeSeconds,
      detections: this.detections,
      nearMisses: this.nearMisses,
      coneExposureSeconds: this.coneExposureSeconds,
      timeInLightSeconds: this.timeInLightSeconds,
      chaseEscapes: this.chaseEscapes,
      detains: this.detains,
      doorWaitSecondsByDoorId: Object.fromEntries(this.doorWaitSecondsByDoorId),
      ingressRoutesUsed: [...this.ingressRoutesUsed],
      tailgatesAttempted: this.tailgatesAttempted,
      tailgatesClean: this.tailgatesClean,
      tailgatesSeen: this.tailgatesSeen,
      boltsThrown: this.boltsThrown,
      rating: this.rating,
      cleanRunTimeSeconds: this.cleanRunTimeSeconds,
      ingressRoute: this.ingressRoute,
      completedSecondaryIds: [...this.completedSecondaryIds],
      timeOnSiteSeconds: this.timeOnSiteSeconds,
      objectiveTimestamps: [...this.objectiveTimestamps],
    };
  }

  /** A plain-text worksheet, dumpable to a file or pasted into the PR. */
  toWorksheet(): string {
    const s = this.summary();
    const litPercent = s.runtimeSeconds > 0 ? (s.timeInLightSeconds / s.runtimeSeconds) * 100 : 0;
    const conePercent = s.runtimeSeconds > 0 ? (s.coneExposureSeconds / s.runtimeSeconds) * 100 : 0;
    const doorWaitLines = Object.entries(s.doorWaitSecondsByDoorId)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([doorId, seconds]) => `${this.doorDisplayNamesById.get(doorId) ?? doorId} [${doorId}]: ${seconds.toFixed(1)}s`);
    return [
      '# Telemetry worksheet',
      '',
      `Runtime: ${s.runtimeSeconds.toFixed(1)}s`,
      `Clean-run time: ${s.cleanRunTimeSeconds !== null ? s.cleanRunTimeSeconds.toFixed(1) + 's' : '(not a clean GHOST exfil)'}`,
      `Actual ingress route: ${s.ingressRoute ?? '(none)'}`,
      `Detections: ${s.detections}`,
      `Near-misses: ${s.nearMisses}`,
      `Cone exposure: ${s.coneExposureSeconds.toFixed(1)}s (${conePercent.toFixed(0)}%)`,
      `Chase escapes: ${s.chaseEscapes}`,
      `Detentions: ${s.detains}`,
      `Time in light: ${s.timeInLightSeconds.toFixed(1)}s (${litPercent.toFixed(0)}%)`,
      `Ingress routes used: ${s.ingressRoutesUsed.length > 0 ? s.ingressRoutesUsed.join(', ') : '(none)'}`,
      `Tailgates: ${s.tailgatesAttempted} attempted (${s.tailgatesClean} clean, ${s.tailgatesSeen} seen)`,
      `Bolts thrown: ${s.boltsThrown}`,
      `Completed secondaries: ${s.completedSecondaryIds.length > 0 ? s.completedSecondaryIds.join(', ') : '(none)'}`,
      `Rating: ${s.rating ?? '(mission in progress)'}`,
      `Time on site: ${s.timeOnSiteSeconds !== null ? s.timeOnSiteSeconds.toFixed(1) + 's' : '(mission in progress)'}`,
      '',
      '## Door waits',
      ...(doorWaitLines.length > 0 ? doorWaitLines : ['(none)']),
      '',
      '## Objective timeline',
      ...(s.objectiveTimestamps.length > 0
        ? s.objectiveTimestamps.map((o) => `${stampClock(o.atMs)}  ${o.label}`)
        : ['(no objectives completed)']),
      '',
      '## Event log',
      ...(this.log.length > 0 ? this.log : ['(no events)']),
      '',
      '## Measurement definitions',
      'Clean-run time: successful GHOST exfils only, measured from first ingress to exfil.',
      'Cone exposure: active simulation seconds where one or more guards had direct line of sight. Each tick counts once; percentage uses active runtime.',
      'Door wait: active simulation seconds where movement was attempted and the post-collision player centre was within one level cell size of a closed dynamic door. This is a measurement radius only and does not change collision or door behaviour.',
      'Time on site: mission end minus first ingress, using zero as the start only when ingress never occurred.',
    ].join('\n');
  }

  private timestamp(): string {
    return `[${this.runtimeSeconds.toFixed(1)}s] `;
  }
}
