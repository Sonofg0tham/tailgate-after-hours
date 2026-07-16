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
import { KeyboardState } from './input/KeyboardInput';
import { ThrowInput } from './input/ThrowInput';
import { InteractInput } from './input/InteractInput';
import { FollowCamera } from './camera/FollowCamera';
import { FpsMeter } from './perf/FpsMeter';
import { applyPaletteToCss, PALETTE_HEX } from './config/palette';
import { DETECTION } from './config/detection';
import { THROW } from './config/throw';
import { MISSION } from './config/mission';
import { boundedDevicePixelRatio, gridBrightness, RENDER_LIGHTING } from './config/renderLighting';
import { buildFixtures } from './world/Fixtures';
import { AudioEngine } from './audio/AudioEngine';
import { AUDIO } from './config/audio';
import { hasLineOfSight } from './systems/Vision';
import { JUICE } from './config/juice';
import { initMotion, motionLevel } from './systems/Motion';
import { FixedTimestepLoop } from './sim/FixedTimestepLoop';
import type { InputLog } from './sim/InputLog';
import { stepHunt, type HuntEnvironment, type HuntState } from './sim/stepHunt';
import { abandonMission, createMissionState } from './sim/MissionState';
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
import { generateReport } from './report/generateReport';
import { ReportView } from './report/ReportView';
import { loadProgress, recordCompletion } from './systems/Progress';
import { loadSettings, saveSettings, type GameSettings } from './systems/Settings';
import { setMotionLevel } from './systems/Motion';
import { setGridMinOverride } from './config/renderLighting';
import { EngagementLifecycle } from './systems/EngagementLifecycle';
import { Kiosk } from './ui/Kiosk';
import { buildHudLines } from './ui/HudPresenter';
import { PauseLanyard } from './ui/PauseLanyard';
import { SettingsPanel } from './ui/SettingsPanel';
import floor12 from './data/floor12.json';
import guardsDataRaw from './data/guards.json';
import staffDataRaw from './data/staff.json';

const FIXED_STEP_SECONDS = 1 / 60;

