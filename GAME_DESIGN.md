# Tailgate: After Hours - Game Design Document

v0.1 - owner: Craig McCart (Sonofg0tham)
Status: pre-production. This document specifies what CHANGES in the 3D reimagining. Mechanics not mentioned here carry over from the original Tailgate design (see that repo's GAME_DESIGN.md): the detection model, suspicion economy, tailgating rules, noise-as-information, distraction throws, alert levels, checkpoints, secondaries, ratings, and the Engagement Report all return with the same numbers as starting values.

## Pitch

It's 01:00 and the Meridian Mutual HQ tower is down to night staff, a skeleton guard rotation, and you. Same job as ever: get in, plant the device, get out, write it up. But now the building has height, the torches sweep real space, your footsteps land on real floors, and the dark between the desk pools is genuinely yours. The engagement runs until 05:00. Dawn is the deadline.

## Why 3D, in one line

Nothing about the design changes; everything about the FEELING changes. Presence, animation, light and shadow are the whole point of this project.

## Design pillars (one new, three inherited)

1. **The dark is a place, not a filter.** Light sources are gameplay objects: desk pools, torch cones, the vending machine glow. You read the room by its light and move through its shadows. Inherited from Tailgate's Phase 5, promoted to the core.
2. **Observation beats action.** Unchanged.
3. **Sound is information, both ways.** Unchanged, now spatial: you hear a guard's position, not just his presence.
4. **Every mechanic is a real pentest trope.** Unchanged.

## The player in 3D

- Character: low-poly operator (CC0 model, Mixamo-animated). Animation states: idle, walk, run, crouch-idle, crouch-walk, blended by AnimationMixer.
- The three-speed noise model returns EXACTLY as tuned in Tailgate, mapped to animation: creep IS crouch-walk (silent), walk is walk (small noise ring), run is run (large ring). The proven pad scheme carries over unchanged: left-stick magnitude drives speed, keyboard fallback is WASD with Shift creep and C run, nothing bound to Ctrl or Alt.
- Collision: capsule versus extruded walls. No jumping, no climbing, no verticality in v1: the tower's other floors are set dressing seen through windows, the engagement is one floor. (Multi-floor is the v2 headline.)
- Interact, tailgate, and throw return unchanged. Throw aims with the right stick or mouse, exactly the Tailgate mapping.

## The world as data (the core trick)

The floor plan is a 2D grid in JSON, identical in spirit to Tailgate's Tiled maps: cells are floor (with a surface type), wall, door, or furniture. At load, walls extrude to 3D, furniture spawns procedural low-poly props, doors get frames and panels. ALL simulation stays on the grid: vision occlusion is 2D raycast on the grid, noise radii are grid distances, guard pathfinding is A* on walkable cells. The 3D scene is a view of the grid, never the truth. This keeps every hard problem in dimensions we have already solved twice.

## Guards in real time

- Patrols: waypoint routes in JSON with pause points and look directions, as before.
- Vision: the same cone (range, FOV, wall and door occlusion, darkness scaling) computed on the grid, RENDERED as a volumetric torch cone in 3D. The torch is the cone: what the light touches, the guard can see. One object is both the threat and its telegraph.
- States: PATROL / CURIOUS / SEARCHING / ALERT / SWEEP, unchanged, with the colour-plus-shape rule now colour-plus-light-behaviour: patrol is a steady beam, curious is a searching flick, alert is a hard lock plus the red wash. An audio cue accompanies every transition.
- Chase: A* on the grid at chase speed. Detain on contact, checkpoint restart, alert levels and radio rules unchanged.
- The guard is a character now: same rig family as the player, walk/run/look-around clips, a torch in hand. His animation is legible information at a distance.

## Light as cover

- The darkness-scaling rule from Tailgate Phase 5 is now central: suspicion fill scales with how lit the player's cell is. Light level per cell is computed from placed light sources on the grid (cheap and deterministic), not sampled from the renderer.
- Light sources are data: desk lamps, ceiling pools, the server room LED wash, guard torches. Some are switchable (a breaker returns).
- The nystagmus rule is non-negotiable: a visibility floor in config guarantees the player character, nearby walls and interactables always read, regardless of how dark the scene gets. Shipped default favours readability; drama is a knob Craig raises.

## The level: Meridian Mutual HQ, Floor 12

Night configuration of a corporate floor: reception and lift lobby, open-plan office in desk-pool light, kitchen, print room, maintenance corridor with the breaker, the server room, the corner office (executive secondary), and a window-washing platform ledge (exfil flavour). Night staff: two cleaners on schedules and one security guard rotation (two guards, offset routes). Ingress: the goods lift on a timed schedule, the fire stairs door propped by the smokers among the cleaning crew, and a tailgate through the lobby behind the guard shift change. Same rules, new geography.

## Objectives, ratings, report

Unchanged from Tailgate: plant the device (hold, uninterrupted), two photo secondaries, exfil, GHOST / PROFESSIONAL / NOISY / DETAINED, and the one-page Engagement Report in IBM Plex Mono generated from the run's real events, now stamped as a night engagement with the 01:00-05:00 clock.

## Accessibility (real-time edition)

- No twitch inputs: the tailgate window stays generous, interactions are holds, nothing requires precise timing under pressure.
- All state readable by shape, motion and light behaviour, never colour alone. Greyscale check every phase that touches visuals.
- Calm motion defaults, prefers-reduced-motion honoured, every motion and shake behind an intensity knob, screen shake ships at zero.
- HUD text scale, high contrast, visibility floor, and an assist toggle (guard speed 90 percent, no penalty, no shame copy) in settings.
- Pad-first with full keyboard alternative, as proven.

## Measurement discipline (replacing the bot sweep)

- Fixed-timestep simulation with recorded-input replay: any run reproduces exactly from its seed plus input log. A determinism test guards this from Phase 1.
- Telemetry worksheet per playtest: detections, near-misses (cone entries that did not fill), time-in-light, chase escapes. Feel changes are Craig's calls, made against this data.

## Build phases

Each phase: one branch, one PR, CI green, deployed preview, proof shots in docs/phase-N/, Craig merges.

**Phase -1, the spike.** Prove the two genuinely new pipelines while the stakes are a box room: load a CC0 humanoid GLB, retarget and blend three Mixamo clips (idle, walk, run) via AnimationMixer, drive it with the pad scheme, capsule collision against one extruded greybox room, fixed-tilt follow camera with easing, 60fps on the deployed URL. Committed to main as the initial commits, protection after.
Done when: a stranger watching the live URL sees a little person convincingly walking around a room, and the PR records fps plus an honest note on anything GLTF/Mixamo did that was unexpected.

**Phase 0, the skeleton.** Scaffold, ESLint, Vitest wired into CI (typecheck, lint, test, gitleaks, all blocking), fonts, inherited palette module, LICENSE, README stub, CREDITS.md recording fonts plus the model and clip licences verified in the spike, .gitignore.
Done when: CI blocks a deliberately failing PR and passes a clean one.

**Phase 1, the space.** Floor 12 as grid JSON, extrusion, surfaces, procedural furniture props, the full movement set with crouch blending, noise rings, follow camera polished within bounds, HUD, fixed-timestep loop with the replay determinism test.
Done when: creeping through the dark office already feels like being somewhere, and a recorded run replays identically.

**Phase 2, the hunt.** Both guards: waypoint patrols, the grid vision cone rendered as the torch, darkness-scaled suspicion, all five states with light-behaviour telegraphs, A* chase, detain and checkpoint restart, radio and alert levels. Debug overlay: grid truth versus rendered scene. This is the hard phase, the real-time version of the guard AI.
Done when: being hunted through the dark by a torch beam raises Craig's pulse in greybox, and the telemetry worksheet exists.

**Phase 3, doors and people.** Badge doors and the tailgate window, the cleaners on schedules, the three ingress routes, the throw with its aim, noise pings pulling guards.
Done when: van (well, lift lobby) to office interior three ways without a badge, and a guard catching a tailgate goes curious.

**Phase 4, the job.** Objectives, secondaries, exfil, checkpoints, ratings, and the Engagement Report generator (port the pattern, restamp for the night clock).
Done when: full mission playable, all four ratings reached and screenshotted, report matches the event log exactly.

**Phase 5, the night shift.** The full lighting pass (real shadows, the light-source data driving both gameplay and render), spatial synthesised audio (footsteps by surface, the guard audible and locatable through walls, the sting), juice on calm defaults.
Done when: a 30-second clip looks and sounds like the game the first Tailgate was pretending to be.

**Phase 6, ship.** Kiosk menu, settings, balance worksheet final edition, README with the two-predecessor story, CREDITS audit, favicon, cold-cache check, and an itch.io-ready zip of the web build as a build artefact.
Done when: a public URL, a repo, and a zip that uploads to itch unchanged.

## v2 parking lot (do not build in v1)

Multiple floors and verticality, camera rotation, takedowns and body management, the security office camera feed, additional buildings, daily seed, gamepad rumble, first-person peek, mobile, multiplayer never.
