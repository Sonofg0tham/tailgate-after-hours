# Tailgate: After Hours

It's 01:00 and the Meridian Mutual HQ tower is down to night staff, a skeleton
guard rotation, and you. Same job as ever: get in, plant the device, get out,
write it up. But now the building has height, the torches sweep real space,
and the dark between the desk pools is genuinely yours.

Third game in the [Sonofg0tham](https://github.com/Sonofg0tham) security
games series, the 3D reimagining of
[Tailgate](https://github.com/Sonofg0tham/tailgate), after
[Patch Tuesday](https://github.com/Sonofg0tham/patch-tuesday).

Full design in [GAME_DESIGN.md](GAME_DESIGN.md).

Status: in development, Phase 0. Full design in [GAME_DESIGN.md](GAME_DESIGN.md).

## Stack

Three.js, TypeScript (strict) and Vite. No game engine, no physics library:
character collision is a hand-written capsule against extruded walls. The
floor plan stays 2D grid data, extruded to 3D at load — the same
risk-reduction trick as Tailgate. It deploys to Vercel as a static build,
with no backend, no accounts and no analytics; settings and best ratings
live in localStorage.

## Development

```bash
npm install
npm run dev        # local dev server
npm run build      # production build (typecheck + Vite)
npm run typecheck  # TypeScript, no emit
npm run lint       # ESLint
npm test           # Vitest
```

Every pull request must pass typecheck, lint, the test suite and a gitleaks
secret scan in CI before it can merge to main.

## Licence

Code is [MIT](LICENSE). The bundled character model, animation clips, and
fonts are recorded in [CREDITS.md](CREDITS.md).
