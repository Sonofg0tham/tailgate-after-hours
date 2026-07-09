// The visual identity, decided in CLAUDE.md and inherited unchanged from
// Tailgate. Single source of truth for every colour in the game: TypeScript
// reads these values directly (PALETTE_HEX for Three.js materials, PALETTE
// for anything that wants a CSS string) and applyPaletteToCss() mirrors them
// onto :root as CSS custom properties, so the DOM UI and the 3D scene can
// never drift apart.

export const PALETTE = {
  base: '#0E1116', // near-black background, the tower at 01:00
  amber: '#FFB000', // clearance amber, the primary UI colour
  alarm: '#FF3B30', // reserved exclusively for detection and alarm states
  text: '#C7CDD4', // cool grey UI text
} as const;

export const PALETTE_HEX = {
  base: 0x0e1116,
  amber: 0xffb000,
  alarm: 0xff3b30,
  text: 0xc7cdd4,
} as const;

export const FONTS = {
  display: '"Saira Condensed", sans-serif',
  mono: '"IBM Plex Mono", monospace',
} as const;

export type PaletteKey = keyof typeof PALETTE;

// Writes every palette entry onto :root as --kebab-case custom properties,
// so stylesheets consume the same values instead of hardcoding hex codes.
export function applyPaletteToCss(root: HTMLElement = document.documentElement): void {
  for (const [key, value] of Object.entries(PALETTE)) {
    root.style.setProperty(`--${key}`, value);
  }
}
