# Credits

Every third-party asset in this repo gets a line here in the same commit that adds it.
Treat this file as an SBOM for assets. An asset with no entry here is a bug.

Format: `filename | source URL | author | licence`

## Character model and animation (Phase -1, the spike)

All three files below are from **KayKit - Character Pack: Adventurers** by Kay
Lousberg, downloaded directly from itch.io (free tier, no login required).
Licence verified from the pack's own `License.txt`: Creative Commons Zero v1.0
Universal (CC0), "free to use in personal, educational and commercial
projects", attribution not required. Rig is Kay Lousberg's shared "Rig_Medium"
humanoid skeleton, used unmodified across the character mesh and both
animation-library files, so no cross-skeleton retargeting was needed for this
phase.

- public/models/rogue_hooded.glb | https://kaylousberg.itch.io/kaykit-adventurers | Kay Lousberg | CC0 1.0
  (character mesh + skeleton, "Rogue_Hooded" from the pack, standing in for the operator)
- public/models/rig_medium_general.glb | https://kaylousberg.itch.io/kaykit-adventurers | Kay Lousberg | CC0 1.0
  (animation library; the `Idle_A` clip is used)
- public/models/rig_medium_movementbasic.glb | https://kaylousberg.itch.io/kaykit-adventurers | Kay Lousberg | CC0 1.0
  (animation library; the `Walking_A` and `Running_A` clips are used)

### Why this pack, and why not Mixamo

GAME_DESIGN.md's Phase -1 wording says "retarget and blend three Mixamo
clips". Craig redirected this before work started: try a CC0 pack that
already ships its own animations on a shared skeleton first, since that needs
no Adobe login and carries no retargeting risk. KayKit's Adventurers pack
covers idle/walk/run out of the box on its `Rig_Medium` skeleton, so Mixamo
was never used.

For later phases needing crouch: the separate, also-CC0, also-login-free
**KayKit - Character Animations** pack
(https://kaylousberg.itch.io/kaykit-character-animations) was downloaded and
inspected (not committed here, as Phase -1 doesn't use it) to confirm
coverage. Its `Rig_Medium_MovementAdvanced.glb` file, on the same
`Rig_Medium` skeleton, includes `Crouching` and `Sneaking` clips — so
crouch-idle and crouch-walk are covered too when Phase 1 needs them, still
without Mixamo.

## Fonts

Both bundled as npm packages via Fontsource, both licensed under the SIL Open
Font License 1.1. Vite emits the woff2 files into the build; nothing is
fetched from a CDN at runtime.

| Font | Use | Licence | Source |
| --- | --- | --- | --- |
| Saira Condensed | Display: menus, headings (inherited from Tailgate) | [SIL Open Font License 1.1](https://openfontlicense.org) | [Fontsource](https://fontsource.org/fonts/saira-condensed) |
| IBM Plex Mono | Monospace: HUD readouts, the Engagement Report (inherited from Tailgate) | [SIL Open Font License 1.1](https://openfontlicense.org) | [Fontsource](https://fontsource.org/fonts/ibm-plex-mono), design by IBM |
