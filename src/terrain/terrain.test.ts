/**
 * AUROS — terrain renderer tests.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * Run:  node src/terrain/terrain.test.ts
 *
 * No test framework and no `node:` imports. Not minimalism for its own sake — at the time this
 * was written `auros-web` had no test runner and no `@types/node`, and importing `node:test`
 * would have made `astro check` fail for the agent who owns the scaffold. When a runner lands,
 * `TERRAIN_TESTS` is already the right shape to hand to it; this file's own runner can go.
 *
 * WHAT A TEST IS FOR HERE
 * D19 records the standing rule from a real failure in this project: *a step that cannot fail
 * is not a check*. So none of the assertions below restate something the type system already
 * guarantees. Each one has an answer to "what would make this go red":
 *
 *   determinism        an unseeded draw, a `Math.random()`, an object-iteration-order dependency
 *   Math.random ban    someone reaching for it in a future edit — the function is replaced with
 *                      a thrower and the world is regenerated, so this fails at the call site
 *   18 colours         a nineteenth palette entry, counted in the real RGBA output buffer
 *   ore under 2%       a density tweak that got away
 *   ore only at seams  ore leaking into the body of a layer, which would destroy its meaning
 *   window == slice    a stream-based PRNG creeping back in; phones would silently differ
 *   strata == content  the margin labels and the picture drifting apart
 * ──────────────────────────────────────────────────────────────────────────────────────────
 */

import { countDistinctColours, PALETTES, paint } from "./render";
import {
  ORE_SEAMS,
  PALETTE_SIZE,
  PX,
  STRATA,
  TRANSPARENT,
  boundaryRows,
  stratumAtDepth,
  type StratumId,
} from "./strata";
import {
  WORLD_HEIGHT,
  WORLD_SEED,
  WORLD_WIDTH,
  columnBoundaries,
  generateClouds,
  generateTerrain,
} from "./terrain";

// ── A runner ──────────────────────────────────────────────────────────────────────────────

export interface TerrainTest {
  readonly name: string;
  readonly run: () => void | Promise<void>;
}

const tests: TerrainTest[] = [];
const notes: string[] = [];

function test(name: string, run: () => void | Promise<void>): void {
  tests.push({ name, run });
}

/** Recorded and printed with the results. Measurements, not assertions. */
function note(line: string): void {
  notes.push(line);
}

