# CLAUDE.md - Tailgate: After Hours

## What this project is

Tailgate: After Hours is a real-time 3D stealth game, the sequel and reimagining of Tailgate (github.com/Sonofg0tham/tailgate). A red teamer on a night engagement infiltrates the Meridian Mutual HQ tower: low-poly 3D, an animated character, guards that hunt through real space, darkness as cover. The proven Tailgate design (detection model, tailgating, noise economy, the Engagement Report) rebuilt in three dimensions.

Third game in Craig McCart's (Sonofg0tham) portfolio, after Tailgate and Patch Tuesday (github.com/Sonofg0tham/patch-tuesday). Ships publicly on Vercel, repo on GitHub.

Full design in GAME_DESIGN.md, which references the original Tailgate design for mechanics that carry over and specifies only what changes in 3D. Read both before feature work. If files disagree, ask Craig.

## Who you're working with

Craig is a security professional and vibe coder. He owns design, architecture direction and all decisions; you write all the code. He has now directed two complete games through this exact phased-PR workflow. Keep explaining Git, CI and any genuinely new machinery (GLTF, animation mixing, pathfinding) in plain English when it first appears.

- Explain every change in plain English: what was built, why, how to test it by playing.
- Decisions: one recommendation plus one alternative, plain reasons. Not a menu.
- Craig has dyspraxia and nystagmus. Real-time is new territory for this portfolio, so the accessibility rules in GAME_DESIGN.md are load-bearing, not optional: no twitch inputs, generous windows, no state by colour alone, calm motion defaults.
- UK English everywhere. No em-dashes anywhere in this project. Comma, hyphen, or full stop.

## Stack

- Three.js + TypeScript (strict) + Vite. No game engine. No physics engine: character collision is a capsule against walls extruded from the grid floor plan, written plainly.
- THE LEVEL IS STILL DATA: the floor plan is authored as a 2D grid in JSON (the Tailgate pattern) and extruded to 3D geometry at load. Walls, doors, zones and surfaces stay hand-editable numbers. All sensing (vision, noise, pathfinding) runs on the 2D grid; only rendering is 3D. This is the project's core risk-reduction trick, do not abandon it.
- Character and guards: CC0 low-poly humanoid models animated with clips (idle, walk, run, crouch-idle, crouch-walk) via THREE.AnimationMixer. As proven in the Phase -1 spike, the character and guard rigs share KayKit's "Rig_Medium" skeleton across both the body meshes (KayKit Adventurers) and the animation-library files (KayKit Adventurers for idle/walk/run, KayKit Character Animations for crouch-idle/crouch-walk), so clips bind directly with no cross-skeleton retargeting step. Mixamo is not part of this project. This project relaxes the zero-asset-file rule for models and animation clips ONLY: verify each licence before committing, record exact terms per file in CREDITS.md, and flag anything that is not clearly licensed for game use. Everything else stays procedural, and all audio stays synthesised via the shared module pattern (keyed by name, file-swap escape hatch, spatialised with PannerNode).
- Camera: fixed-tilt follow camera (tilted overhead, eased follow, zoom within bounds). No player camera rotation in v1.
- Hosting: Vercel. localStorage for settings and best ratings. No backend, no analytics.
- Node LTS, npm.

## Commands

`npm run dev` / `build` / `typecheck` / `lint` / `test`. A phase is not done if any fail.

## CI (from Phase 0)

GitHub Actions on every PR: typecheck, lint, test (Vitest), gitleaks, all blocking required checks on main, cribbed from the Patch Tuesday workflow. LICENSE (MIT, fonts and models under their own licences) exists from Phase 0, not Phase 6.

## Visual identity (inherited, never default)

After Hours inherits the Tailgate identity because it is the same product line:

- Palette: near-black `#0E1116`, clearance amber `#FFB000` primary, alarm red `#FF3B30` reserved exclusively for detection and alarm states, cool grey `#C7CDD4` text.
- Display font: Saira Condensed. Mono: IBM Plex Mono (HUD, the Engagement Report). Bundled via Fontsource, never CDN-fetched.
- Signature detail: access-control UI throughout (sign-in kiosk menu, lanyard pause, the one-page pentest Engagement Report), now framed as a NIGHT engagement: the clock runs 01:00 to 05:00, and darkness is the fiction, not just the lighting.

## How to work

The full discipline from the first two games applies:

1. One phase at a time, one branch per phase, PR to main, CI green, preview URL, plain-English PR description, then stop for Craig's review and merge.
2. Data-driven everything: floor plan, patrol routes, schedules, door permissions, detection numbers, all JSON or config.
3. Instrument, don't tune. Real-time changes the measurement discipline: the bot-sweep method from Patch Tuesday does not transfer, so its replacements are (a) a fixed-timestep deterministic sim with recorded-input replay, so any run can be reproduced and regressions caught, and (b) instrumented playtests, detection events, near-misses, time-in-cone logged to a worksheet. Feel decisions are Craig's, made with the pad, informed by the telemetry. Never tune feel numbers unilaterally.
4. Proof screenshots to docs/phase-N/ every phase, standing rule, via the Playwright capture route.
5. Greybox first. Small commits, conventional messages. Parking-lot items need Craig's explicit confirmation.

## Security hygiene

No secrets ever, .env gitignored from Phase 0, gitleaks blocking from the first PR, new dependencies justified in the PR with npm audit flagged. Model and animation files get licence verification BEFORE they land in a commit.

## Out of scope for v1

Do not build without explicit confirmation: camera rotation, takedowns or combat, multiple buildings, first-person or over-shoulder cameras, cutscenes, mobile or touch, accounts, and multiplayer never. Full parking lot in GAME_DESIGN.md.
