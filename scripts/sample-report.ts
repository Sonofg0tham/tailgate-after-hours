// Prints sample Engagement Reports as plain text, for pasting into the PR.
// The GHOST sample is generated from a REAL driven full mission (a pathfinding
// follower ingresses, plants, and exfils through the actual sim), so its
// timestamps and findings are genuine. The DETAINED and DAWN samples are
// built from representative mission states to show the other framings through
// the same generator. Run: npx vite-node scripts/sample-report.ts
import { parseLevel, type LevelData } from '../src/world/level';
import { extrudeLevel } from '../src/world/Extruder';
import { buildLightGrid } from '../src/systems/LightModel';
import { createDoorState, doorOpenLookup } from '../src/systems/DoorState';
import { findPath } from '../src/systems/Pathfinding';
import { stepHunt, type HuntEnvironment, type HuntState } from '../src/sim/stepHunt';
import { createMissionState, type MissionState } from '../src/sim/MissionState';
import { generateReport, type ReportModel } from '../src/report/generateReport';
import { MISSION } from '../src/config/mission';
import type { MovementIntent } from '../src/input/InputState';
import floor12 from '../src/data/floor12.json';

const level = parseLevel(floor12 as LevelData);
const extruded = extrudeLevel(level);
const STEP = 1 / 60;
const env: HuntEnvironment = { level, lightGrid: buildLightGrid(level), wallBounds: extruded.wallBounds, routes: [], guardRoutes: [], staffRoutes: [] };
const IDLE: MovementIntent = { directionX: 0, directionZ: 0, speed: 'idle', crouched: false, device: 'none' };

function steer(state: HuntState, tx: number, tz: number): MovementIntent {
  const dx = tx - state.player.x;
  const dz = tz - state.player.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return IDLE;
  return { directionX: dx / d, directionZ: dz / d, speed: 'walk', crouched: false, device: 'keyboard' };
}

function driveTo(state: HuntState, stand: { x: number; y: number }, px: number, pz: number): MovementIntent {
  const overrides = doorOpenLookup(level, state.doors, state.simTimeMs, false);
  const path = findPath(level, { x: Math.floor(state.player.x), y: Math.floor(state.player.z) }, stand, overrides);
  if (!path) return IDLE;
  if (path.length >= 2) return steer(state, path[1].x + 0.5, path[1].y + 0.5);
  return steer(state, px, pz);
}

function driveCleanRun(): MissionState {
  let state: HuntState = {
    player: { x: 3.5, z: 12.5, facingYaw: 0 },
    guards: [],
    alertLevel: { level: 0, msSinceIncident: 0 },
    simTimeMs: 0,
    doors: level.doors.map(createDoorState),
    staff: [],
    bolts: [],
    mission: createMissionState(),
  };
  for (let i = 0; i < 12000 && state.mission.phase === 'infiltrating'; i++) {
    let intent: MovementIntent;
    let interactHeld = false;
    if (state.mission.plantedAtMs === null) {
      const dPlant = Math.hypot(state.player.x - MISSION.plant.x, state.player.z - MISSION.plant.z);
      if (dPlant <= MISSION.interactRangeMetres) {
        intent = IDLE;
        interactHeld = true;
      } else {
        intent = driveTo(state, { x: 32, y: 3 }, MISSION.plant.x, MISSION.plant.z);
      }
    } else {
      intent = driveTo(state, { x: 6, y: 15 }, MISSION.exfil.x, MISSION.exfil.z);
    }
    state = stepHunt(state, intent, null, interactHeld, env, STEP, STEP * 1000).state;
  }
  return state.mission;
}

function renderReportText(m: ReportModel): string {
  const lines: string[] = [];
  lines.push('================ ENGAGEMENT REPORT ================');
  lines.push(`${m.header.client}   //   ${m.header.site}`);
  lines.push(`${m.header.consultant}   //   REF ${m.header.ref}`);
  lines.push(`NIGHT ENGAGEMENT ${m.header.window}   //   ${m.header.date}`);
  if (m.header.outcomeLine) {
    lines.push('');
    lines.push(`  ** ${m.header.outcomeLine} **`);
  }
  lines.push('');
  lines.push(`RATING:  ${m.rating}`);
  lines.push(`         ${m.ratingRemark}`);
  lines.push('');
  lines.push('FINDINGS');
  if (m.findings.length === 0) lines.push('  (none)');
  for (const f of m.findings) {
    lines.push(`  ${f.ref}  [${f.severity}]  ${f.text}`);
  }
  lines.push('');
  lines.push('CLIENT DETECTIONS');
  for (const d of m.clientDetections) lines.push(`  - ${d}`);
  lines.push('');
  lines.push('SUMMARY');
  lines.push(`  Time on site:  ${m.summary.timeOnSite}`);
  lines.push(`  Alert reached: ${m.summary.alertReached}`);
  lines.push(`  Secondaries:   ${m.summary.secondaries}`);
  lines.push('===================================================');
  return lines.join('\n');
}

// 1. A real driven GHOST run (both secondaries and a distraction added by hand
//    to show a fuller findings list — the plant/ingress/exfil times are real).
const cleanRun = driveCleanRun();
const ghost: MissionState = {
  ...cleanRun,
  photos: { 'corner-office': (cleanRun.plantedAtMs ?? 0) + 4000, 'sticky-note': (cleanRun.plantedAtMs ?? 0) - 8000 },
  boltsThrown: 1,
};

// 2. A caught-but-finished DETAINED run.
const detained: MissionState = {
  ...createMissionState(),
  phase: 'exfilled',
  ingressRoute: 'lobby',
  ingressAtMs: 18_000,
  plantedAtMs: 120_000,
  photos: { 'corner-office': null, 'sticky-note': 96_000 },
  exfilledAtMs: 210_000,
  everSpotted: true,
  maxAlertLevel: 2,
  detains: 1,
  boltsThrown: 2,
};

// 3. A dawn timeout: planted, but the consultant never cleared the site.
const dawn: MissionState = {
  ...createMissionState(),
  phase: 'dawn',
  ingressRoute: 'fire-stairs',
  ingressAtMs: 9000,
  plantedAtMs: 540_000,
  everSpotted: true,
  maxAlertLevel: 1,
};

for (const [label, mission] of [
  ['GHOST (real driven run)', ghost],
  ['DETAINED', detained],
  ['DAWN', dawn],
] as const) {
  console.log(`\n\n----- ${label} -----`);
  console.log(renderReportText(generateReport(mission)));
}