function ok(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

function eq(actual: unknown, expected: unknown, message: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}\n  expected: ${String(expected)}\n  actual:   ${String(actual)}`);
  }
}

function bytesEqual(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) return -2;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
  return -1;
}

export const TERRAIN_TESTS: readonly TerrainTest[] = tests;

// ── Shared fixtures ───────────────────────────────────────────────────────────────────────
// Generated once. Every test that needs "the world" gets the same object, so a test cannot
// accidentally pass by regenerating with different arguments.

const t0 = Date.now();
const world = generateTerrain();
const generateMs = Date.now() - t0;
const SEAM_INDEX = ORE_SEAMS.map((s) => STRATA.findIndex((x) => x.id === s.below));

note(`world              ${world.width} × ${world.height} blocks (${WORLD_WIDTH} × ${WORLD_HEIGHT} world)`);
note(`generation         ${generateMs} ms  (Node ${(globalThis as { process?: { version?: string } }).process?.version ?? "?"}, one full world)`);
note(`index buffer       ${(world.indices.length / 1024).toFixed(0)} KiB`);
note(`canvas footprint   ${((world.indices.length * 4) / 1024 / 1024).toFixed(2)} MiB at 4 bytes/block`);
note(`ore                ${world.stats.oreCount} px = ${(world.stats.oreFraction * 100).toFixed(3)}% (§7 ceiling 2%)`);
note(`palette indices    ${world.stats.distinctIndices} of ${PALETTE_SIZE} present`);

// ── Determinism ───────────────────────────────────────────────────────────────────────────

test("same seed produces a byte-identical pixel buffer across two runs", () => {
  const a = generateTerrain();
  const b = generateTerrain();
  const at = bytesEqual(a.indices, b.indices);
  ok(at === -1, at === -2 ? "buffers differ in length" : `buffers diverge at byte ${at}`);
  eq(a.indices.length, WORLD_WIDTH * WORLD_HEIGHT, "unexpected buffer size");
});

test("same seed produces a byte-identical RGBA buffer across two runs", () => {
  // The index buffer being stable is necessary but not sufficient — the palette mapping is the
  // other half of what a visitor actually sees, and it has its own byte-order fast path.
  const a = paint(generateTerrain().indices, "light");
  const b = paint(generateTerrain().indices, "light");
  const at = bytesEqual(
    new Uint8Array(a.buffer, a.byteOffset, a.length),
    new Uint8Array(b.buffer, b.byteOffset, b.length),
  );
  ok(at === -1, `RGBA buffers diverge at byte ${at}`);
});

test("clouds are deterministic too", () => {
  const a = generateClouds({ width: 480 });
  const b = generateClouds({ width: 480 });
  ok(bytesEqual(a.indices, b.indices) === -1, "cloud buffers diverge");
});

test("Math.random() is never called", () => {
  // The strongest available form of this check: make the function fatal and do the whole job.
  const real = Math.random;
  Math.random = () => {
    throw new Error("Math.random() was called — the terrain seed is the brand (§7)");
  };
  try {
    const w = generateTerrain({ width: 128, x0: 41 });
    paint(w.indices, "dark");
    generateClouds({ width: 128 });
  } finally {
    Math.random = real;
  }
});

test("a different seed produces a different world", () => {
  // Otherwise "seeded" could be a decoration over a constant.
  const a = generateTerrain({ width: 64, x0: 0 });
  const b = generateTerrain({ width: 64, x0: 0, seed: WORLD_SEED + 1 });
  ok(bytesEqual(a.indices, b.indices) !== -1, "two seeds produced the same world");
});

// ── The 18-colour ceiling ─────────────────────────────────────────────────────────────────

test("the rendered buffer never exceeds 18 distinct colours — light", () => {
  const rgba = paint(world.indices, "light");
  const n = countDistinctColours(rgba);
  note(`distinct colours   light ${n}`);
  ok(n <= PALETTE_SIZE, `light theme rendered ${n} distinct colours, §7 ceiling is ${PALETTE_SIZE}`);
});

test("the rendered buffer never exceeds 18 distinct colours — dark", () => {
  const rgba = paint(world.indices, "dark");
  const n = countDistinctColours(rgba);
  note(`distinct colours   dark ${n}`);
  ok(n <= PALETTE_SIZE, `dark theme rendered ${n} distinct colours, §7 ceiling is ${PALETTE_SIZE}`);
});

test("both palette tables are exactly 18 entries of valid hex", () => {
  for (const theme of ["light", "dark"] as const) {
    const p = PALETTES[theme];
    eq(p.length, PALETTE_SIZE, `${theme} palette length`);
    for (const hex of p) ok(/^#[0-9a-f]{6}$/i.test(hex), `${theme}: bad colour ${hex}`);
  }
});

test("every index written is a real palette index", () => {
  for (let i = 0; i < world.indices.length; i++) {
    const v = world.indices[i]!;
    if (v >= PALETTE_SIZE) throw new Error(`index ${v} at ${i} is outside the palette`);
  }
  const clouds = generateClouds({ width: 240 });
  for (let i = 0; i < clouds.indices.length; i++) {
    const v = clouds.indices[i]!;
    if (v >= PALETTE_SIZE && v !== TRANSPARENT) {
      throw new Error(`cloud index ${v} at ${i} is neither a palette entry nor transparent`);
    }
  }
});

test("STAR is invisible in light theme and visible in dark", () => {
  // This is what lets a theme switch be a repaint rather than a regeneration.
  eq(PALETTES.light[PX.STAR], PALETTES.light[PX.SKY_0], "light STAR must equal light SKY_0");
  ok(PALETTES.dark[PX.STAR] !== PALETTES.dark[PX.SKY_0], "dark STAR must differ from dark sky");
  ok(world.stats.histogram[PX.STAR]! > 0, "no stars were generated at all");
});

test("a theme switch does not touch the index buffer", () => {
  const before = world.indices.slice();
  paint(world.indices, "dark");
  paint(world.indices, "light");
  ok(bytesEqual(before, world.indices) === -1, "painting mutated the generated buffer");
});

test("ore is unchanged between themes (§7: 'ore stays')", () => {
  eq(PALETTES.dark[PX.ORE], PALETTES.light[PX.ORE], "ORE changed in dark theme");
  eq(PALETTES.dark[PX.ORE_2], PALETTES.light[PX.ORE_2], "ORE_2 changed in dark theme");
});

// ── Ore ───────────────────────────────────────────────────────────────────────────────────

test("ore is under 2% of pixels", () => {
  ok(
    world.stats.oreFraction < 0.02,
    `ore is ${(world.stats.oreFraction * 100).toFixed(3)}% of pixels, §7 ceiling is 2%`,
  );
  ok(world.stats.oreCount > 0, "no ore at all — the accent marks the layer boundaries, it is not optional");
});

test("every ore pixel sits on an image-layer boundary and nowhere else", () => {
  // The whole justification for the accent colour. Ore in the body of a stratum would be
  // decoration, and §7 calls decoration slop.
  let checked = 0;
  for (let col = 0; col < world.width; col++) {
    const worldX = (world.x0 + col) % WORLD_WIDTH;
    const rows = columnBoundaries(worldX, WORLD_SEED, WORLD_HEIGHT, WORLD_WIDTH);
    for (let y = 0; y < world.height; y++) {
      const v = world.indices[y * world.width + col]!;
      if (v !== PX.ORE && v !== PX.ORE_2) continue;
      checked++;
      let inSeam = false;
      for (let k = 0; k < ORE_SEAMS.length; k++) {
        const seamRow = rows[SEAM_INDEX[k]!]!;
        if (Math.abs(y - seamRow) <= ORE_SEAMS[k]!.halfBandBlocks) inSeam = true;
      }
      if (!inSeam) throw new Error(`ore at column ${col}, row ${y} is not on any seam`);
    }
  }
  eq(checked, world.stats.oreCount, "ore scan disagreed with the histogram");
});

test("there are exactly three ore seams, and they are the image-layer boundaries", () => {
  const pairs = ORE_SEAMS.map((s) => `${s.above}|${s.below}`);
  eq(pairs.join(" "), "topsoil|stratum-1 stratum-1|stratum-2 stratum-2|bedrock", "seam set changed");
  for (const seam of ORE_SEAMS) {
    const above = STRATA.find((s) => s.id === seam.above)!;
    const below = STRATA.find((s) => s.id === seam.below)!;
    ok(above.isImageLayer && below.isImageLayer, `${seam.above}|${seam.below} is not between image layers`);
  }
  ok(
    !ORE_SEAMS.some((s) => s.above === "surface"),
    "the surface is a laptop, not an image layer — it must not get an ore seam",
  );
});

// ── Windowing: the property that makes a phone and a laptop show the same world ────────────

test("a generated window is byte-identical to that slice of the full world", () => {
  const W = 97;
  const X0 = 613;
  const win = generateTerrain({ x0: X0, width: W });
  eq(win.width, W, "window width");
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let col = 0; col < W; col++) {
      const a = win.indices[y * W + col]!;
      const b = world.indices[y * WORLD_WIDTH + ((X0 + col) % WORLD_WIDTH)]!;
      if (a !== b) throw new Error(`window differs from the world at (${col}, ${y}): ${a} vs ${b}`);
    }
  }
});

test("a window that wraps the world seam is still byte-identical", () => {
  // Trees rooted just outside the window, and the x-periodic noise lattice, both get exercised
  // here and nowhere else.
  const W = 24;
  const X0 = WORLD_WIDTH - 12;
  const win = generateTerrain({ x0: X0, width: W });
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let col = 0; col < W; col++) {
      const a = win.indices[y * W + col]!;
      const b = world.indices[y * WORLD_WIDTH + ((X0 + col) % WORLD_WIDTH)]!;
      if (a !== b) throw new Error(`wrapped window differs at (${col}, ${y}): ${a} vs ${b}`);
    }
  }
});

// ── Quantisation and continuity ───────────────────────────────────────────────────────────

test("every boundary is a whole number of blocks, and strictly ordered", () => {
  for (let x = 0; x < WORLD_WIDTH; x += 7) {
    const rows = columnBoundaries(x, WORLD_SEED, WORLD_HEIGHT, WORLD_WIDTH);
    for (let i = 0; i < rows.length; i++) {
      ok(Number.isInteger(rows[i]!), `boundary ${i} at x=${x} is not an integer block`);
      if (i > 0) ok(rows[i]! >= rows[i - 1]!, `boundary ${i} crossed boundary ${i - 1} at x=${x}`);
    }
  }
});

test("no boundary steps by more than a few blocks between columns, including across the seam", () => {
  // A cliff would mean the noise is not continuous; a jump at x=959→0 would mean it is not
  // periodic, and the centred crop a phone sees would have a visible join.
  let worst = 0;
  for (let x = 0; x < WORLD_WIDTH; x++) {
    const a = columnBoundaries(x, WORLD_SEED, WORLD_HEIGHT, WORLD_WIDTH);
    const b = columnBoundaries((x + 1) % WORLD_WIDTH, WORLD_SEED, WORLD_HEIGHT, WORLD_WIDTH);
    for (let i = 1; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i]! - b[i]!));
  }
  note(`steepest boundary  ${worst} blocks per column`);
  ok(worst <= 3, `a boundary stepped ${worst} blocks in one column — that is a cliff, not relief`);
});

test("stars only ever appear in the zenith sky band", () => {
  for (let col = 0; col < world.width; col += 3) {
    const worldX = (world.x0 + col) % WORLD_WIDTH;
    const horizon = columnBoundaries(worldX, WORLD_SEED, WORLD_HEIGHT, WORLD_WIDTH)[1]!;
    for (let y = 0; y < world.height; y++) {
      if (world.indices[y * world.width + col] !== PX.STAR) continue;
      ok(y < horizon * 0.45, `a star at row ${y} is below the zenith band (horizon ${horizon})`);
    }
  }
});

test("nothing below the horizon is a sky colour, and nothing above it is rock", () => {
  const skyish = new Set<number>([PX.SKY_0, PX.SKY_1, PX.SKY_2, PX.SKY_3, PX.STAR]);
  const rocky = new Set<number>([PX.ROCK_1, PX.ROCK_2, PX.ROCK_3, PX.ROCK_4, PX.SOIL_HI, PX.SOIL_LO]);
  for (let col = 0; col < world.width; col += 5) {
    const worldX = (world.x0 + col) % WORLD_WIDTH;
    const horizon = columnBoundaries(worldX, WORLD_SEED, WORLD_HEIGHT, WORLD_WIDTH)[1]!;
    for (let y = 0; y < world.height; y++) {
      const v = world.indices[y * world.width + col]!;
      if (y > horizon && skyish.has(v)) throw new Error(`sky colour ${v} below the horizon at (${col}, ${y})`);
      if (y < horizon && rocky.has(v)) throw new Error(`rock colour ${v} above the horizon at (${col}, ${y})`);
    }
  }
});

// ── Clouds ────────────────────────────────────────────────────────────────────────────────

test("the cloud field repeats exactly one period, so the drift loop is seamless", () => {
  // If this fails the clouds visibly jump once every eight minutes, which is exactly the kind
  // of defect nobody sees in review and everybody sees on the site.
  const c = generateClouds({ width: 480 });
  eq(c.width, 480 + c.period, "cloud buffer must be one period wider than the window");
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x + c.period < c.width; x++) {
      const a = c.indices[y * c.width + x]!;
      const b = c.indices[y * c.width + x + c.period]!;
      if (a !== b) throw new Error(`cloud field is not periodic at (${x}, ${y}): ${a} vs ${b}`);
    }
  }
  note(`cloud coverage     ${(c.coverage * 100).toFixed(1)}% of the sky band`);
  ok(c.coverage < 0.3, `clouds cover ${(c.coverage * 100).toFixed(1)}% of the sky — that is a ceiling`);
  ok(c.coverage > 0.01, "no clouds were generated");
});

// ── The data has to match the architecture ────────────────────────────────────────────────

test("depth equals position, and the stack is ordered from sky to bedrock", () => {
  STRATA.forEach((s, i) => eq(s.depth, i, `${s.id}: depth must equal its position in the stack`));
  eq(STRATA[0]!.id, "sky", "the stack must start at the sky");
  eq(STRATA[STRATA.length - 1]!.id, "bedrock", "the stack must end at bedrock");
  for (let i = 1; i < STRATA.length; i++) {
    ok(STRATA[i]!.top > STRATA[i - 1]!.top, `${STRATA[i]!.id} does not sit below ${STRATA[i - 1]!.id}`);
    ok(
      STRATA[i]!.reliefBlocks <= STRATA[i - 1]!.reliefBlocks || i === 1,
      `${STRATA[i]!.id} has more relief than the layer above it — deeper is meant to be steadier`,
    );
  }
});

test("stratumAtDepth agrees with the published boundary rows", () => {
  const rows = boundaryRows(WORLD_HEIGHT);
  for (const s of STRATA) {
    eq(stratumAtDepth(s.top).id, s.id, `at its own top, ${s.id} should be the current stratum`);
    eq(rows[s.id], Math.round(s.top * WORLD_HEIGHT), `${s.id}: boundary row`);
  }
  eq(stratumAtDepth(0).id, "sky", "the top of the page is the sky");
  eq(stratumAtDepth(1).id, "bedrock", "the bottom of the page is bedrock");
});

test("the strata match src/content/layers/*.md exactly", async () => {
  // The renderer and the margin labels must be describing the same architecture. The specifier
  // is assembled at run time so this file needs no `node:` type declarations to typecheck.
  const spec = "node:" + "fs";
  let fs: {
    readdirSync: (u: URL) => string[];
    readFileSync: (u: URL, enc: string) => string;
  };
  try {
    fs = (await import(/* @vite-ignore */ spec)) as typeof fs;
  } catch {
    note("content cross-check  SKIPPED (no filesystem in this runtime)");
    return;
  }

  const dir = new URL("../content/layers/", import.meta.url);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  eq(files.length, STRATA.length, "layer document count does not match the stack");

  const field = (src: string, key: string): string => {
    const m = new RegExp(`^${key}:\\s*(.*)$`, "m").exec(src);
    if (!m) throw new Error(`missing frontmatter field "${key}"`);
    return m[1]!.trim().replace(/^"(.*)"$/, "$1");
  };

  for (const file of files) {
    const src = fs.readFileSync(new URL(file, dir), "utf8");
    const id = field(src, "id") as StratumId;
    const s = STRATA.find((x) => x.id === id);
    ok(!!s, `${file}: id "${id}" is not in STRATA`);
    eq(field(src, "marginLabel"), s!.marginLabel, `${file}: marginLabel`);
    eq(field(src, "name"), s!.name, `${file}: name`);
    eq(field(src, "ownedBy"), s!.ownedBy, `${file}: ownedBy`);
    eq(Number(field(src, "depth")), s!.depth, `${file}: depth`);
  }
  note(`content cross-check  ${files.length} layer documents agree with STRATA`);
});

test("no namespace is hardcoded anywhere in this package", async () => {
  // D1: `auros.config.json` is the single source of truth for the org and product names. A
  // renderer is an easy place for one to get typed in by hand.
  const spec = "node:" + "fs";
  let fs: { readdirSync: (u: URL) => string[]; readFileSync: (u: URL, enc: string) => string };
  try {
    fs = (await import(/* @vite-ignore */ spec)) as typeof fs;
  } catch {
    return;
  }
  const dir = new URL("./", import.meta.url);
  const offenders: string[] = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".ts")) continue;
    const src = fs.readFileSync(new URL(file, dir), "utf8");
    src.split("\n").forEach((line, i) => {
      if (!/aarohkandy|ghcr\.io/.test(line)) return;
      // A comment naming the config file is documentation, not a hardcoded reference.
      if (/^\s*(\*|\/\/)/.test(line)) return;
      offenders.push(`${file}:${i + 1}`);
    });
  }
  eq(offenders.join(", "), "", "namespace hardcoded — it belongs in auros.config.json (D1)");
});

// ── Runner ────────────────────────────────────────────────────────────────────────────────

export async function runTerrainTests(): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;
  const lines: string[] = [];
  for (const t of tests) {
    try {
      await t.run();
      passed++;
      lines.push(`  ok    ${t.name}`);
    } catch (err) {
      failed++;
      lines.push(`  FAIL  ${t.name}`);
      lines.push(`        ${(err instanceof Error ? err.message : String(err)).replace(/\n/g, "\n        ")}`);
    }
  }
  console.log("\nauros/terrain\n");
  for (const line of lines) console.log(line);
  console.log("\nmeasured");
  for (const line of notes) console.log(`  ${line}`);
  console.log(`\n${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

const proc = (globalThis as { process?: { argv?: string[]; exitCode?: number } }).process;
if (proc?.argv?.[1] && import.meta.url.endsWith(proc.argv[1].split("/").pop()!)) {
  void runTerrainTests().then(({ failed }) => {
    if (failed > 0) proc.exitCode = 1;
  });
}
