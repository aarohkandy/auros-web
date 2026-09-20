/**
 * AUROS — palette mapping and canvas painting.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * NOTE ON 19
 * Spec §7 states a maximum of 18 colours and then lists nineteen values:
 *
 *   sky 4 · cloud 2 · far hills 2 · trees 2 · grass 1 · soil 2 · strata 4 · ore 2  =  19
 *
 * One had to go. The one that went is **far hills** (`#A8AFA2`, `#8E968C`), for the reason §7
 * itself gives: the background must always be carrying meaning. Every other colour names a
 * thing in the architecture — sky is the claim, trees and grass are the machine's surface, soil
 * is your apps, the four strata are the image stack, ore marks where one image layer ends and
 * the next begins. Distant hills name nothing. They are the one purely scenic element in the
 * list, so they are the one that is scenery, so they are the one that is deleted.
 *
 * The freed slot is spent on `STAR`, which is not a new colour: in light theme it is mapped to
 * exactly `SKY_0`, so it contributes no nineteenth value to the light palette and is invisible.
 * It exists so that the dark theme's single-pixel stars are already in the generated buffer and
 * a theme switch is a palette remap rather than a regeneration. That is §7's dark-theme rule
 * ("same seed, different palette mapping") made structural.
 *
 * Flagged for the human as a spec arithmetic conflict rather than resolved quietly. If the
 * intended reading was 18 *per theme* with hills kept and something else dropped, this is a
 * one-line change to the two tables below and nothing else moves.
 *
 * DARK THEME
 * §7 gives dark theme exactly three instructions: sky becomes `#171C24` / `#1E242C`, strata
 * darken, ore stays. Those are followed literally. "Strata darken" is implemented as a single
 * documented multiply rather than by hand-picking eleven new hex values, because hand-picked
 * values would be eleven new colours invented by an agent in a design system the spec calls
 * "fixed, not open to reinterpretation". The two sky values are used as given and repeated
 * across the four band indices — a two-step night sky, not four steps we made up.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 */

import { PALETTE_SIZE, PX, TRANSPARENT } from "./strata";
import type { CloudBuffer, TerrainBuffer } from "./terrain";

export type Theme = "light" | "dark";

/** `#rrggbb` → `[r, g, b]`. Throws on anything else; a malformed colour is a typo, not a state. */
function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`auros/terrain: bad colour "${hex}"`);
  const n = Number.parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * The documented "strata darken" transform. A plain multiply in sRGB.
 *
 * Not gamma-correct, and that is deliberate: a gamma-correct darken preserves relative
 * lightness and produces a night scene that still reads as daylight turned down. A naive
 * multiply crushes the midtones, which is what an unlit landscape actually looks like.
 */
function darken(hex: string, factor: number): string {
  const [r, g, b] = rgb(hex);
  const to2 = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * factor)))
      .toString(16)
      .padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

const NIGHT = 0.55;

/**
 * §7's palette, in palette-index order. Exactly `PALETTE_SIZE` entries, asserted at module load.
 *
 * These are literals rather than `var(--token)` lookups because a canvas paints numbers, not
 * CSS. `src/styles/tokens.css` is expected to define the same values for the DOM side; if the
 * two ever disagree the terrain and the panels will visibly mismatch, which is the cheapest
 * possible way to notice. (TODO once `tokens.css` lands: have `tools/contrast.mjs` — or a
 * sibling check — read both and fail the build on divergence. The values below are the §7
 * source of truth in the meantime.)
 */
const LIGHT: readonly string[] = [
  "#C9D6DE", // SKY_0   zenith
  "#D6DCDC", // SKY_1
  "#E2DDD0", // SKY_2
  "#EFE6D4", // SKY_3   horizon
  "#C9D6DE", // STAR    == SKY_0. Present in the buffer, invisible on screen.
  "#F4F1EA", // CLOUD_HI
  "#E6E0D2", // CLOUD_LO
  "#6E7A66", // TREE_HI
  "#57624F", // TREE_LO
  "#7D8A63", // GRASS
  "#8A7358", // SOIL_HI
  "#6F5C46", // SOIL_LO
  "#5A4E40", // ROCK_1  stratum 1 body — your recipe
  "#463E34", // ROCK_2  grain
  "#33302A", // ROCK_3  stratum 2 body — auros-base:hardened
  "#24231F", // ROCK_4  bedrock body — Fedora · Universal Blue
  "#BE3A12", // ORE
  "#D9682E", // ORE_2
];

const DARK: readonly string[] = [
  "#171C24", // SKY_0   §7 dark sky, as given
  "#171C24", // SKY_1
  "#1E242C", // SKY_2   §7 dark sky, as given
  "#1E242C", // SKY_3
  "#E6E0D2", // STAR    the §7 cloud tone, reused; no new colour is introduced
  "#24231F", // CLOUD_HI  night cloud: the §7 deepest stratum tone, lighter than the night sky
  "#1E242C", // CLOUD_LO  fades into the sky near the horizon, which is what night cloud does
  darken("#6E7A66", NIGHT),
  darken("#57624F", NIGHT),
  darken("#7D8A63", NIGHT),
  darken("#8A7358", NIGHT),
  darken("#6F5C46", NIGHT),
  darken("#5A4E40", NIGHT),
  darken("#463E34", NIGHT),
  darken("#33302A", NIGHT),
  darken("#24231F", NIGHT),
  "#BE3A12", // ORE     §7: "ore stays"
  "#D9682E", // ORE_2
];

