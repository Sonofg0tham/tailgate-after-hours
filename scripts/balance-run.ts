// Balance worksheet, final edition: drive full missions through the REAL sim
// with both guards and both cleaners active, and worksheet what happens.
// The driver is a naive pathfinding follower with no stealth sense — it
// walks the direct route, waits at shut doors, and takes whatever the guards
// dish out (detains restart it at the checkpoint, which is the system under
// test). Numbers, not tuning: per CLAUDE.md, feel verdicts are Craig's.
// Run: npx vite-node scripts/balance-run.ts
import { parseLevel, type LevelData } from '../src/world/level';
import { extrudeLevel } from '../src/world/Extruder';
import { buildLightGrid } from '../src/systems/LightModel';
import { createDoorState, doorOpenLookup } from '../src/systems/DoorState';
import { findPath } from '../src/systems/Pathfinding';
import { hasLineOfSight } from '../src/systems/Vision';
import { stepHunt, type HuntEnvironment, type HuntState } from '../src/sim/stepHunt';
import { createMissionState } from '../src/sim/MissionState';
import { createGuardState, type GuardsData } from '../src/entities/GuardState';
import { createStaffState, type StaffData } from '../src/entities/StaffState';
import { decideRating } from '../src/report/rating';
import { generateReport } from '../src/report/generateReport';
import { MISSION } from '../src/config/mission';
import type { MovementIntent } from '../src/input/InputState';
import type { GuardEvent } from '../src/entities/GuardStateMachine';
import floor12 from '../src/data/floor12.json';
import guardsData from '../src/data/guards.json';
import staffData from '../src/data/staff.json';

const level = parseLevel(floor12 as LevelData);
const extruded = extrudeLevel(level);
const STEP = 1 / 60;
const IDLE: MovementIntent = { directionX: 0, directionZ: 0, speed: 'idle', crouched: false, device: 'none' };
const MAX_TICKS = 46_000; // comfortably past dawn (43,200 ticks), so a run can time out naturally

function makeEnv(guardSpeedScale?: number): HuntEnvironment {
  const guards = (guardsData as GuardsData).guards;
  return {
    level,
    lightGrid: buildLightGrid(level),
    wallBounds: extruded.wallBounds,
    routes: guards.map((g) => g.route),
    guardRoutes: guards,
    staffRoutes: (staffData as StaffData).staff,
    guardSpeedScale,
  };
}

function freshState(): HuntState {
  return {
    player: { x: 3.5, z: 12.5, facingYaw: 0 },
    guards: (guardsData as GuardsData).guards.map(createGuardState),
    alertLevel: { level: 0, msSinceIncident: 0 },
    simTimeMs: 0,
    doors: level.doors.map(createDoorState),
    staff: (staffData as StaffData).staff.map(createStaffState),
    bolts: [],
    mission: createMissionState(),
  };
}

function steer(state: HuntState, tx: number, tz: number, speed: 'walk' | 'creep'): MovementIntent {
  const dx = tx - state.player.x;
  const dz = tz - state.player.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return IDLE;
  return { directionX: dx / d, directionZ: dz / d, speed, crouched: speed === 'creep', device: 'keyboard' };
}

function driveTo(state: HuntState, stand: { x: number; y: number }, px: number, pz: number, speed: 'walk' | 'creep'): MovementIntent {
  const overrides = doorOpenLookup(level, state.doors, state.simTimeMs, state.alertLevel.level >= 2);
  const path = findPath(level, { x: Math.floor(state.player.x), y: Math.floor(state.player.z) }, stand, overrides);
  if (!path) return IDLE;
  if (path.length >= 2) return steer(state, path[1].x + 0.5, path[1].y + 0.5, speed);
  return steer(state, px, pz, speed);
}

function driveToPoint(state: HuntState, px: number, pz: number, speed: 'walk' | 'creep'): MovementIntent {
  return driveTo(state, { x: Math.floor(px), y: Math.floor(pz) }, px, pz, speed);
}

interface RunResult {
  label: string;
  outcome: string;
  rating: string;
  timeOnSite: string;
  ingress: string;
  plantedAtClockMin: number | null;
  detections: number;
  nearMisses: number;
  detains: number;
  maxAlert: number;
  ticks: number;
}

