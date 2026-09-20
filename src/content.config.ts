/*
 * Astro 7 moved this file from src/content/config.ts to src/content.config.ts and made the
 * loader explicit — `type: "content"` no longer exists. Migrated rather than pinned back,
 * because the pinned versions in docs/DECISION-SHEET.md are Astro 7.3.3 and that is what the
 * site is built and tested against.
 */
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * AUROS — content collection schemas.
 *
 * This file defines the SHAPE of the site's words. It does not define layout, styling or
 * rendering; those belong to the agent that owns `src/layouts/`, `src/styles/` and
 * `src/terrain/`.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE MONO CONVENTION (spec §7, typography)
 *
 * Anything factual — a price, a package name, a command, a file path, a device minimum,
 * a locale code, a digest — is set in IBM Plex Mono. In this content tree that is marked
 * in exactly two ways, and no others:
 *
 *   1. In MDX prose: inline code spans. `podman build`, `$15`, `25`, `recipe.yaml`.
 *      The layout styles `code` as IBM Plex Mono. Prose never uses backticks decoratively.
 *
 *   2. In frontmatter and in copy.ts: any field named `mono`, any field whose name ends in
 *      `Mono`, and every `value` of a `Fact` pair. Those strings render in IBM Plex Mono.
 *      Their `label` does not.
 *
 * If a string is not a fact, it does not get mono. Emphasis is not a reason.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * EVERY factual assertion made anywhere in this tree is listed in CLAIMS.md alongside its
 * evidence. Adding a claim to a content file without adding the row to CLAIMS.md is a
 * defect. Claims that lack evidence are flagged there and must not ship without a human
 * decision (spec §9).
 */

/** A label/value pair where `value` is a fact and renders in IBM Plex Mono. */
const fact = z.object({
  label: z.string(),
  value: z.string(),
});

/**
 * Long-form pages. Body is MDX. One file per route.
 */
const pages = defineCollection({
  loader: glob({ base: "./src/content/pages", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    /** Used as the <title> and in nav. Shorter than `title`. */
    navLabel: z.string(),
    /** One sentence. Meta description and, where a page has one, the standfirst. */
    summary: z.string(),
    /** Which terrain stratum this page sits at, for the margin label. See the `layers` collection. */
    layer: z.enum(["sky", "surface", "topsoil", "stratum-1", "stratum-2", "bedrock"]).optional(),
    order: z.number(),
  }),
});

/**
 * The migration inventory: one entry per category of thing a customer owns, and an honest
 * verdict on whether it survives the move.
 *
 * `verdict` is the whole product argument, so it is a closed set:
 *   comes        — it arrives on the new machine. We copy it, count it and hash it.
 *   does-not     — it does not arrive, and no amount of effort on our side changes that.
 *   conditional  — it depends on a fact about YOUR copy that we cannot know from here.
 *                  Every conditional entry MUST carry `howToCheck`.
 *
 * Never soften a `does-not` into a `conditional` to make the page read better (spec §4.2).
 */
const migration = defineCollection({
  loader: glob({ base: "./src/content/migration", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    verdict: z.enum(["comes", "does-not", "conditional"]),
    /** One line, plain. Shown in the landing column and as the entry's standfirst. */
    oneLine: z.string(),
    /** Named examples. Brand names only where the claim holds for every version of them. */
    examples: z.array(z.string()).default([]),
    /** Required on every `conditional`. The test the reader runs before committing. */
    howToCheck: z.string().optional(),
    /** Surfaced in the above-the-fold landing column (spec §6D). */
    onLanding: z.boolean().default(false),
    order: z.number(),
  }).refine(
    (d) => d.verdict !== "conditional" || (d.howToCheck && d.howToCheck.length > 0),
    { message: "A `conditional` verdict without `howToCheck` is a vague disclaimer. Write the test." },
  ),
});

/**
 * Pricing tiers. §9-RESERVED: the numbers in these files are fixed by the spec and may not
 * be changed by an agent for any reason, including "rounding", "clarity" or "consistency".
 * A price change is a human decision (spec §9).
 */
const tiers = defineCollection({
  loader: glob({ base: "./src/content/tiers", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    name: z.string(),
    /** e.g. "$15" — renders IBM Plex Mono. */
    priceMono: z.string(),
    /** e.g. "per device per year" — renders IBM Plex Mono. */
    unitMono: z.string(),
    /** e.g. "25 devices" or null where there is no minimum. Renders IBM Plex Mono. */
    minimumMono: z.string().nullable(),
    /** One sentence: who this is for. Not a pitch. */
    forWhom: z.string(),
    includes: z.array(z.string()),
    excludes: z.array(z.string()).default([]),
    /** Set on the school/nonprofit tier only. Renders the replacement-cost arithmetic (spec §6D). */
    showReplacementComparison: z.boolean().default(false),
    /**
     * Held back from the site. A blocked tier is still a file, still schema-checked, and still
     * read by whoever is deciding it — it just does not render.
     *
     * This exists because D30 removed the product from the $0 self-serve tier without removing
     * the tier: the recipes stopped being forkable, so the price stopped buying anything. What
     * replaces it is a pricing question and SPEC §9 reserves those for a human (BLOCKED.md B9).
     * Deleting the file would decide it by deletion; publishing it would ship a false offer.
     * So the tier stays, flagged, and the price table does not render it.
     *
     * Clear the flag only when B9 is answered, and by whoever answers it.
     */
    blocked: z.boolean().default(false),
    order: z.number(),
  }),
});

const faq = defineCollection({
  loader: glob({ base: "./src/content/faq", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    question: z.string(),
    /** The honest answer in one sentence, before the body expands it. */
    shortAnswer: z.string(),
    group: z.enum(["trust", "operations", "data", "hardware"]),
    order: z.number(),
  }),
});

/**
 * The layer stack. This collection is the text half of the terrain background (spec §7):
 * the renderer draws the strata, these files name them in the margin. The renderer is
 * owned by another agent; the words are owned here. `id` is the contract between them.
 */
const layers = defineCollection({
  loader: glob({ base: "./src/content/layers", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    id: z.enum(["sky", "surface", "topsoil", "stratum-1", "stratum-2", "bedrock"]),
    /** The margin label, e.g. "── bedrock ──". Lowercase. */
    marginLabel: z.string(),
    /** What this layer IS, e.g. "Fedora · Universal Blue". */
    name: z.string(),
    /** Who owns and patches it. One of: upstream, Auros, you. */
    /**
     * The sky is not owned by anybody, because nothing is built there. It carried `Auros` and
     * therefore rendered "Ours. Exactly one of it." — the auros-base label — directly above body
     * copy reading "Nothing is built here... the only layer with no file behind it." One shared
     * field was collapsing two different meanings. `nobody` is the fourth case.
     */
    ownedBy: z.enum(["upstream", "Auros", "you", "nobody"]),
    /** Factual identifier for this layer, rendered IBM Plex Mono. Empty string where none. */
    refMono: z.string(),
    /** Depth order, 0 = sky, 5 = bedrock. Matches the renderer's stratum index. */
    depth: z.number(),
  }),
});

export const collections = { pages, migration, tiers, faq, layers };
