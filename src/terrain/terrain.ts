/**
 * AUROS — terrain generator. Pure, seeded, deterministic, no DOM.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS PRODUCES
 * A `Uint8Array` of palette *indices*, one byte per logical block. Not colours. Colours are
 * applied in `render.ts`, which is what makes theme switching a repaint rather than a
 * regeneration (§7 dark theme: "same seed, different palette mapping").
 *
 * WHY EVERY RANDOM DRAW IS POSITIONAL
 * There is no `rng.next()` stream anywhere below. Every value is `hash(seed, salt, x, y)`.
 * That is a hard design rule, not a style choice, and it buys two things:
 *
 *   1. The world can be generated in *windows*. A phone allocates 98 columns of a 960-column
 *      world and gets byte-identical bytes to columns 431..528 of the full generation. A
 *      stream-based PRNG cannot do that — the sequence depends on how much you drew before.
 *   2. Determinism is structural rather than incidental. Reordering loops cannot change output.
 *
 * `terrain.test.ts` asserts the window property directly, because it is the kind of property
 * that is easy to believe and easy to be wrong about.
 *
 * WHY THE WORLD WIDTH IS FIXED AT 960 BLOCKS
 * §7 says the terrain is identical on every visit — "it is the brand". If the world width
 * followed the viewport, a phone and a laptop would show different landscapes and the brand
 * claim would be false. So the world is always 960 blocks (3840 CSS px) wide and a narrow
 * viewport is shown a *centred crop of the same world*. The noise is periodic in x, so the crop
 * has no seam and a viewport wider than the world tiles cleanly.
 *
 * QUANTISATION
 * Every boundary height is `Math.round`ed to an integer block before anything is written, and
 * every write is a whole block. There is no path in this file that can emit a half-covered
 * pixel, so there are no anti-aliased diagonals — not because we avoided them, but because the
 * representation cannot express one.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 */

import {
  ORE_SEAMS,
  PALETTE_SIZE,
  PX,
  STRATA,
  TRANSPARENT,
} from "./strata.ts";

// ── The seed contract ─────────────────────────────────────────────────────────────────────
// Changing any constant in this block changes the brand. Treat it like a logo file.

/** Logical block size in CSS pixels. §7, fixed. */
export const BLOCK_PX = 4;

/** 0x4155524F — the ASCII bytes of "AURO". Fixed forever; this is the identity. */
export const WORLD_SEED = 0x4155524f;

/** Blocks. 960 × 4px = 3840 CSS px — wider than any common viewport, so no one sees an edge. */
export const WORLD_WIDTH = 960;

/** Blocks. 1600 × 4px = 6400 CSS px of descent from sky to bedrock. */
export const WORLD_HEIGHT = 1600;

/**
 * Blocks. The cloud field repeats every 240 blocks (960 CSS px), which is what lets the drift
 * animation be a plain CSS `translateX` loop with no JavaScript running per frame.
 */
export const CLOUD_PERIOD = 240;

/** Blocks of sky given to the cloud layer. Clouds never appear below the horizon. */
export const CLOUD_BAND_HEIGHT = Math.round(STRATA[1]!.top * WORLD_HEIGHT);

// ── PRNG ──────────────────────────────────────────────────────────────────────────────────

/**
 * mulberry32. Written out rather than imported: §7's "identical on every visit" is a promise
 * about bytes, and a promise about bytes cannot depend on a dependency's patch releases.
 *
 * `Math.random()` is never called in this package. `terrain.test.ts` does not merely assert the
 * output is stable — it replaces `Math.random` with a thrower and regenerates the world, so a
 * future edit that reaches for it fails the suite instead of silently making the brand drift.
 */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    return mulberry32Step(a);
  };
}

/**
 * One mulberry32 draw from an already-advanced state, with no closure.
 *
 * This exists because of a measured problem, not a style preference. `hash()` below is called
 * about 1.4 million times per generation, and when it was written as `mulberry32(h)()` each of
 * those calls allocated a function object. That allocation, not the arithmetic, was the largest
 * single cost in the generator.
 *
 * `mulberry32(h)()` and `mulberry32Step((h + 0x6d2b79f5) | 0)` are the same value by
 * construction, and `terrain.test.ts` asserts it across a range of inputs rather than trusting
 * that reading — an optimisation that quietly changes the output would change the brand.
 */
