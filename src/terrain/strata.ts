/**
 * AUROS — the strata, as data.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * THIS FILE IS THE ARCHITECTURE DIAGRAM.
 *
 * Spec §7: "The background is a pixel-art cross-section of the earth, and it IS the
 * architecture diagram." That sentence only stays true if the thing the renderer draws is the
 * thing the company actually builds. So the layer table is not a list of pretty bands with
 * geological names on them — it is spec §3's image stack, and the renderer derives every
 * boundary from it.
 *
 *     ── sky ──         an OS with only what you asked for   (a claim, not a file)
 *     ── surface ──     your machine                          (hardware; not an image layer)
 *     ── topsoil ──     your apps, your language, your look
 *     ── stratum 1 ──   your recipe                           recipe.yaml
 *     ── stratum 2 ──   auros-base:hardened                   the one image we build
 *     ── bedrock ──     Fedora · Universal Blue               upstream, not ours
 *
 * The prose for each layer lives in `src/content/layers/*.md` and the margin label component
 * reads it from there. The fields below (`id`, `marginLabel`, `name`, `ownedBy`, `depth`) are
 * duplicated here **deliberately**, because this module must be pure and importable by a Worker
 * and by a test, neither of which can read an Astro content collection. `terrain.test.ts`
 * asserts the two agree, so the duplication cannot rot silently.
 *
 * ORE. Spec §7 puts ore "only at layer boundaries" and says it "marks where one image layer
 * ends and the next begins". That is a precise claim, so `ORE_SEAMS` is *derived*, not listed:
 * a seam exists exactly where two adjacent `isImageLayer` strata meet. The surface/topsoil
 * boundary gets no ore, because the surface is a laptop and a laptop is not an image layer.
 * If someone later marks the surface as an image layer, a seam appears there automatically and
 * the test that counts seams fails — which is the point of deriving it.
 *
 * The namespace is never written out here. `auros.config.json` is the single source of truth
 * (D1), and the one place a registry path appears on this page is the `ref` field, which is
 * filled from that file by the content collection, not typed in. See `REF_KEYS`.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 */

/** Stable identifiers. These match `src/content/layers/*.md` frontmatter `id`, exactly. */
export type StratumId =
  | "sky"
  | "surface"
  | "topsoil"
  | "stratum-1"
  | "stratum-2"
  | "bedrock";

/** Who the layer belongs to. Matches the content collection's `ownedBy` enum. */
export type Ownership = "you" | "Auros" | "upstream";

/**
 * How a stratum is painted. Two tones only: a body and a grain fleck. Any third tone would be
 * decoration, and decoration is the thing §7 calls slop.
 */
export interface StratumPaint {
  /** Palette index for the bulk of the layer. */
  readonly body: number;
  /** Palette index for the sparse fleck that makes the layer legible as its own material. */
  readonly grain: number;
  /** 0..1 — fraction of the layer's pixels that get `grain`. Kept low; this is texture, not noise. */
  readonly grainDensity: number;
}

export interface Stratum {
  readonly id: StratumId;
  /** The exact string rendered in the margin. Matches the content collection. */
  readonly marginLabel: string;
  /** What this layer *is*, in the company's own words. Matches the content collection. */
  readonly name: string;
  readonly ownedBy: Ownership;
  /** 0 = sky, 5 = bedrock. Matches the content collection's `depth`. */
  readonly depth: number;

  /**
   * Is this a layer of the OCI image stack?
   *
   * `sky` is a claim and `surface` is a laptop, so neither is. The other four are: the recipe
   * produces topsoil, the recipe *is* stratum 1, `auros-base:hardened` is stratum 2, and the
   * Universal Blue image is bedrock. Ore seams are derived from this flag.
   */
  readonly isImageLayer: boolean;

  /** Top edge, as a fraction of world height. The layer runs to the next stratum's `top`. */
  readonly top: number;