if (LIGHT.length !== PALETTE_SIZE || DARK.length !== PALETTE_SIZE) {
  throw new Error(
    `auros/terrain: palette must be exactly ${PALETTE_SIZE} entries (§7 ceiling)`,
  );
}

export const PALETTES: Readonly<Record<Theme, readonly string[]>> = {
  light: LIGHT,
  dark: DARK,
};

/**
 * The flat colour the page falls back to with JavaScript disabled or before generation lands.
 *
 * §7 requires the terrain to degrade to a plain solid background. This is the horizon band —
 * the tone the reader would see at the top of the page — so the flat state is the same colour
 * family as the rendered state rather than a jarring substitute.
 */
export const FALLBACK_BACKGROUND: Readonly<Record<Theme, string>> = {
  light: LIGHT[PX.SKY_3]!,
  dark: DARK[PX.SKY_0]!,
};

/** Little-endian is near-universal, but the packed-uint32 fast path must not assume it. */
const LITTLE_ENDIAN = (() => {
  const probe = new Uint32Array(1);
  new Uint8Array(probe.buffer)[0] = 1;
  return probe[0] === 1;
})();

/** Palette as packed 32-bit pixels in the platform's byte order, plus a transparent slot. */
function packed(theme: Theme): Uint32Array {
  const hexes = PALETTES[theme];
  const out = new Uint32Array(256);
  for (let i = 0; i < PALETTE_SIZE; i++) {
    const [r, g, b] = rgb(hexes[i]!);
    out[i] = LITTLE_ENDIAN
      ? (255 << 24) | (b << 16) | (g << 8) | r
      : (r << 24) | (g << 16) | (b << 8) | 255;
  }
  out[TRANSPARENT] = 0;
  return out;
}

const PACKED: Record<Theme, Uint32Array> = {
  light: packed("light"),
  dark: packed("dark"),
};

/**
 * Indices → RGBA bytes.
 *
 * Writes through a `Uint32Array` view, one store per pixel instead of four. On a 960×1600 world
 * that is 1.5 million stores rather than 6.1 million, and it is the difference between the
 * repaint on a theme toggle being unnoticeable and being a visible hitch.
 *
 * `out` may be reused across calls — pass the same buffer on a theme switch and no allocation
 * happens at all.
 */
export function paint(
  indices: Uint8Array,
  theme: Theme,
  out?: Uint8ClampedArray,
): Uint8ClampedArray {
  const rgba = out ?? new Uint8ClampedArray(indices.length * 4);
  if (rgba.length !== indices.length * 4) {
    throw new Error("auros/terrain: output buffer is the wrong size");
  }
  const words = new Uint32Array(rgba.buffer, rgba.byteOffset, indices.length);
  const lut = PACKED[theme];
  for (let i = 0; i < indices.length; i++) words[i] = lut[indices[i]!]!;
  return rgba;
}

/** Number of distinct RGBA values actually present. What `terrain.test.ts` counts against 18. */
export function countDistinctColours(rgba: Uint8ClampedArray): number {
  const words = new Uint32Array(rgba.buffer, rgba.byteOffset, rgba.length / 4);
  const seen = new Set<number>();
  for (let i = 0; i < words.length; i++) seen.add(words[i]!);
  return seen.size;
}

/** A 2D context, whether it came from a `<canvas>` or an `OffscreenCanvas`. */
type AnyCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Paint a generated buffer onto a canvas at exactly one device pixel per logical block.
 *
 * The canvas is *block-resolution*. It is CSS that scales it up to 4 px per block with
 * `image-rendering: pixelated`, which is what keeps memory at 1.5 million pixels instead of 24
 * auros-allow: 'guarantees' below describes a mechanism (integer alignment), not a promise to anyone.
 * million on a retina display, and is also what guarantees every block edge lands on an integer
 * device pixel. Drawing at device resolution and relying on `imageSmoothingEnabled = false`
 * would be the same picture at sixteen times the cost.
 */
export function paintToCanvas(
  ctx: AnyCtx,
  buffer: TerrainBuffer | CloudBuffer,
  theme: Theme,
  scratch?: Uint8ClampedArray,
): Uint8ClampedArray {
  const rgba = paint(buffer.indices, theme, scratch);
  // A view over the same bytes, not a copy. The cast is only to tell TypeScript the backing
  // store is a plain ArrayBuffer rather than possibly a SharedArrayBuffer, which `ImageData`
  // will not accept; nothing is reallocated.
  const view = new Uint8ClampedArray(rgba.buffer as ArrayBuffer, rgba.byteOffset, rgba.length);
  ctx.putImageData(new ImageData(view, buffer.width, buffer.height), 0, 0);
  return rgba;
}
