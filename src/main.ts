import * as THREE from 'three';

// Bundled web fonts (OFL, recorded in CREDITS.md). Vite emits the woff2
// files into the build, nothing is fetched from a CDN at runtime. Only the
// weights actually used are imported.
import '@fontsource/saira-condensed/600.css';
import '@fontsource/ibm-plex-mono/400.css';

import { isWall, parseLevel, surfaceAt, type LevelData } from './world/level';
import { extrudeLevel } from './world/Extruder';
import { loadCharacter, loadGuardCharacter, loadStaffCharacter } from './character/CharacterLoader';
import { AnimationController } from './character/AnimationController';
import { GuardAnimationController } from './character/GuardAnimationController';
import { StaffAnimationController } from './character/StaffAnimationController';
import { MovementController } from './input/MovementController';
import { ThrowInput } from './input/ThrowInput';
import { FollowCamera } from './camera/FollowCamera';
import { FpsMeter } from './perf/FpsMeter';
import { applyPaletteToCss, PALETTE_HEX } from './config/palette';
import { DETECTION } from './config/detection';
import { THROW } from './config/throw';
import { FixedTimestepLoop } from './sim/FixedTimestepLoop';
import { InputRecorder, type InputLogEntry } from './sim/InputLog';
import { stepHunt, type HuntEnvironment, type HuntState } from './sim/stepHunt';
import type { MovementIntent } from './input/InputState';
import { noiseRadius } from './systems/Noise';
import { NoiseRingRenderer } from './systems/NoiseRingRenderer';
import { createDebugToggles } from './systems/DebugToggles';
import { nightClockLabel } from './systems/NightClock';
import { buildLightGrid, lightLevelAtWorld } from './systems/LightModel';
import { buildLightGridMesh } from './systems/LightGridRenderer';
import { resolveThrowAim } from './systems/ThrowAim';
import { badgeDoor, createDoorState, isDoorOpen } from './systems/DoorState';
import { staffAnimationState } from './systems/StaffMovement';
import { createBolt } from './entities/BoltState';
import { createGuardState, validateGuardRoutes, type GuardsData } from './entities/GuardState';
import { beamAppearanceFor, guardAnimationState, type GuardEvent } from './entities/GuardStateMachine';
import { createStaffState, validateStaffRoutes, type StaffData } from './entities/StaffState';
import { TorchBeam } from './entities/TorchBeam';
import { DebugVisionCone } from './entities/DebugVisionCone';
import { DoorPanel } from './entities/DoorPanel';
import { Telemetry } from './telemetry/Telemetry';
import floor12 from './data/floor12.json';
import guardsDataRaw from './data/guards.json';
import staffDataRaw from './data/staff.json';

const FIXED_STEP_SECONDS = 1 / 60;