function runMission(
  label: string,
  startIdleTicks: number,
  speed: 'walk' | 'creep',
  guardSpeedScale?: number,
  cautious = true,
): RunResult {
  const env = makeEnv(guardSpeedScale);
  let state = freshState();
  let detections = 0;
  let nearMisses = 0;

  let i = 0;
  for (; i < MAX_TICKS && state.mission.phase === 'infiltrating'; i++) {
    let intent: MovementIntent = IDLE;
    let interactHeld = false;
    if (i >= startIdleTicks) {
      // Minimal caution, not stealth: back off a guard in your face, hold
      // while one is close, otherwise walk the direct route. A no-caution
      // bot beelines through patrols and measures nothing but the detain loop.
      let nearestGuardDist = Infinity;
      let nearestGuard = state.guards[0];
      for (const g of state.guards) {
        const d = Math.hypot(g.x - state.player.x, g.z - state.player.z);
        if (d < nearestGuardDist) {
          nearestGuardDist = d;
          nearestGuard = g;
        }
      }
      // Facing-aware caution: a guard walking away is safe to tail (any
      // player learns this in minutes; a 5m distance-only rule deadlocks in
      // a 2m corridor). Threat = visible, near, and facing roughly at us.
      const toPlayerX = state.player.x - nearestGuard.x;
      const toPlayerZ = state.player.z - nearestGuard.z;
      const facingMe = Math.sin(nearestGuard.facingYaw) * toPlayerX + Math.cos(nearestGuard.facingYaw) * toPlayerZ > 0;
      const guardThreat =
        nearestGuardDist < 6 &&
        facingMe &&
        hasLineOfSight(level, state.player.x, state.player.z, nearestGuard.x, nearestGuard.z);
      if (cautious && nearestGuardDist < 2.5 && guardThreat) {
        // Slip to the neighbouring walkable cell that gains the most distance
        // (never straight into a dead end).
        let bx = state.player.x;
        let bz = state.player.z;
        let bd = -Infinity;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const cx = Math.floor(state.player.x) + dx;
          const cz = Math.floor(state.player.z) + dz;
          const cell = level.cells[cz]?.[cx];
          if (!cell || cell.kind === 'wall' || cell.kind === 'furniture') continue;
          const d = Math.hypot(cx + 0.5 - nearestGuard.x, cz + 0.5 - nearestGuard.z);
          if (d > bd) {
            bd = d;
            bx = cx + 0.5;
            bz = cz + 0.5;
          }
        }
        intent = steer(state, bx, bz, speed);
      } else if (cautious && nearestGuardDist < 5 && guardThreat) {
        // He's coming this way. Don't freeze in his path — step OFF the
        // corridor into the nearest room cell (what any player does), or
        // hold if already off the artery.
        const myZone = level.cells[Math.floor(state.player.z)]?.[Math.floor(state.player.x)]?.zone;
        if (myZone === 'corridor') {
          let hx = state.player.x;
          let hz = state.player.z;
          let hd = Infinity;
          for (let cy = 0; cy < level.height; cy++) {
            for (let cx = 0; cx < level.width; cx++) {
              const cell = level.cells[cy][cx];
              if (!cell || cell.kind === 'wall' || cell.kind === 'furniture' || cell.zone === 'corridor') continue;
              const d = Math.hypot(cx + 0.5 - state.player.x, cy + 0.5 - state.player.z);
              if (d < hd) {
                hd = d;
                hx = cx + 0.5;
                hz = cy + 0.5;
              }
            }
          }
          intent = driveToPoint(state, hx, hz, speed);
        } else {
          intent = IDLE;
        }
      } else if (state.mission.plantedAtMs === null) {
        const dPlant = Math.hypot(state.player.x - MISSION.plant.x, state.player.z - MISSION.plant.z);
        if (dPlant <= MISSION.interactRangeMetres) {
          interactHeld = true;
        } else {
          intent = driveTo(state, { x: 32, y: 3 }, MISSION.plant.x, MISSION.plant.z, speed);
        }
      } else {
        intent = driveTo(state, { x: 6, y: 15 }, MISSION.exfil.x, MISSION.exfil.z, speed);
      }
    }
    const result = stepHunt(state, intent, null, interactHeld, env, STEP, STEP * 1000);
    state = result.state;
    for (const e of result.events as GuardEvent[]) {
      if (e.type === 'stateChanged' && e.to === 'alert') detections++;
      if (e.type === 'stateChanged' && e.from === 'curious' && e.to === 'patrol') nearMisses++;
    }
  }

  const report = generateReport(state.mission);
  return {
    label,
    outcome: state.mission.phase,
    rating: decideRating(state.mission).rating,
    timeOnSite: report.summary.timeOnSite,
    ingress: state.mission.ingressRoute ?? '(none)',
    plantedAtClockMin: state.mission.plantedAtMs === null ? null : Math.round(state.mission.plantedAtMs / 1000 / 3), // fictional minutes past 01:00
    detections,
    nearMisses,
    detains: state.mission.detains,
    maxAlert: state.mission.maxAlertLevel,
    ticks: i,
  };
}

const runs: RunResult[] = [
  runMission('cautious walk, immediate start', 0, 'walk'),
  runMission('cautious walk, start +5s (shifts door windows)', 300, 'walk'),
  runMission('cautious walk, start +12s', 720, 'walk'),
  runMission('cautious creep the whole way', 0, 'creep'),
  runMission('cautious walk, assist mode (guards 90%)', 0, 'walk', 0.9),
  runMission('reckless walk (no caution at all)', 0, 'walk', undefined, false),
];

console.log('| run | outcome | rating | time on site | ingress | planted +min | detections | near-misses | detains | max alert |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of runs) {
  console.log(
    `| ${r.label} | ${r.outcome} | ${r.rating} | ${r.timeOnSite} | ${r.ingress} | ${r.plantedAtClockMin ?? '-'} | ${r.detections} | ${r.nearMisses} | ${r.detains} | ${r.maxAlert} |`,
  );
}

const completed = runs.filter((r) => r.outcome === 'exfilled').length;
console.log(`\nCompleted (planted + exfilled): ${completed}/${runs.length} — the objective-break check: a naive, no-stealth`);
console.log('follower must still be able to finish the job through detain restarts; a 0 here means the mission is broken.');