export function mulberry32Step(a: number): number {
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * One mulberry32 draw from a coordinate, rather than from a position in a stream.
 *
 * The three `Math.imul` rounds before the draw are avalanche, not decoration: mulberry32 seeded
 * with 1, 2, 3… produces visibly correlated first draws, which would show up as diagonal banding
 * across the terrain. Verified by eye at 4px blocks, where correlation is very hard to hide.
 */
function hash(seed: number, salt: number, x: number, y = 0): number {
  let h = seed ^ 0x9e3779b9;
  h = Math.imul(h ^ salt, 0x27d4eb2d);
  h = Math.imul(h ^ x, 0x85ebca6b);
  h = Math.imul(h ^ y, 0xc2b2ae35);
  h ^= h >>> 16;
  return mulberry32Step((h + 0x6d2b79f5) | 0);
}

/** Salts. Distinct integers so two features never share a draw at the same coordinate. */
const SALT = {
  relief: 0x51,
  vein: 0x52,
  ore: 0x53,
  oreTone: 0x54,
  grain: 0x55,
  star: 0x56,
  tree: 0x57,
  treeShade: 0x58,
  cloud: 0x59,
  cloudEdge: 0x5a,
} as const;

// ── Value noise ───────────────────────────────────────────────────────────────────────────

/** Positive modulo. `-1 % 960` is `-1` in JavaScript and that would break the x-periodicity. */
function wrap(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/**
 * One octave of 1-D value noise, periodic over `period` blocks.
 *
 * `spacing` must divide `period` or the wrap is not seamless — asserted in `terrain.test.ts`
 * rather than here, because this runs a few hundred thousand times per generation.
 */
function noise1(
  x: number,
  spacing: number,
  salt: number,
  seed: number,
  period: number,
): number {
  const lattice = period / spacing;
  const i = Math.floor(x / spacing);
  const t = x / spacing - i;
  const a = hash(seed, salt, wrap(i, lattice));
  const b = hash(seed, salt, wrap(i + 1, lattice));
  const s = t * t * (3 - 2 * t); // smoothstep: C1, so no visible lattice creases
  return a + (b - a) * s;
}

/** Octave spacings. All divide 960. Amplitudes halve, which is the usual fBm arrangement. */
const OCTAVES: readonly (readonly [spacing: number, amplitude: number])[] = [
  [240, 0.46],
  [120, 0.26],
  [60, 0.16],
  [30, 0.08],
  [16, 0.04],
];

/** Layered value noise in −0.5..+0.5. Sums to 1.0 amplitude, then re-centres. */
function fbm(x: number, salt: number, seed: number, period: number): number {
  let sum = 0;
  for (const [spacing, amp] of OCTAVES) sum += noise1(x, spacing, salt, seed, period) * amp;
  return sum - 0.5;
}

// ── Public shapes ─────────────────────────────────────────────────────────────────────────

export interface TerrainRequest {
  /** Defaults to `WORLD_SEED`. Only a test has any business passing anything else. */
  seed?: number;
  worldWidth?: number;
  worldHeight?: number;
  /** Leftmost world column of the window to generate. Wraps. Defaults to a centred crop. */
  x0?: number;
  /** Window width in blocks. Defaults to the whole world. */
  width?: number;
}

export interface TerrainStats {
  /** Pixels written, i.e. `width * height`. */
  readonly pixels: number;
  /** Count per palette index. Length `PALETTE_SIZE`. */
  readonly histogram: Uint32Array;
  /** `PX.ORE` + `PX.ORE_2`. */
  readonly oreCount: number;
  /** Ore as a fraction of all pixels. §7 ceiling is 0.02. */
  readonly oreFraction: number;
  /** How many of the 18 indices actually appear. */
  readonly distinctIndices: number;
  /** Nominal boundary rows used, in blocks — what `parallax.ts` publishes to CSS. */
  readonly boundaryRows: readonly number[];
}

export interface TerrainBuffer {
  readonly width: number;
  readonly height: number;
  readonly x0: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly seed: number;
  /** `width * height` palette indices, row-major, top-left origin. */
  readonly indices: Uint8Array;
  readonly stats: TerrainStats;
}

// ── Column geometry ───────────────────────────────────────────────────────────────────────

/**
 * The displaced top edge of each stratum for a given world column, in whole blocks.
 *
 * Each boundary gets its own salt and its own relief amplitude, so they wobble independently —
 * strata that all undulate in sync read as one striped object rather than as separate deposits,
 * and the whole point is that these are separate things stacked on each other.
 *
 * Exported because `terrain.test.ts` needs the exact boundary of each column to prove that no
 * ore pixel exists outside a seam band. A test that re-implemented this would be testing its
 * own copy.
 *
 * Monotonicity is forced afterwards. Independent noise can cross two boundaries over, and a
 * crossed boundary would draw stratum 2 above stratum 1, which would be a diagram that lies.
 */
export function columnBoundaries(
  worldX: number,
  seed: number,
  worldHeight: number,
  worldWidth: number,
): Int32Array {
  // One shared landform, scaled down layer by layer, plus a small independent component.
  //
  // Real strata are conformable: a deeper bed carries the shape of the ones above it, flattened.
  // Five independent noise fields would cross each other, and a crossed boundary would draw
  // stratum 2 above stratum 1 — a diagram that lies. The clamp below would then straighten them
  // out, which is exactly the flat layer-cake this is not supposed to be.
  //
  // It also happens to be the thing the picture is saying: the surface is weather, the bedrock
  // is not. Upstream does not move under you.
  const shared = fbm(worldX, SALT.relief, seed, worldWidth);
  const rows = new Int32Array(STRATA.length);
  for (let i = 0; i < STRATA.length; i++) {
    const s = STRATA[i]!;
    const own = fbm(worldX, SALT.relief + 1 + i, seed, worldWidth);
    const displaced =
      s.top * worldHeight + (shared * 0.8 + own * 0.2) * s.reliefBlocks;
    rows[i] = Math.round(displaced);
  }
  rows[0] = 0; // the sky starts at the top of the world, always
  for (let i = 1; i < rows.length; i++) {
    const minGap = i === 1 ? 0 : 6;
    if (rows[i]! < rows[i - 1]! + minGap) rows[i] = rows[i - 1]! + minGap;
  }
  return rows;
}

/**
 * Stepped sky bands (§7: "stepped bands, never a CSS gradient").
 *
 * The steps compress toward the horizon. That is atmospheric perspective, and it is the one
 * thing that makes a flat four-tone fill read as distance rather than as four stripes.
 */
const SKY_STEPS: readonly number[] = [0.0, 0.45, 0.7, 0.87];

function skyIndex(y: number, horizonRow: number): number {
  const t = horizonRow <= 0 ? 0 : y / horizonRow;
  let band = 0;
  for (let i = 0; i < SKY_STEPS.length; i++) if (t >= SKY_STEPS[i]!) band = i;
  return PX.SKY_0 + band;
}

/** Stars live only in the zenith band, so a single STAR index can be invisible in light theme. */
const STAR_DENSITY = 0.0018;

// ── Trees ─────────────────────────────────────────────────────────────────────────────────

/**
 * Trees are placed by a *local maximum* rule, never by a "did I place one recently" counter.
 *
 * A counter is stateful and would make the output depend on where the window started. Asking
 * "is my draw the largest in ±TREE_SPACING?" is positional, so a tree that straddles the left
 * edge of a phone-sized window is still drawn, and still drawn in exactly the same place.
 */
const TREE_SPACING = 7;
const TREE_THRESHOLD = 0.4;
const TREE_HALF_WIDTH = 3;

function isTreeRoot(worldX: number, seed: number, worldWidth: number): boolean {
  const me = hash(seed, SALT.tree, wrap(worldX, worldWidth));
  if (me < TREE_THRESHOLD) return false;
  for (let d = -TREE_SPACING; d <= TREE_SPACING; d++) {
    if (d === 0) continue;
    if (hash(seed, SALT.tree, wrap(worldX + d, worldWidth)) >= me) return false;
  }
  return true;
}

// ── Generation ────────────────────────────────────────────────────────────────────────────

/**
 * Generate a window of the world.
 *
 * Cost is O(width × height) with a small constant: one or two hashes per pixel in rock, a
 * handful per column for geometry. Measured timings are in the module README comment at the
 * bottom of `parallax.ts`; the number the page actually reports is measured at runtime and
 * dispatched on the `auros:terrain` event, never hard-coded.
 */
export function generateTerrain(req: TerrainRequest = {}): TerrainBuffer {
  const seed = req.seed ?? WORLD_SEED;
  const worldWidth = req.worldWidth ?? WORLD_WIDTH;
  const worldHeight = req.worldHeight ?? WORLD_HEIGHT;
  const width = Math.max(1, Math.min(req.width ?? worldWidth, worldWidth));
  const x0 = wrap(req.x0 ?? Math.floor((worldWidth - width) / 2), worldWidth);

  const layers = STRATA.length;
  const indices = new Uint8Array(width * worldHeight);

  // ── Per-column geometry, computed once ──────────────────────────────────────────────────
  // Everything that depends only on x comes out of the pixel loop. It is a few hundred
  // thousand arithmetic operations against a few million, and hoisting it is what lets the
  // pixel loop below walk memory in the order the CPU wants.
  const worldXs = new Int32Array(width);
  const bounds = new Int32Array(width * layers);
  const veins = new Float64Array(width);
  for (let col = 0; col < width; col++) {
    const worldX = wrap(x0 + col, worldWidth);
    worldXs[col] = worldX;
    const rows = columnBoundaries(worldX, seed, worldHeight, worldWidth);
    for (let i = 0; i < layers; i++) bounds[col * layers + i] = rows[i]!;
    // Squared so ore clusters into runs, but with a floor: a seam that died out completely
    // would leave a stretch of boundary unmarked, and on a narrow viewport that stretch might
    // be the whole thing the visitor sees. The accent has one job and it has to do it at every
    // width.
    const v = noise1(worldX, 60, SALT.vein, seed, worldWidth);
    veins[col] = 0.3 + 0.7 * v * v;
  }

  const bodies = new Uint8Array(layers);
  const grains = new Uint8Array(layers);
  const densities = new Float64Array(layers);
  for (let i = 0; i < layers; i++) {
    bodies[i] = STRATA[i]!.paint.body;
    grains[i] = STRATA[i]!.paint.grain;
    densities[i] = STRATA[i]!.paint.grainDensity;
  }

  // ── The pixel loop ──────────────────────────────────────────────────────────────────────
  // Row-major, writing straight into the buffer the consumer needs, because `ImageData` is
  // rows. An earlier version generated by column and transposed afterwards; the transpose was
  // 1.4 million scattered reads and 1.4 million scattered writes over a second allocation, and
  // it cost more than the noise did.
  //
  // `cursor` is which stratum each column is currently inside. Boundaries only ever increase
  // with y, so the cursor only ever advances — the per-pixel "which layer am I in" search is
  // amortised to nothing instead of five comparisons per pixel.
  const cursor = new Uint8Array(width);
  for (let y = 0; y < worldHeight; y++) {
    const rowOff = y * width;
    const halfY = y >> 1;
    for (let col = 0; col < width; col++) {
      const base = col * layers;
      let c = cursor[col]!;
      while (c + 1 < layers && y >= bounds[base + c + 1]!) c++;
      cursor[col] = c;

      let px: number;
      if (c === 0) {
        const horizon = bounds[base + 1]!;
        px = skyIndex(y, horizon);
        if (
          px === PX.SKY_0 &&
          hash(seed, SALT.star, worldXs[col]!, y) <
            STAR_DENSITY * (1 - y / Math.max(1, horizon))
        ) {
          px = PX.STAR;
        }
      } else if (c === 1 && y === bounds[base + 1]!) {
        // The very top block of the surface is unbroken turf, so the horizon reads as one
        // clean line.
        px = PX.GRASS;
      } else {
        // Grain is sampled at half resolution so flecks are 2×2 blocks. At one block the
        // texture reads as television static; at two it reads as mineral.
        px =
          hash(seed, SALT.grain, worldXs[col]! >> 1, halfY) < densities[c]!
            ? grains[c]!
            : bodies[c]!;
      }
      indices[rowOff + col] = px;
    }
  }

  // ── Ore ─────────────────────────────────────────────────────────────────────────────────
  // A pass over the seam bands only — about thirteen thousand candidate pixels rather than the
  // whole world. Ore cannot appear anywhere else by construction, which is a stronger guarantee
  // than the old per-pixel test that had to be told where not to fire.
  for (let k = 0; k < ORE_SEAMS.length; k++) {
    const seam = ORE_SEAMS[k]!;
    const si = STRATA.findIndex((s) => s.id === seam.below);
    const half = seam.halfBandBlocks;
    for (let col = 0; col < width; col++) {
      const seamRow = bounds[col * layers + si]!;
      const worldX = worldXs[col]!;
      const strength = veins[col]!;
      for (let y = seamRow - half; y <= seamRow + half; y++) {
        if (y < 0 || y >= worldHeight) continue;
        // Densest on the boundary row, tapering out over the band.
        const falloff = 1 - Math.abs(y - seamRow) / (half + 1);
        if (hash(seed, SALT.ore, worldX, y) < 0.6 * strength * falloff) {
          indices[y * width + col] =
            hash(seed, SALT.oreTone, worldX, y) < 0.3 ? PX.ORE_2 : PX.ORE;
        }
      }
    }
  }

  // ── Trees ───────────────────────────────────────────────────────────────────────────────
  // Root columns may sit outside the window, so a tree is never truncated at a window edge
  // that a different device would not have had.
  for (let rx = -TREE_HALF_WIDTH; rx < width + TREE_HALF_WIDTH; rx++) {
    const worldX = wrap(x0 + rx, worldWidth);
    if (!isTreeRoot(worldX, seed, worldWidth)) continue;
    const rootY = columnBoundaries(worldX, seed, worldHeight, worldWidth)[1]!;
    const height = 9 + Math.floor(hash(seed, SALT.tree + 1, worldX) * 6); // 9..14 blocks

    // A stepped conifer: the silhouette widens by two blocks every third row, so it is a stack
    // of whole blocks rather than a triangle that has been rasterised. Nothing here can produce
    // a smoothed diagonal.
    for (let r = 0; r < height - 2; r++) {
      const y = rootY - height + r;
      if (y < 0 || y >= rootY) continue;
      const spread = Math.min(TREE_HALF_WIDTH, Math.floor(r / 3));
      for (let dx = -spread; dx <= spread; dx++) {
        const col = rx + dx;
        if (col < 0 || col >= width) continue;
        // One light direction for the whole scene: lit from the left, so the right side of
        // every tree is the darker tone. Consistency here is what stops pixel art looking like
        // clip art.
        indices[y * width + col] = dx > 0 ? PX.TREE_LO : PX.TREE_HI;
      }
    }
    if (rx >= 0 && rx < width) {
      for (let y = rootY - 2; y < rootY; y++) {
        if (y >= 0) indices[y * width + rx] = PX.TREE_LO;
      }
    }
  }

  const histogram = new Uint32Array(PALETTE_SIZE);
  for (let i = 0; i < indices.length; i++) histogram[indices[i]!]!++;

  const oreCount = histogram[PX.ORE]! + histogram[PX.ORE_2]!;
  const pixels = width * worldHeight;
  let distinct = 0;
  for (let i = 0; i < PALETTE_SIZE; i++) if (histogram[i]! > 0) distinct++;

  return {
    width,
    height: worldHeight,
    x0,
    worldWidth,
    worldHeight,
    seed,
    indices,
    stats: {
      pixels,
      histogram,
      oreCount,
      oreFraction: oreCount / pixels,
      distinctIndices: distinct,
      boundaryRows: STRATA.map((s) => Math.round(s.top * worldHeight)),
    },
  };
}

// ── Clouds ────────────────────────────────────────────────────────────────────────────────

export interface CloudRequest {
  seed?: number;
  /** Window width in blocks. The buffer is this plus one full period, so drift never runs out. */
  width?: number;
  height?: number;
  period?: number;
  x0?: number;
}

export interface CloudBuffer {
  readonly width: number;
  readonly height: number;
  readonly period: number;
  /** `TRANSPARENT` where there is no cloud. */
  readonly indices: Uint8Array;
  readonly coverage: number;
}

/**
 * Clouds, on their own buffer so they can drift without the terrain being redrawn.
 *
 * The field is periodic over `period` blocks, which is the whole trick behind §7's "clouds
 * drifting (≤ 2px/sec)" costing nothing: the canvas is one period wider than the window, a CSS
 * animation translates it by exactly one period, and it loops seamlessly with no JavaScript
 * running per frame and nothing to get out of sync on a background tab.
 */
export function generateClouds(req: CloudRequest = {}): CloudBuffer {
  const seed = req.seed ?? WORLD_SEED;
  const period = req.period ?? CLOUD_PERIOD;
  const height = req.height ?? CLOUD_BAND_HEIGHT;
  const window = Math.max(1, req.width ?? WORLD_WIDTH);
  const width = window + period;
  const x0 = req.x0 ?? 0;

  const indices = new Uint8Array(width * height).fill(TRANSPARENT);

  // Six clouds per period. Enough that the sky is not empty, few enough that it is a sky and
  // not a ceiling — measured coverage is reported by the suite rather than asserted by eye.
  const CLOUDS = 6;
  for (let i = 0; i < CLOUDS; i++) {
    const cx = Math.round(
      (i * period) / CLOUDS + hash(seed, SALT.cloud, i) * (period / CLOUDS),
    );
    // Clouds sit in the upper two thirds of the sky band and never near the horizon, where they
    // would collide with the tree line and blur the one edge that has to stay legible.
    const cy = Math.round(height * (0.06 + hash(seed, SALT.cloud + 1, i) * 0.56));
    const halfW = 14 + Math.floor(hash(seed, SALT.cloud + 2, i) * 20);
    const rowsTall = 3 + Math.floor(hash(seed, SALT.cloud + 3, i) * 3);

    for (let r = 0; r < rowsTall; r++) {
      const y = cy + r;
      if (y < 0 || y >= height) continue;
      // Each row is a run whose ends are jittered by a positional draw, so the silhouette is
      // lumpy and stepped rather than a rounded blob.
      const leftCut = Math.floor(hash(seed, SALT.cloudEdge, i, r * 2) * (halfW * 0.6));
      const rightCut = Math.floor(hash(seed, SALT.cloudEdge, i, r * 2 + 1) * (halfW * 0.6));
      const taper = r === rowsTall - 1 ? Math.floor(halfW * 0.35) : 0;
      for (let dx = -halfW + leftCut + taper; dx <= halfW - rightCut - taper; dx++) {
        // Periodic: write every occurrence of this cloud across the padded buffer.
        for (let rep = -1; rep * period < width + period; rep++) {
          const x = cx + dx + rep * period - x0;
          if (x < 0 || x >= width) continue;
          // Lit from the left, like the trees: the bottom row is the shaded tone.
          indices[y * width + x] = r === rowsTall - 1 ? PX.CLOUD_LO : PX.CLOUD_HI;
        }
      }
    }
  }

  let covered = 0;
  for (let i = 0; i < indices.length; i++) if (indices[i] !== TRANSPARENT) covered++;

  return { width, height, period, indices, coverage: covered / indices.length };
}