async function main(): Promise<void> {
  applyPaletteToCss();

  const appEl = document.getElementById('app');
  const hudElRaw = document.getElementById('hud');
  const suspicionFillRaw = document.getElementById('suspicion-fill');
  const detainedFlashRaw = document.getElementById('detained-flash');
  if (!appEl || !hudElRaw || !suspicionFillRaw || !detainedFlashRaw) {
    throw new Error('Expected #app, #hud, #suspicion-fill and #detained-flash elements in index.html');
  }
  // TS doesn't narrow captured consts across the frame() closure below, so
  // rebind to names whose type is provably non-null.
  const hudEl: HTMLElement = hudElRaw;
  const suspicionFillEl: HTMLElement = suspicionFillRaw;
  const detainedFlashEl: HTMLElement = detainedFlashRaw;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE_HEX.base);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  appEl.appendChild(renderer.domElement);

  const level = parseLevel(floor12 as LevelData);
  const extruded = extrudeLevel(level);
  scene.add(extruded.group);

  const lightGrid = buildLightGrid(level);
  const lightGridMesh = buildLightGridMesh(level, lightGrid);
  scene.add(lightGridMesh);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(4, 8, 4);
  scene.add(keyLight);

  const noiseRing = new NoiseRingRenderer();
  scene.add(noiseRing.mesh);

  const followCamera = new FollowCamera(window.innerWidth / window.innerHeight);

  const guardsData = guardsDataRaw as GuardsData;
  const staffData = staffDataRaw as StaffData;
  const isWalkable = (x: number, y: number): boolean => {
    const cell = level.cells[y]?.[x];
    return cell !== undefined && (cell.kind === 'floor' || cell.kind === 'door');
  };
  validateGuardRoutes(guardsData, isWalkable);
  validateStaffRoutes(staffData, isWalkable);

  const [player, guardCharacters, staffCharacters] = await Promise.all([
    loadCharacter(),
    Promise.all(guardsData.guards.map(() => loadGuardCharacter())),
    Promise.all(staffData.staff.map(() => loadStaffCharacter())),
  ]);
  scene.add(player.model);
  const animation = new AnimationController(player.model, player.clips);

  const guards = guardsData.guards.map((routeDef, i) => {
    const character = guardCharacters[i];
    scene.add(character.model);
    const torch = new TorchBeam();
    scene.add(torch.mesh);
    const debugCone = new DebugVisionCone();
    scene.add(debugCone.mesh);
    return {
      routeDef,
      model: character.model,
      animation: new GuardAnimationController(character.model, character.clips),
      torch,
      debugCone,
    };
  });

  const staffEntities = staffData.staff.map((routeDef, i) => {
    const character = staffCharacters[i];
    scene.add(character.model);
    return { routeDef, model: character.model, animation: new StaffAnimationController(character.model, character.clips) };
  });

  const doorPanels = level.doors.map((def) => {
    const opensEastWest = isWall(level, def.x, def.y - 1) && isWall(level, def.x, def.y + 1);
    const panel = new DoorPanel(def, opensEastWest, level.cellSize);
    scene.add(panel.mesh);
    return { def, panel };
  });

  const boltMeshGeometry = new THREE.SphereGeometry(0.08, 8, 8);
  const boltMeshMaterial = new THREE.MeshStandardMaterial({ color: 0xc7cdd4 });
  const boltMeshes = new Map<number, THREE.Mesh>();

  const boltLandingRing = new NoiseRingRenderer();
  scene.add(boltLandingRing.mesh);
  let boltLandingRingRemainingMs = 0;
  const BOLT_LANDING_RING_MS = 1500;

  const huntEnv: HuntEnvironment = {
    level,
    lightGrid,
    wallBounds: extruded.wallBounds,
    routes: guardsData.guards.map((g) => g.route),
    staffRoutes: staffData.staff,
  };

  function freshHuntState(): HuntState {
    return {
      player: {
        x: (level.playerStart.x + 0.5) * level.cellSize,
        z: (level.playerStart.y + 0.5) * level.cellSize,
        facingYaw: 0,
      },
      guards: guardsData.guards.map(createGuardState),
      alertLevel: { level: 0, msSinceIncident: 0 },
      simTimeMs: 0,
      doors: level.doors.map(createDoorState),
      staff: staffData.staff.map(createStaffState),
      bolts: [],
    };
  }

  let huntState = freshHuntState();
  let lastIntent: MovementIntent = { directionX: 0, directionZ: 0, speed: 'idle', crouched: false, device: 'none' };
  let tick = 0;
  let replayQueue: InputLogEntry[] | null = null;
  let intentFrozen = false;
  let detainedFlashRemainingMs = 0;
  let animationPhaseMs = 0;
  let prevDoorId: string | null = null;
  let drivenIntent: MovementIntent | null = null;

  const movement = new MovementController();
  const fps = new FpsMeter();
  const telemetry = new Telemetry();
  const clock = new THREE.Clock();

  const debugState = createDebugToggles((state) => {
    extruded.setGridOverlay(state.gridOverlay);
    extruded.setSurfaceTintDebug(state.surfaceTints);
    lightGridMesh.visible = state.lightGrid;
    for (const guard of guards) {
      guard.debugCone.mesh.visible = state.guardDebug;
    }
  });

  // Always recording: cheap (a few numbers per tick), and it's what proves
  // determinism — see src/sim/determinism.test.ts and CLAUDE.md's
  // measurement discipline. __inputLog/__startReplay are exposed on window
  // for manual replay verification during the Phase 2 proof pass (record a
  // run, then __startReplay(__inputLog()) and watch it retrace live,
  // guards included); a real "save/load a run" UI is later scope.
  const recorder = new InputRecorder('phase-2-dev', FIXED_STEP_SECONDS, huntState.player);
  Object.assign(window, {
    __inputLog: () => recorder.toLog(),
    __huntState: () => huntState,
    __wallBounds: () => extruded.wallBounds,
    __telemetry: () => telemetry.toWorksheet(),
    __startReplay: (log: ReturnType<typeof recorder.toLog>) => {
      huntState = { ...freshHuntState(), player: log.startState };
      replayQueue = [...log.entries];
    },
    // Dev-only positioning/debug hooks, for verification without needing to
    // simulate held input over real wall-clock time.
    __teleportTo: (x: number, z: number) => {
      huntState = { ...huntState, player: { x, z, facingYaw: huntState.player.facingYaw } };
    },
    __teleportGuard: (index: number, x: number, z: number, facingYaw = 0) => {
      const nextGuards = huntState.guards.slice();
      nextGuards[index] = { ...nextGuards[index], x, z, facingYaw };
      huntState = { ...huntState, guards: nextGuards };
    },
    __setGuardState: (index: number, partial: Record<string, unknown>) => {
      const nextGuards = huntState.guards.slice();
      nextGuards[index] = { ...nextGuards[index], ...partial };
      huntState = { ...huntState, guards: nextGuards };
    },
    __setDebug: (partial: Partial<typeof debugState>) => {
      Object.assign(debugState, partial);
      extruded.setGridOverlay(debugState.gridOverlay);
      extruded.setSurfaceTintDebug(debugState.surfaceTints);
      lightGridMesh.visible = debugState.lightGrid;
      for (const guard of guards) {
        guard.debugCone.mesh.visible = debugState.guardDebug;
      }
    },
    __forceIntent: (partial: Partial<MovementIntent>) => {
      intentFrozen = true;
      lastIntent = { ...lastIntent, ...partial };
    },
    __unfreezeIntent: () => {
      intentFrozen = false;
    },
    // Phase 3 verification hooks: doors/schedules run on simTimeMs, so
    // jumping it directly is how the three ingress windows and the tailgate
    // window get proven without waiting real seconds through the browser's
    // visibility-throttled requestAnimationFrame (see the Phase 2 PR notes).
    __setSimTime: (ms: number) => {
      huntState = { ...huntState, simTimeMs: ms };
    },
    __badgeDoor: (doorId: string) => {
      huntState = {
        ...huntState,
        doors: huntState.doors.map((d) => (d.id === doorId ? badgeDoor(d, huntState.simTimeMs, false) : d)),
      };
    },
    __teleportStaff: (index: number, x: number, z: number) => {
      const nextStaff = huntState.staff.slice();
      nextStaff[index] = { ...nextStaff[index], x, z };
      huntState = { ...huntState, staff: nextStaff };
    },
    // __forceIntent above freezes movement to idle by design (a static pose
    // for a screenshot at an exact teleported spot) — it deliberately does
    // NOT drive stepHunt's physics. __driveIntent does: it takes priority
    // over both that and the live device poll, for verifying real collision
    // (a closed dynamic door actually blocking movement) without a keyboard
    // or gamepad attached in this test environment.
    __driveIntent: (partial: Partial<MovementIntent>) => {
      drivenIntent = { directionX: 0, directionZ: 0, speed: 'walk', crouched: false, device: 'keyboard', ...partial };
    },
    __clearDrivenIntent: () => {
      drivenIntent = null;
    },
    __throwBolt: (targetX: number, targetZ: number) => {
      huntState = {
        ...huntState,
        bolts: [...huntState.bolts, createBolt(huntState.bolts.length, huntState.player.x, huntState.player.z, targetX, targetZ)],
      };
    },
  });

  // Aim tracking: mouse position raycast onto the ground plane, kept
  // updated between ticks; right stick / R2 are polled fresh each tick
  // (ThrowInput.ts). Mirrors Tailgate's ThrowController.computeAim exactly
  // — see src/systems/ThrowAim.ts.
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let pointerWorld = { x: huntState.player.x, z: huntState.player.z };
  let mouseHeld = false;
  let prevThrowHeld = false;

  renderer.domElement.addEventListener('mousemove', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), followCamera.camera);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, hit)) {
      pointerWorld = { x: hit.x, z: hit.z };
    }
  });
  renderer.domElement.addEventListener('mousedown', (e) => {
    if (e.button === 0) mouseHeld = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseHeld = false;
  });

  const fixedLoop = new FixedTimestepLoop(FIXED_STEP_SECONDS, (deltaSeconds) => {
    const dtMs = deltaSeconds * 1000;

    if (detainedFlashRemainingMs > 0) {
      detainedFlashRemainingMs = Math.max(0, detainedFlashRemainingMs - dtMs);
      if (detainedFlashRemainingMs === 0) {
        huntState = freshHuntState();
      }
      return;
    }

    let intent: MovementIntent;
    let throwAction: { x: number; z: number } | null = null;
    if (intentFrozen) {
      intent = { directionX: 0, directionZ: 0, speed: 'idle', crouched: false, device: lastIntent.device };
    } else if (drivenIntent) {
      intent = drivenIntent;
    } else if (replayQueue && replayQueue.length > 0) {
      const entry = replayQueue.shift()!;
      intent = entry.intent;
      throwAction = entry.throwAction;
    } else {
      replayQueue = null;
      intent = movement.update();
      const throwInput = ThrowInput.read();
      const throwHeld = throwInput.held || mouseHeld;
      if (throwHeld && !prevThrowHeld && huntState.bolts.length < THROW.boltCount) {
        throwAction = resolveThrowAim(huntState.player.x, huntState.player.z, {
          rightStick: throwInput.rightStick,
          pointerWorld,
        });
      }
      prevThrowHeld = throwHeld;
      recorder.record(tick++, intent, throwAction);
    }

    const boltsBefore = huntState.bolts;
    const result = stepHunt(huntState, intent, throwAction, huntEnv, deltaSeconds, dtMs);
    huntState = result.state;
    if (!intentFrozen) {
      lastIntent = intent;
    }

    if (huntState.bolts.length > boltsBefore.length) {
      telemetry.recordBoltThrown();
    }
    for (let i = 0; i < huntState.bolts.length; i++) {
      const bolt = huntState.bolts[i];
      if (bolt.landed && !boltsBefore[i]?.landed) {
        boltLandingRing.update(bolt.x, bolt.z, THROW.noiseRadiusMetres);
        boltLandingRing.setVisible(true);
        boltLandingRingRemainingMs = BOLT_LANDING_RING_MS;
      }
    }
    if (boltLandingRingRemainingMs > 0) {
      boltLandingRingRemainingMs = Math.max(0, boltLandingRingRemainingMs - dtMs);
      if (boltLandingRingRemainingMs === 0) {
        boltLandingRing.setVisible(false);
      }
    }

    // Ingress/tailgate telemetry: fires once per crossing (entering an open
    // dynamic door's cell from outside it), not once per tick spent inside.
    const lockdownNow = huntState.alertLevel.level >= 2;
    const currentDoor = level.doors.find(
      (d) => d.x === Math.floor(huntState.player.x) && d.y === Math.floor(huntState.player.z),
    );
    const currentDoorState = currentDoor ? huntState.doors.find((d) => d.id === currentDoor.id) : undefined;
    const currentDoorId =
      currentDoor && currentDoorState && isDoorOpen(currentDoorState, huntState.simTimeMs, lockdownNow) ? currentDoor.id : null;
    if (currentDoorId && currentDoorId !== prevDoorId) {
      telemetry.recordIngressRoute(currentDoorId);
      if (currentDoor?.kind === 'badge') {
        telemetry.recordTailgateAttempt(result.events.some((e) => e.type === 'tailgateWitnessed'));
      }
    }
    prevDoorId = currentDoorId;

    const playerLight = lightLevelAtWorld(lightGrid, level.cellSize, huntState.player.x, huntState.player.z);
    telemetry.recordTick(deltaSeconds, playerLight);
    telemetry.recordEvents(result.events);

    if (detainedFlashRemainingMs === 0 && result.events.some((e: GuardEvent) => e.type === 'detain')) {
      detainedFlashRemainingMs = DETECTION.timing.detainedFlashMs;
    }
  });

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    followCamera.setAspect(window.innerWidth / window.innerHeight);
  });

  // Shader warm-up (Phase 1's finding): compile every material once, right
  // after the FIRST full update below has given every mesh (torch beams,
  // debug cones, the light grid) real geometry — compiling while any of
  // them still holds their constructor's empty placeholder BufferGeometry
  // is what caused the hang this is fixing, not just a missed optimisation.
  let warmedUp = false;

  function renderOnce(frameDelta: number): void {
    animationPhaseMs += frameDelta * 1000;
    fixedLoop.advance(frameDelta);

    player.model.position.set(huntState.player.x, 0, huntState.player.z);
    player.model.rotation.y = huntState.player.facingYaw;
    animation.setState(lastIntent.speed, lastIntent.crouched);
    animation.update(frameDelta);

    for (let i = 0; i < guards.length; i++) {
      const guardState = huntState.guards[i];
      const guard = guards[i];
      guard.model.position.set(guardState.x, 0, guardState.z);
      guard.model.rotation.y = guardState.facingYaw;
      guard.animation.setState(guardAnimationState(guardState));
      guard.animation.update(frameDelta);
      guard.torch.update(
        level,
        guardState.x,
        guardState.z,
        guardState.facingYaw,
        DETECTION.vision.rangeCells,
        DETECTION.vision.fovDegrees,
        beamAppearanceFor(guardState.state),
        animationPhaseMs / 200,
      );
      guard.debugCone.update(guardState.x, guardState.z, guardState.facingYaw, DETECTION.vision.rangeCells, DETECTION.vision.fovDegrees);
    }

    for (let i = 0; i < staffEntities.length; i++) {
      const staffState = huntState.staff[i];
      const staff = staffEntities[i];
      staff.model.position.set(staffState.x, 0, staffState.z);
      staff.model.rotation.y = staffState.facingYaw;
      staff.animation.setState(staffAnimationState(staffState));
      staff.animation.update(frameDelta);
    }

    const lockdown = huntState.alertLevel.level >= 2;
    for (const { def, panel } of doorPanels) {
      const doorState = huntState.doors.find((d) => d.id === def.id);
      panel.update(doorState !== undefined && isDoorOpen(doorState, huntState.simTimeMs, lockdown));
    }

    const activeBoltIds = new Set<number>();
    for (const bolt of huntState.bolts) {
      if (bolt.landed) continue; // spent bolts are just a marker in sim state, nothing to draw
      activeBoltIds.add(bolt.id);
      let mesh = boltMeshes.get(bolt.id);
      if (!mesh) {
        mesh = new THREE.Mesh(boltMeshGeometry, boltMeshMaterial);
        scene.add(mesh);
        boltMeshes.set(bolt.id, mesh);
      }
      mesh.position.set(bolt.x, 1, bolt.z);
    }
    for (const [id, mesh] of boltMeshes) {
      if (!activeBoltIds.has(id)) {
        scene.remove(mesh);
        boltMeshes.delete(id);
      }
    }

    followCamera.follow(huntState.player.x, huntState.player.z, lastIntent.directionX, lastIntent.directionZ, frameDelta);

    const surface = surfaceAt(level, huntState.player.x, huntState.player.z);
    const radius = noiseRadius(lastIntent.speed, surface);
    noiseRing.setVisible(debugState.noiseRing);
    noiseRing.update(huntState.player.x, huntState.player.z, radius);

    const maxSuspicion = Math.max(0, ...huntState.guards.map((g) => g.suspicion));
    suspicionFillEl.style.width = `${maxSuspicion}%`;
    suspicionFillEl.style.backgroundColor = maxSuspicion >= DETECTION.suspicion.curiousThreshold ? 'var(--alarm)' : 'var(--amber)';
    detainedFlashEl.style.opacity = detainedFlashRemainingMs > 0 ? '0.85' : '0';

    const currentFps = fps.tick();
    const hudLines = [
      `fps ${currentFps.toFixed(0)} (worst ${fps.getWorstFps().toFixed(0)})`,
      `speed ${lastIntent.speed}${lastIntent.crouched ? ' (crouched)' : ''}`,
      `noise ${radius.toFixed(1)}m`,
      `device ${lastIntent.device}`,
      `suspicion ${maxSuspicion.toFixed(0)}`,
      `alert level ${huntState.alertLevel.level}`,
      nightClockLabel(),
      `sim ${(huntState.simTimeMs / 1000).toFixed(1)}s`,
      `bolts ${huntState.bolts.length}/${THROW.boltCount}`,
      ...huntState.doors.map((d) => `${d.id}: ${isDoorOpen(d, huntState.simTimeMs, lockdown) ? 'open' : 'shut'}`),
    ];
    if (debugState.guardDebug) {
      for (const guardState of huntState.guards) {
        hudLines.push(`${guardState.id}: ${guardState.state} (${guardState.suspicion.toFixed(0)})`);
      }
    }
    hudEl.textContent = hudLines.join('\n');

    if (!warmedUp) {
      warmedUp = true;
      renderer.compile(scene, followCamera.camera);
    }

    renderer.render(scene, followCamera.camera);
  }

  function frame(): void {
    // Clamp delta so a dropped frame (tab backgrounded, GC pause) never
    // fires a burst of catch-up sim ticks in one go.
    renderOnce(Math.min(clock.getDelta(), 1 / 20));
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  // Verification hook: manually drives one render+sim frame without relying
  // on requestAnimationFrame, which this test environment's browser
  // automation throttles to near-zero on a backgrounded/unfocused tab (see
  // the Phase 2 PR notes) — lets a screenshot/hook-based verification pass
  // advance the game deterministically regardless.
  Object.assign(window, {
    __forceFrame: (deltaSeconds = FIXED_STEP_SECONDS) => renderOnce(deltaSeconds),
  });
}

main().catch((error) => {
  console.error('Failed to start Tailgate: After Hours:', error);
  const hudEl = document.getElementById('hud');
  if (hudEl) {
    hudEl.textContent = `Failed to load: ${error instanceof Error ? error.message : String(error)}`;
  }
});
