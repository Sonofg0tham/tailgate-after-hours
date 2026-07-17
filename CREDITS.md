# Credits

Every third-party asset in this repo gets a line here in the same commit that adds it.
Treat this file as an SBOM for assets. An asset with no entry here is a bug.

Format: `filename | source URL | author | licence`

## Character model and animation

All four files below share Kay Lousberg's "Rig_Medium" humanoid skeleton
unmodified, so every clip binds directly onto the character mesh with no
cross-skeleton retargeting, and Mixamo was never used (see "Why this pack,
and why not Mixamo" below).

- public/models/rogue_hooded.glb | https://kaylousberg.itch.io/kaykit-adventurers | Kay Lousberg | CC0 1.0
  (character mesh + skeleton, "Rogue_Hooded" from **KayKit - Character Pack: Adventurers**, standing in for the operator;
  reused as-is for the Phase 3 cleaners too — a placeholder, no distinct civilian body sourced yet)
- public/models/rig_medium_general.glb | https://kaylousberg.itch.io/kaykit-adventurers | Kay Lousberg | CC0 1.0
  (from **KayKit - Character Pack: Adventurers**; the `Idle_A` clip is used)
- public/models/rig_medium_movementbasic.glb | https://kaylousberg.itch.io/kaykit-adventurers | Kay Lousberg | CC0 1.0
  (from **KayKit - Character Pack: Adventurers**; the `Walking_A` and `Running_A` clips are used)
- public/models/rig_medium_movementadvanced.glb | https://kaylousberg.itch.io/kaykit-character-animations | Kay Lousberg | CC0 1.0
  (from **KayKit - Character Animations**, added Phase 1; the `Crouching` and `Sneaking` clips are used for crouch-idle and crouch-walk, replacing the spike's slowed-walk placeholder)
- public/models/knight.glb | https://kaylousberg.itch.io/kaykit-adventurers | Kay Lousberg | CC0 1.0
  (added Phase 2; "Knight" from the same already-verified **KayKit - Character Pack: Adventurers**, same Rig_Medium skeleton, used for both guards — no new download or licence check needed, same pack as the player body)

Both packs' licences were verified the same way: downloaded directly from
itch.io's free tier (no login required — click through "no thanks, just take
me to the downloads"), then read verbatim from the pack's own `License.txt`:
Creative Commons Zero v1.0 Universal (CC0), "free to use in personal,
educational and commercial projects", attribution not required.

### Why this pack, and why not Mixamo

GAME_DESIGN.md's original Phase -1 wording said "retarget and blend three
Mixamo clips". Craig redirected this before that work started: try a CC0
pack that already ships its own animations on a shared skeleton first, since
that needs no Adobe login and carries no retargeting risk. KayKit's
Adventurers pack covered idle/walk/run out of the box, and the separate
Character Animations pack (same skeleton, same publisher, same licence)
covers crouch-idle and crouch-walk too — so Mixamo was never used, in Phase
-1 or here.

## First-party assets (listed so the audit trail is complete)

- public/favicon.svg | hand-authored in this repo (an access badge in the
  project palette) | Craig McCart / Sonofg0tham | MIT, same as the code

## Fonts

Both bundled as npm packages via Fontsource, both licensed under the SIL Open
Font License 1.1. Vite emits the woff2 files into the build; nothing is
fetched from a CDN at runtime.

| Font | Use | Licence | Source |
| --- | --- | --- | --- |
| Saira Condensed | Display: menus, headings (inherited from Tailgate) | [SIL Open Font License 1.1](https://openfontlicense.org) | [Fontsource](https://fontsource.org/fonts/saira-condensed) |
| IBM Plex Mono | Monospace: HUD readouts, the Engagement Report (inherited from Tailgate) | [SIL Open Font License 1.1](https://openfontlicense.org) | [Fontsource](https://fontsource.org/fonts/ibm-plex-mono), design by IBM |
