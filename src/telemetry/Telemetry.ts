import { LIGHTING } from '../config/lighting';
import type { GuardEvent } from '../entities/GuardStateMachine';

export interface TelemetrySummary {
  runtimeSeconds: number;
  detections: number;
  nearMisses: number;
  timeInLightSeconds: number;
  chaseEscapes: number;
  detains: number;
  ingressRoutesUsed: string[];
  tailgatesAttempted: number;
  tailgatesClean: number;
  tailgatesSeen: number;
  boltsThrown: number;
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
  private timeInLightSeconds = 0;
  private chaseEscapes = 0;
  private detains = 0;
  private readonly ingressRoutesUsed = new Set<string>();
  private tailgatesAttempted = 0;
  private tailgatesClean = 0;
  private tailgatesSeen = 0;
  private boltsThrown = 0;
  private readonly log: string[] = [];

  recordTick(dtSeconds: number, playerLightLevel: number): void {
    this.runtimeSeconds += dtSeconds;
    if (playerLightLevel > LIGHTING.ambientLevel + 0.01) {
      this.timeInLightSeconds += dtSeconds;
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
        this.log.push(this.timestamp() + `DETAIN — ${event.guardId} caught the player`);
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
      timeInLightSeconds: this.timeInLightSeconds,
      chaseEscapes: this.chaseEscapes,
      detains: this.detains,
      ingressRoutesUsed: [...this.ingressRoutesUsed],
      tailgatesAttempted: this.tailgatesAttempted,
      tailgatesClean: this.tailgatesClean,
      tailgatesSeen: this.tailgatesSeen,
      boltsThrown: this.boltsThrown,
    };
  }

  /** A plain-text worksheet, dumpable to a file or pasted into the PR. */
  toWorksheet(): string {
    const s = this.summary();
    const litPercent = s.runtimeSeconds > 0 ? (s.timeInLightSeconds / s.runtimeSeconds) * 100 : 0;
    return [
      '# Telemetry worksheet',
      '',
      `Runtime: ${s.runtimeSeconds.toFixed(1)}s`,
      `Detections: ${s.detections}`,
      `Near-misses: ${s.nearMisses}`,
      `Chase escapes: ${s.chaseEscapes}`,
      `Detains: ${s.detains}`,
      `Time in light: ${s.timeInLightSeconds.toFixed(1)}s (${litPercent.toFixed(0)}%)`,
      `Ingress routes used: ${s.ingressRoutesUsed.length > 0 ? s.ingressRoutesUsed.join(', ') : '(none)'}`,
      `Tailgates: ${s.tailgatesAttempted} attempted (${s.tailgatesClean} clean, ${s.tailgatesSeen} seen)`,
      `Bolts thrown: ${s.boltsThrown}`,
      '',
      '## Event log',
      ...(this.log.length > 0 ? this.log : ['(no events)']),
    ].join('\n');
  }

  private timestamp(): string {
    return `[${this.runtimeSeconds.toFixed(1)}s] `;
  }
}