  /**
   * Peak-to-peak wobble of this layer's top edge, in blocks.
   *
   * It decreases with depth and that is the whole editorial point: the surface is weather and
   * the bedrock is not. Your machine varies; upstream does not move under you.
   */
  readonly reliefBlocks: number;

  readonly paint: StratumPaint;
}

/**
 * Palette indices, named. The renderer never writes a colour — it writes one of these, and
 * `render.ts` maps them to RGB per theme. That indirection is what makes "switching theme must
 * not re-run noise generation" true rather than aspirational: the index buffer is the
 * expensive artefact and it is theme-independent.
 *
 * Exactly 18 entries, which is the §7 ceiling. Adding a nineteenth is a spec change, not a
 * refactor. See the NOTE ON 19 in `render.ts` for why one §7 colour is not in this list.
 */
export const PX = {
  /** Stepped sky bands, zenith → horizon. Never a gradient (§7). */
  SKY_0: 0,
  SKY_1: 1,
  SKY_2: 2,
  SKY_3: 3,
  /**
   * Single-pixel stars, dark theme only. In light theme this index maps to exactly SKY_0's RGB,
   * so the stars are *present in the buffer and invisible on screen*. That is how the dark
   * theme can appear without regenerating a single noise sample.
   */
  STAR: 4,
  CLOUD_HI: 5,
  CLOUD_LO: 6,
  TREE_HI: 7,
  TREE_LO: 8,
  GRASS: 9,
  SOIL_HI: 10,
  SOIL_LO: 11,
  ROCK_1: 12,
  ROCK_2: 13,
  ROCK_3: 14,
  ROCK_4: 15,
  /** Accent. Under 2% of pixels, only at image-layer boundaries. */
  ORE: 16,
  ORE_2: 17,
} as const;

/** The §7 ceiling, enforced by `terrain.test.ts` against the real output buffer. */
export const PALETTE_SIZE = 18;

/** Written into the cloud buffer where there is no cloud. Never a colour; never counted. */
export const TRANSPARENT = 255;

/**
 * The stack. Order is top-to-bottom and `depth` must equal the array index.
 *
 * `top` fractions are chosen so that the deeper a layer is, the thicker it is. That is not a
 * composition preference: the base image is larger than any one recipe, and upstream is larger
 * than the base. Bedrock runs to the bottom of the world because upstream has no floor.
 */
export const STRATA: readonly Stratum[] = [
  {
    id: "sky",
    marginLabel: "── sky ──",
    name: "An OS with only what you asked for",
    ownedBy: "Auros",
    depth: 0,
    isImageLayer: false,
    top: 0.0,
    reliefBlocks: 0,
    // The sky is painted by its own stepped-band rule, not by body/grain. Recorded for
    // completeness so every stratum has a paint and no call site needs a null check.
    paint: { body: PX.SKY_0, grain: PX.SKY_1, grainDensity: 0 },
  },
  {
    id: "surface",
    marginLabel: "── surface ──",
    name: "Your machine",
    ownedBy: "you",
    depth: 1,
    isImageLayer: false,
    top: 0.175,
    reliefBlocks: 14,
    paint: { body: PX.GRASS, grain: PX.SOIL_HI, grainDensity: 0.1 },
  },
  {
    id: "topsoil",
    marginLabel: "── topsoil ──",
    name: "Your apps, your language, your look",
    ownedBy: "you",
    depth: 2,
    isImageLayer: true,
    top: 0.198,
    reliefBlocks: 11,
    paint: { body: PX.SOIL_HI, grain: PX.SOIL_LO, grainDensity: 0.22 },
  },
  {
    id: "stratum-1",
    marginLabel: "── stratum 1 ──",
    name: "Your recipe",
    ownedBy: "you",
    depth: 3,
    isImageLayer: true,
    top: 0.33,
    reliefBlocks: 8,
    paint: { body: PX.ROCK_1, grain: PX.ROCK_2, grainDensity: 0.18 },
  },
  {
    id: "stratum-2",
    marginLabel: "── stratum 2 ──",
    name: "auros-base:hardened",
    ownedBy: "Auros",
    depth: 4,
    isImageLayer: true,
    top: 0.545,
    reliefBlocks: 5,
    paint: { body: PX.ROCK_3, grain: PX.ROCK_2, grainDensity: 0.14 },
  },
  {
    id: "bedrock",
    marginLabel: "── bedrock ──",
    name: "Fedora · Universal Blue",
    ownedBy: "upstream",
    depth: 5,
    isImageLayer: true,
    top: 0.775,
    reliefBlocks: 2,
    paint: { body: PX.ROCK_4, grain: PX.ROCK_3, grainDensity: 0.1 },
  },
] as const;

