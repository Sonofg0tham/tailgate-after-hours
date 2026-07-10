/**
 * Render-side lighting tuning for Phase 5, "the night shift". Every number
 * here is a look knob, not a sim value — the GAMEPLAY light grid lives in
 * src/systems/LightModel.ts and src/config/lighting.ts and is never touched
 * from here. The render's agreement with that grid is structural: floor and
 * wall vertex colours are computed FROM grid values through `grid` below
 * (a monotone curve, unit-tested in Extruder.test.ts), so the scene cannot
 * show light where the sim says dark.
 *
 * Defaults favour readability per CLAUDE.md's accessibility rules (the
 * nystagmus visibility floor is load-bearing). Craig's pad pass tunes.
 */
export const RENDER_LIGHTING = {
  /**
   * Grid-value (0-1) to rendered-brightness curve for floor and wall vertex
   * colours: brightness = min + (max - min) * value^gamma. `min` is how
   * visible pitch-dark geometry stays (the scene half of the visibility
   * floor — architecture always faintly reads); `max` above 1 lets lit
   * pools genuinely glow against the dark albedos; `gamma` > 1 crushes the
   * low end so darkness reads dark.
   */
  grid: {
    min: 0.32,
    max: 2.3,
    gamma: 1.15,
  },

  /** Ambient light for DYNAMIC objects only (characters, furniture, door panels) — floors/walls are grid-lit and ignore it. */
  ambient: {
    color: 0x67707f,
    intensity: 0.5,
  },

  /**
   * The nystagmus visibility floor's character half: a small no-shadow fill
   * light following the player so the operator always reads, whatever the
   * cell's darkness. Concealment is unchanged — the sim never sees this.
   */
  playerFill: {
    color: 0xcfd6e4,
    intensity: 0.85,
    distanceMetres: 2.8,
    heightMetres: 1.4,
  },

  /** One small point light per placed source, shading characters/furniture near it. No shadows (static occlusion is the grid's job). */
  sourceLights: {
    color: 0xffe2b0,
    intensity: 1.8,
    /** Light reach = source radius times this (kept tighter than the gameplay radius so pools read pooled). */
    distanceScale: 0.85,
    heightMetres: 2.2,
  },

  /** The guard torch: a real SpotLight with shadows, married to the beam cone (the beam IS the cone). */
  torch: {
    color: 0xffe8c2,
    /** Alarm-state wash: red stays reserved for detection. */
    lockedColor: 0xff5a4d,
    intensity: 22,
    /** Metres past the vision range the light itself carries (soft tail beyond the hard cone edge). */
    overreachMetres: 1,
    penumbra: 0.4,
    decay: 1.2,
    heightMetres: 1.3,
    shadowMapSize: 1024,
    shadowBias: -0.0035,
    /** Flicker depth while curious/searching, fraction of intensity. */
    flickerDepth: 0.35,
  },

  /** Emissive fixture glow colours (self-lit meshes at each source, styled by zone). */
  fixtures: {
    ceilingPanel: 0xfff3d6,
    deskLamp: 0xffd9a0,
    serverLed: 0xa8dcff,
    vendingGlow: 0xbde4ea,
  },
} as const;

/** The monotone grid-value -> rendered-brightness curve. Exported for the Extruder and its agreement tests. */
export function gridBrightness(value: number): number {
  const { min, max, gamma } = RENDER_LIGHTING.grid;
  const clamped = Math.max(0, Math.min(1, value));
  return min + (max - min) * Math.pow(clamped, gamma);
}