async function main(): Promise<void> {
  applyPaletteToCss();
  initMotion(); // reduced motion is the fresh-visitor default

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
  renderer.setPixelRatio(boundedDevicePixelRatio(window.devicePixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  appEl.appendChild(renderer.domElement);

  const level = parseLevel(floor12 as LevelData);
  const lightGrid = buildLightGrid(level);
  // The extruder paints floor/wall vertex colours FROM the light grid — the
  // render-agrees-with-grid invariant, by construction (see Extruder.ts).
  // `let`: the visibility-floor setting re-extrudes the visual live.
  let extruded = extrudeLevel(level, lightGrid);
  scene.add(extruded.group);

  const lightGridMesh = buildLightGridMesh(level, lightGrid);
  scene.add(lightGridMesh);

  // The night rig (Phase 5): the daylight ambient+directional pair is gone.
  // Dynamic objects (characters, furniture, door panels) get a dim ambient,
  // per-source point lights (Fixtures.ts), the guard torch spotlights, and
  // the player's visibility-floor fill; floors/walls are grid-lit and ignore
  // all of it.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene.add(new THREE.AmbientLight(RENDER_LIGHTING.ambient.color, RENDER_LIGHTING.ambient.intensity));
  scene.add(buildFixtures(level));

  // The nystagmus visibility floor's character half: the operator always
  // reads, whatever the darkness. Concealment is unchanged — sim never sees this.
  const playerFill = new THREE.PointLight(
    RENDER_LIGHTING.playerFill.color,
    RENDER_LIGHTING.playerFill.intensity,
    RENDER_LIGHTING.playerFill.distanceMetres,
    1.5,
  );
  scene.add(playerFill);

  // Audio: reads events and state each tick/frame, never writes back. The
  // occlusion callback reuses the grid's own sight test, so a guard behind
  // a wall sounds muffled exactly where he'd be unseen. Unlock rides the
  // first real input (autoplay policy); the listeners stay attached so a
  // suspended context resumes too.
  const audio = new AudioEngine({
    isOccluded: (sourceX, sourceZ, listenerX, listenerZ) => !hasLineOfSight(level, listenerX, listenerZ, sourceX, sourceZ),
  });
  window.addEventListener('keydown', () => audio.unlock());
  window.addEventListener('pointerdown', () => audio.unlock());

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
  const enableCharacterShadows = (model: THREE.Object3D): void => {
    model.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
    });
  };
  scene.add(player.model);
  enableCharacterShadows(player.model);
  const animation = new AnimationController(player.model, player.clips);

  const guards = guardsData.guards.map((routeDef, i) => {
    const character = guardCharacters[i];
    scene.add(character.model);
    enableCharacterShadows(character.model);
    const torch = new TorchBeam();
    scene.add(torch.group);
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
    enableCharacterShadows(character.model);
    return { routeDef, model: character.model, animation: new StaffAnimationController(character.model, character.clips) };
  });

  const doorPanels = level.doors.map((def) => {
    const opensEastWest = isWall(level, def.x, def.y - 1) && isWall(level, def.x, def.y + 1);
    const panel = new DoorPanel(def, opensEastWest, level.cellSize);
    scene.add(panel.mesh);
    return { def, panel };
  });

  // Objective markers: a soft amber pillar over each objective point so the
  // player can see where to go. The plant/photo markers hide once their
  // objective is done; the exfil marker only appears once the device is
  // planted. Driven by the same MISSION config as the mechanic, so they can
  // never drift apart.
  function objectiveMarker(x: number, z: number, color: number): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 2.2, 12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }),
    );
    mesh.position.set(x, 1.1, z);
    scene.add(mesh);
    return mesh;
  }
  const plantMarker = objectiveMarker(MISSION.plant.x, MISSION.plant.z, PALETTE_HEX.amber);
  const photoMarkers = MISSION.photos.map((p) => ({ id: p.id, mesh: objectiveMarker(p.x, p.z, 0x8a94a2) }));
  const exfilMarker = objectiveMarker(MISSION.exfil.x, MISSION.exfil.z, PALETTE_HEX.amber);
  exfilMarker.visible = false;

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
    guardRoutes: guardsData.guards,
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
      mission: createMissionState(),
    };
  }

  let huntState = freshHuntState();
  let lastIntent: MovementIntent = { directionX: 0, directionZ: 0, speed: 'idle', crouched: false, device: 'none' };
  const lifecycle = new EngagementLifecycle('phase-2-dev', FIXED_STEP_SECONDS, huntState.player);
  const inputSession = lifecycle.inputSession;
  let detainedFlashRemainingMs = 0;
  let animationPhaseMs = 0;
  let prevDoorId: string | null = null;
  let playerStepTimerMs = 0;
  let guardStepTimersMs = guardsData.guards.map(() => 0);
  let detainImpactRemainingMs = 0;
  let shakeRemainingMs = 0;
  // Phase 6 app flow: boot lands on the kiosk; the sim only advances while
  // running; the pause lanyard freezes it; the report freezes it via
  // the lifecycle report flag plus the mission-phase early return.
  let settings: GameSettings = loadSettings();
  let shakeIntensityLive = settings.shakeIntensity;
  let settingsOpen = false;
  let settingsReturnTo: 'kiosk' | 'pause' = 'kiosk';
  let prevStartHeld = false;

  const movement = new MovementController();
  const keyboard = new KeyboardState();
  const fps = new FpsMeter();
  let telemetry = new Telemetry(); // reassigned on [ NEW ENGAGEMENT ]
  const clock = new THREE.Clock();
  const reportView = new ReportView();

  const debugState = createDebugToggles((state) => {
    extruded.setGridOverlay(state.gridOverlay);
    extruded.setSurfaceTintDebug(state.surfaceTints);
    lightGridMesh.visible = state.lightGrid;
    renderer.domElement.style.filter = state.greyscale ? 'grayscale(1)' : '';
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
  Object.assign(window, {
    __inputLog: () => inputSession.toLog(),
    __huntState: () => huntState,
    __wallBounds: () => extruded.wallBounds,
    __telemetry: () => telemetry.toWorksheet(),
    __startReplay: (log: InputLog) => {
      huntState = { ...freshHuntState(), player: log.startState };
      inputSession.startReplay(log);
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
      renderer.domElement.style.filter = debugState.greyscale ? 'grayscale(1)' : '';
      for (const guard of guards) {
        guard.debugCone.mesh.visible = debugState.guardDebug;
      }
    },
    __forceIntent: (partial: Partial<MovementIntent>) => {
      inputSession.intentFrozen = true;
      lastIntent = { ...lastIntent, ...partial };
    },
    __unfreezeIntent: () => {
      inputSession.intentFrozen = false;
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
      inputSession.drivenIntent = {
        directionX: 0,
        directionZ: 0,
        speed: 'walk',
        crouched: false,
        device: 'keyboard',
        ...partial,
      };
    },
    __clearDrivenIntent: () => {
      inputSession.drivenIntent = null;
      inputSession.drivenInteract = null;
    },
    __throwBolt: (targetX: number, targetZ: number) => {
      huntState = {
        ...huntState,
        bolts: [...huntState.bolts, createBolt(huntState.bolts.length, huntState.player.x, huntState.player.z, targetX, targetZ)],
      };
    },
    // Phase 4 verification hooks. __missionState reads the objective/checkpoint/
    // exfil/dawn progress; __driveInteract holds (or releases) the interact
    // control so a plant/photo hold can be driven deterministically alongside
    // __driveIntent, without a keyboard attached in this throttled environment.
    __missionState: () => huntState.mission,
    __driveInteract: (held: boolean) => {
      inputSession.drivenInteract = held;
    },
    // Phase 5: master volume (the Phase 6 settings knob, reachable early).
    __setVolume: (v: number) => audio.setMasterVolume(v),
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

  // --- Phase 6 flow functions (hoisted declarations; wired to the UI below).

  /** Everything a fresh run needs, from either the kiosk or [ NEW ENGAGEMENT ]. Assist applies here — the label says so. */
  function beginEngagement(): void {
    kiosk.hide();
    settingsPanel.hide();
    settingsOpen = false;
    reportView.hide();
    huntEnv.guardSpeedScale = settings.assistMode ? 0.9 : 1;
    huntState = freshHuntState();
    const reset = lifecycle.beginEngagement(huntState.player, huntState.guards.length);
    lastIntent = reset.lastIntent;
    pointerWorld = reset.pointerWorld;
    mouseHeld = reset.mouseHeld;
    prevThrowHeld = reset.previousThrowHeld;
    telemetry = reset.telemetry;
    prevDoorId = reset.previousDoorId;
    playerStepTimerMs = reset.playerStepTimerMs;
    guardStepTimersMs = reset.guardStepTimersMs;
    detainedFlashRemainingMs = reset.detainedFlashRemainingMs;
    detainImpactRemainingMs = reset.detainImpactRemainingMs;
    shakeRemainingMs = reset.shakeRemainingMs;
    boltLandingRingRemainingMs = reset.boltLandingRingRemainingMs;
    boltLandingRing.setVisible(false);
    movement.reset();
    audio.unlock();
  }

  /** The engagement is over (exfil, dawn, or abandoned): file the report, persist, raise the document. */
  function endEngagement(): void {
    if (!lifecycle.beginReport()) {
      return;
    }
    pause.hide();
    const mission = huntState.mission;
    const endMs = mission.exfilledAtMs ?? mission.abandonedAtMs ?? huntState.simTimeMs;
    const report = generateReport(mission);
    telemetry.recordMissionEnd(mission, report.rating, endMs);
    recordCompletion(report.rating, Math.round(endMs / 1000), {
      timeOnSite: report.summary.timeOnSite,
      assist: (huntEnv.guardSpeedScale ?? 1) < 1,
    });
    audio.play('reportPrint');
    reportView.show(report, {
      onNewEngagement: () => {
        audio.play('uiClick');
        beginEngagement();
      },
      onSignOut: () => {
        audio.play('uiClick');
        reportView.hide();
        showKiosk();
      },
    });
  }

  function showKiosk(): void {
    lifecycle.showKiosk();
    kiosk.show(loadProgress());
  }

  function togglePause(): void {
    if (settingsOpen) {
      closeSettings();
      return;
    }
    if (!lifecycle.togglePause(huntState.mission.phase === 'infiltrating')) {
      return;
    }
    if (lifecycle.appState === 'paused') {
      pause.show();
    } else {
      pause.hide();
    }
  }

  function closeSettings(): void {
    settingsPanel.hide();
    settingsOpen = false;
    if (settingsReturnTo === 'pause') {
      pause.show();
    } else {
      kiosk.show(loadProgress());
    }
  }

  /** Persist and apply a settings change — live wherever feasible. */
  function applySettings(next: GameSettings): void {
    const floorChanged =
      next.visibilityFloor !== settings.visibilityFloor || next.highContrast !== settings.highContrast;
    settings = next;
    saveSettings(settings);
    audio.setMasterVolume(settings.masterVolume);
    setMotionLevel(settings.motionLevel);
    shakeIntensityLive = settings.shakeIntensity;
    document.documentElement.style.setProperty('--hud-scale', String(settings.hudScale));
    document.body.classList.toggle('high-contrast', settings.highContrast);
    if (floorChanged) {
      // High contrast also raises the darkness floor — part of the same
      // readability contract. Re-extrude the visual through the new curve;
      // collision/wallBounds are untouched (geometry is identical).
      const effectiveFloor = settings.highContrast ? Math.max(settings.visibilityFloor, 0.5) : settings.visibilityFloor;
      setGridMinOverride(effectiveFloor);
      scene.remove(extruded.group);
      extruded.dispose();
      extruded = extrudeLevel(level, lightGrid);
      extruded.setSurfaceTintDebug(debugState.surfaceTints);
      extruded.setGridOverlay(debugState.gridOverlay);
      scene.add(extruded.group);
    }
    // Assist mode applies at the next engagement (huntEnv is read in beginEngagement).
  }

  const settingsPanel = new SettingsPanel(
    (next) => applySettings(next),
    () => {
      audio.play('uiClick');
      closeSettings();
    },
  );
  const kiosk = new Kiosk(
    () => {
      audio.unlock(); // the begin click is the autoplay gesture
      audio.play('uiClick');
      beginEngagement();
    },
    () => {
      settingsReturnTo = 'kiosk';
      settingsOpen = true;
      kiosk.hide();
      settingsPanel.show(settings);
    },
  );
  const pause = new PauseLanyard(
    () => togglePause(),
    () => {
      settingsReturnTo = 'pause';
      settingsOpen = true;
      pause.hide();
      settingsPanel.show(settings);
    },
    () => {
      // Abandon: the report files the run so far, stamped ABANDONED.
      huntState = { ...huntState, mission: abandonMission(huntState.mission, huntState.simTimeMs) };
      pause.hide();
      endEngagement();
    },
  );

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape') {
      event.preventDefault();
      togglePause();
    }
  });

  const fixedLoop = new FixedTimestepLoop(FIXED_STEP_SECONDS, (deltaSeconds) => {
    const dtMs = deltaSeconds * 1000;

    // The detain flash is now purely cosmetic: the checkpoint restart already
    // happened deterministically inside stepHunt (restartAtCheckpoint), so the
    // sim just pauses briefly on the red frame, then resumes at the checkpoint.
    if (detainedFlashRemainingMs > 0) {
      detainedFlashRemainingMs = Math.max(0, detainedFlashRemainingMs - dtMs);
      return;
    }

    // The mission is over (exfilled or caught by dawn): freeze the sim until
    // [ NEW ENGAGEMENT ] starts a fresh run.
    if (huntState.mission.phase !== 'infiltrating') {
      return;
    }

    let intent: MovementIntent;
    let throwAction: { x: number; z: number } | null = null;
    let interactHeld: boolean;
    const replayEntry =
      inputSession.intentFrozen || inputSession.drivenIntent ? null : inputSession.takeReplayEntry();
    if (inputSession.intentFrozen) {
      intent = { directionX: 0, directionZ: 0, speed: 'idle', crouched: false, device: lastIntent.device };
      interactHeld = inputSession.drivenInteract ?? false;
    } else if (inputSession.drivenIntent) {
      intent = inputSession.drivenIntent;
      interactHeld = inputSession.drivenInteract ?? false;
    } else if (replayEntry) {
      intent = replayEntry.intent;
      throwAction = replayEntry.throwAction;
      interactHeld = replayEntry.interactHeld;
    } else {
      intent = movement.update();
      interactHeld = InteractInput.read(keyboard);
      const throwInput = ThrowInput.read();
      const throwHeld = throwInput.held || mouseHeld;
      if (throwHeld && !prevThrowHeld && huntState.bolts.length < THROW.boltCount) {
        throwAction = resolveThrowAim(huntState.player.x, huntState.player.z, {
          rightStick: throwInput.rightStick,
          pointerWorld,
        });
      }
      prevThrowHeld = throwHeld;
      inputSession.record(intent, throwAction, interactHeld);
    }

    const boltsBefore = huntState.bolts;
    const result = stepHunt(huntState, intent, throwAction, interactHeld, huntEnv, deltaSeconds, dtMs);
    huntState = result.state;
    if (!inputSession.intentFrozen) {
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
        audio.play('boltLand', { at: { x: bolt.x, z: bolt.z } });
      }
    }

    // Event cues: the sim's own events drive the sound, one way only.
    for (const event of result.events) {
      const guardAt = huntState.guards.find((g) => g.id === ('guardId' in event ? event.guardId : ''));
      if (event.type === 'stateChanged' && event.to === 'alert') {
        audio.play('sting');
      } else if (event.type === 'stateChanged' && event.to === 'curious') {
        audio.play('curiousTick', guardAt ? { at: { x: guardAt.x, z: guardAt.z } } : {});
      } else if (event.type === 'radioCall') {
        audio.play('radioSquelch', guardAt ? { at: { x: guardAt.x, z: guardAt.z } } : {});
      } else if (event.type === 'detain') {
        audio.play('detainLine');
        audio.duck(AUDIO.detainDuck.amount, AUDIO.detainDuck.holdMs);
      }
    }

    // Player footsteps: cadence by speed, voice by the surface underfoot —
    // the same grid data the noise sim reads, so what you hear is what
    // guards hear.
    const stepSpeed = intent.speed;
    if (stepSpeed !== 'idle') {
      playerStepTimerMs += dtMs;
      if (playerStepTimerMs >= AUDIO.playerFootsteps.intervalMs[stepSpeed]) {
        playerStepTimerMs = 0;
        const surface = surfaceAt(level, huntState.player.x, huntState.player.z) ?? 'concrete';
        const cue = surface === 'carpet' ? 'footstepCarpet' : surface === 'tile' ? 'footstepTile' : 'footstepConcrete';
        audio.play(cue, { gain: AUDIO.playerFootsteps.gain[stepSpeed] });
      }
    } else {
      playerStepTimerMs = 0;
    }

    // Guard footsteps: spatialised at each guard, cadence from their pace.
    for (let i = 0; i < huntState.guards.length; i++) {
      const g = huntState.guards[i];
      const pace = guardAnimationState(g);
      if (pace === 'idle') {
        guardStepTimersMs[i] = 0;
        continue;
      }
      guardStepTimersMs[i] += dtMs;
      if (guardStepTimersMs[i] >= AUDIO.guardFootsteps.intervalMs[pace]) {
        guardStepTimersMs[i] = 0;
        audio.play('guardFootstep', { at: { x: g.x, z: g.z }, gain: AUDIO.guardFootsteps.gain });
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
      detainImpactRemainingMs = JUICE.detainImpact.durationMs;
      shakeRemainingMs = JUICE.shake.durationMs;
    }

    // Mission just ended (exfil or dawn): file the report. Abandon reaches
    // the same endEngagement directly from the pause lanyard.
    if (huntState.mission.phase !== 'infiltrating' && !lifecycle.reportShown) {
      endEngagement();
    }
  });

  window.addEventListener('resize', () => {
    renderer.setPixelRatio(boundedDevicePixelRatio(window.devicePixelRatio));
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
    // The sim only advances mid-engagement: the kiosk and the pause lanyard
    // freeze it entirely (the scene still renders behind them).
    if (lifecycle.appState === 'running') {
      fixedLoop.advance(frameDelta);
    }

    // Pad pause: Start (button 9) toggles the lanyard, edge-triggered.
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads.find((p) => p !== null);
    const startHeld = (pad?.buttons[9]?.value ?? 0) > 0.5;
    if (startHeld && !prevStartHeld && lifecycle.appState !== 'kiosk') {
      togglePause();
    }
    prevStartHeld = startHeld;

    player.model.position.set(huntState.player.x, 0, huntState.player.z);
    player.model.rotation.y = huntState.player.facingYaw;
    playerFill.position.set(huntState.player.x, RENDER_LIGHTING.playerFill.heightMetres, huntState.player.z);
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

    // Objective markers: hide each once its objective is done; the exfil
    // marker only appears once the device is planted.
    const mission = huntState.mission;
    plantMarker.visible = mission.plantedAtMs === null;
    for (const marker of photoMarkers) {
      marker.mesh.visible = mission.photos[marker.id] === null;
    }
    exfilMarker.visible = mission.plantedAtMs !== null && mission.exfilledAtMs === null;
    const markerBob = 0.15 * Math.sin(animationPhaseMs / 400);
    plantMarker.position.y = 1.1 + markerBob;
    exfilMarker.position.y = 1.1 + markerBob;

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

    // Detain juice, applied AFTER the follow so it's a pure offset: a brief
    // camera dip (motion level permitting) and a shake whose master
    // intensity SHIPS AT ZERO (JUICE.shake.intensity — the Phase 6 slider).
    // Timers decay regardless of level so toggling never strands them.
    if (detainImpactRemainingMs > 0 || shakeRemainingMs > 0) {
      const dtJuiceMs = frameDelta * 1000;
      if (detainImpactRemainingMs > 0 && motionLevel() === 'full') {
        const t = detainImpactRemainingMs / JUICE.detainImpact.durationMs; // 1 -> 0
        followCamera.camera.position.y -= JUICE.detainImpact.dipMetres * Math.sin(t * Math.PI);
      }
      if (shakeRemainingMs > 0 && motionLevel() === 'full' && shakeIntensityLive > 0) {
        const falloff = shakeRemainingMs / JUICE.shake.durationMs;
        const phase = (performance.now() / 1000) * JUICE.shake.frequencyHz * Math.PI * 2;
        const amp = JUICE.shake.amplitudeMetres * shakeIntensityLive * falloff;
        followCamera.camera.position.x += Math.sin(phase) * amp;
        followCamera.camera.position.z += Math.cos(phase * 1.31) * amp;
      }
      detainImpactRemainingMs = Math.max(0, detainImpactRemainingMs - dtJuiceMs);
      shakeRemainingMs = Math.max(0, shakeRemainingMs - dtJuiceMs);
    }

    const surface = surfaceAt(level, huntState.player.x, huntState.player.z);
    const radius = noiseRadius(lastIntent.speed, surface);
    noiseRing.setVisible(debugState.noiseRing);
    noiseRing.update(huntState.player.x, huntState.player.z, radius);

    const maxSuspicion = Math.max(0, ...huntState.guards.map((g) => g.suspicion));
    suspicionFillEl.style.width = `${maxSuspicion}%`;
    suspicionFillEl.style.backgroundColor = maxSuspicion >= DETECTION.suspicion.curiousThreshold ? 'var(--alarm)' : 'var(--amber)';
    detainedFlashEl.style.opacity = detainedFlashRemainingMs > 0 ? '0.85' : '0';

    const currentFps = fps.tick();
    let gridHud: { x: number; y: number; simValue: number; rendered: number | null; curve: number } | null = null;
    if (debugState.lightGrid) {
      // The grid-vs-render agreement readout: the sim's value for the
      // player's cell, what the floor geometry actually renders, and what
      // the curve says it should render. The two right numbers must match.
      const cx = Math.floor(huntState.player.x);
      const cy = Math.floor(huntState.player.z);
      const simValue = lightGrid[cy]?.[cx] ?? 0;
      const rendered = extruded.sampleFloorBrightness(cx, cy);
      gridHud = { x: cx, y: cy, simValue, rendered, curve: gridBrightness(simValue) };
    }
    hudEl.textContent = buildHudLines({
      clockLabel: nightClockLabel(huntState.simTimeMs),
      mission,
      currentFps,
      worstFps: fps.getWorstFps(),
      speed: lastIntent.speed,
      crouched: lastIntent.crouched,
      noiseRadius: radius,
      device: lastIntent.device,
      suspicion: maxSuspicion,
      alertLevel: huntState.alertLevel.level,
      simTimeMs: huntState.simTimeMs,
      boltsUsed: huntState.bolts.length,
      boltCount: THROW.boltCount,
      doors: huntState.doors.map((door) => ({
        id: door.id,
        open: isDoorOpen(door, huntState.simTimeMs, lockdown),
      })),
      guards: debugState.guardDebug
        ? huntState.guards.map((guard) => ({ id: guard.id, state: guard.state, suspicion: guard.suspicion }))
        : [],
      grid: gridHud,
    }).join('\n');

    // Per-frame audio state: listener rides the player, faces where the
    // camera faces; the mutter follows the nearest searching guard; the
    // birds start at dawn and keep going under the report.
    const camForward = new THREE.Vector3();
    followCamera.camera.getWorldDirection(camForward);
    const forwardLen = Math.hypot(camForward.x, camForward.z) || 1;
    let mutterSource: { x: number; z: number } | null = null;
    let mutterDist = Infinity;
    for (const g of huntState.guards) {
      if (g.state === 'searching') {
        const d = Math.hypot(g.x - huntState.player.x, g.z - huntState.player.z);
        if (d < mutterDist) {
          mutterDist = d;
          mutterSource = { x: g.x, z: g.z };
        }
      }
    }
    audio.update(
      {
        listenerX: huntState.player.x,
        listenerZ: huntState.player.z,
        forwardX: camForward.x / forwardLen,
        forwardZ: camForward.z / forwardLen,
        zone: level.cells[Math.floor(huntState.player.z)]?.[Math.floor(huntState.player.x)]?.zone ?? null,
        mutterSource,
        dawn: huntState.mission.phase === 'dawn',
      },
      performance.now(),
    );

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

  // Boot: apply stored settings, land on the kiosk.
  applySettings(settings);
  showKiosk();

  requestAnimationFrame(frame);

  // Verification hooks: __forceFrame manually drives one render+sim frame
  // without relying on requestAnimationFrame, which this test environment's
  // browser automation throttles to near-zero on a backgrounded/unfocused
  // tab (see the Phase 2 PR notes); __begin/__pause/__abandon drive the
  // Phase 6 flow the same way.
  Object.assign(window, {
    __forceFrame: (deltaSeconds = FIXED_STEP_SECONDS) => renderOnce(deltaSeconds),
    __begin: () => beginEngagement(),
    __pause: () => togglePause(),
    __abandon: () => {
      huntState = { ...huntState, mission: abandonMission(huntState.mission, huntState.simTimeMs) };
      pause.hide();
      endEngagement();
    },
    __appState: () => lifecycle.appState,
    __applySettings: (partial: Partial<GameSettings>) => applySettings({ ...settings, ...partial }),
  });
}

main().catch((error) => {
  console.error('Failed to start Tailgate: After Hours:', error);
  const hudEl = document.getElementById('hud');
  if (hudEl) {
    hudEl.textContent = `Failed to load: ${error instanceof Error ? error.message : String(error)}`;
  }
});