/**
 * Which config key supplies each layer's monospace reference on the page.
 *
 * Nothing here spells out a namespace. D1 makes `auros.config.json` the single source of truth
 * for `aarohkandy` / `auros`, so the strings that would contain them are looked up, and this
 * table says where from. The content collection already carries the resolved value; this exists
 * so a Worker-side or test-side consumer can resolve it too without importing Astro.
 */
export const REF_KEYS: Readonly<Record<StratumId, string | null>> = {
  sky: null,
  surface: null,
  topsoil: null,
  "stratum-1": null,
  "stratum-2": "baseImage+baseTag",
  bedrock: "upstream.image+upstream.tag",
};

/** A boundary between two adjacent image layers. This is where ore is allowed to exist. */
export interface OreSeam {
  /** The layer above the seam. */
  readonly above: StratumId;
  /** The layer below the seam. */
  readonly below: StratumId;
  /** Fraction of world height where the seam sits, before relief displacement. */
  readonly at: number;
  /** Half-height of the band ore may occupy, in blocks. */
  readonly halfBandBlocks: number;
}

/**
 * Derived, never listed. A seam exists exactly where one image layer ends and the next begins.
 *
 * With the current table that is three seams — topsoil↔stratum-1, stratum-1↔stratum-2,
 * stratum-2↔bedrock — and `terrain.test.ts` asserts both the count and that every ore pixel in
 * the generated world falls inside one of these bands.
 */
export const ORE_SEAMS: readonly OreSeam[] = STRATA.flatMap((s, i) => {
  const below = STRATA[i + 1];
  if (!below || !s.isImageLayer || !below.isImageLayer) return [];
  return [
    {
      above: s.id,
      below: below.id,
      at: below.top,
      halfBandBlocks: 2,
    } satisfies OreSeam,
  ];
});

/** Lookup by id. Throws rather than returning undefined: an unknown stratum is a bug, not a state. */
export function stratum(id: StratumId): Stratum {
  const found = STRATA.find((s) => s.id === id);
  if (!found) throw new Error(`auros/terrain: unknown stratum "${id}"`);
  return found;
}

/**
 * Which stratum a point in the world falls in, given a 0..1 depth through the world.
 *
 * Used by the page to label the margin as the reader passes each layer. Uses the nominal `top`
 * fractions, not the displaced ones, because a label should change at a stable scroll position
 * rather than wherever this column's noise happened to put the rock.
 */
export function stratumAtDepth(depth01: number): Stratum {
  const d = depth01 <= 0 ? 0 : depth01 >= 1 ? 1 : depth01;
  let current = STRATA[0]!;
  for (const s of STRATA) if (d >= s.top) current = s;
  return current;
}

/**
 * The nominal boundary rows of the world, in blocks, for a given world height.
 *
 * `parallax.ts` publishes these as CSS custom properties so the margin labels can be positioned
 * against the actual drawn boundaries instead of against a guess. That is the difference
 * between a diagram and a picture of one.
 */
export function boundaryRows(worldHeightBlocks: number): Readonly<Record<StratumId, number>> {
  const out = {} as Record<StratumId, number>;
  for (const s of STRATA) out[s.id] = Math.round(s.top * worldHeightBlocks);
  return out;
}
