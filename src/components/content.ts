/**
 * AUROS — content lookups used by the pages.
 *
 * Why this file exists: the pages route FROM the content collection (spec §6D). No prose is
 * duplicated into a template, and no page hard-codes a slug. Every lookup here is by a field
 * the content author controls (`order`, `id`, `verdict`, `group`), never by filename, so the
 * content agent can rename a file without breaking a route.
 *
 * I do not own `src/content/`. If a lookup here returns nothing, that is a real absence and the
 * caller says so on the page rather than rendering a plausible-looking blank.
 */
import { getCollection, render, type CollectionEntry } from "astro:content";

export type PageEntry = CollectionEntry<"pages">;
export type MigrationEntry = CollectionEntry<"migration">;
export type TierEntry = CollectionEntry<"tiers">;
export type FaqEntry = CollectionEntry<"faq">;
export type LayerEntry = CollectionEntry<"layers">;

/** The `order` of each page in `src/content/pages/`. Routes are keyed on this, not on filenames. */
export const PAGE_ORDER = {
  landing: 1,
  whatDoesntComeAcross: 2,
  pricing: 3,
  faq: 4,
  replaceable: 5,
  howItWorks: 6,
} as const;

/**
 * Fetch one long-form page by its `order`. Throws rather than falling back: a page that renders
 * with its prose silently missing is worse than a build that stops.
 */
export async function pageByOrder(order: number): Promise<PageEntry> {
  const all = await getCollection("pages");
  const found = all.find((p) => p.data.order === order);
  if (!found) {
    throw new Error(
      `content: no entry in the \`pages\` collection with order ${order}. ` +
        `Found orders: ${all.map((p) => p.data.order).sort((a, b) => a - b).join(", ")}. ` +
        `Pages route from the collection (spec §6D), so this is a missing document, not a missing template.`,
    );
  }
  return found;
}

/** Every migration entry, in the author's order. */
export async function migrationEntries(): Promise<MigrationEntry[]> {
  const all = await getCollection("migration");
  return all.sort((a, b) => a.data.order - b.data.order);
}

/** The entries the content author marked `onLanding` — the above-the-fold column (spec §6D). */
export async function landingMigrationEntries(): Promise<MigrationEntry[]> {
  return (await migrationEntries()).filter((e) => e.data.onLanding);
}

export async function migrationByVerdict(
  verdict: MigrationEntry["data"]["verdict"],
): Promise<MigrationEntry[]> {
  return (await migrationEntries()).filter((e) => e.data.verdict === verdict);
}

/** The five §9-fixed tiers, in the author's order. */
export async function tiers(): Promise<TierEntry[]> {
  const all = await getCollection("tiers");
  return all.sort((a, b) => a.data.order - b.data.order);
}

export async function faqEntries(): Promise<FaqEntry[]> {
  const all = await getCollection("faq");
  return all.sort((a, b) => a.data.order - b.data.order);
}

/** The layer stack, sky (0) to bedrock (5). This is the real architecture, so the order is the depth. */
export async function layers(): Promise<LayerEntry[]> {
  const all = await getCollection("layers");
  return all.sort((a, b) => a.data.depth - b.data.depth);
}

export async function layerById(id: LayerEntry["data"]["id"]): Promise<LayerEntry | undefined> {
  return (await layers()).find((l) => l.data.id === id);
}

/**
 * Render one collection entry's body.
 *
 * Wrapped in one place so that the pages call one render API and not two scattered through the
 * templates. Astro 7 removed the legacy `entry.render()` form along with legacy collections.
 */
export type AnyEntry = PageEntry | MigrationEntry | TierEntry | FaqEntry | LayerEntry;

export async function renderEntry(entry: AnyEntry) {
  // `render()` is typed against a live-collection entry shape that, under this repo's
  // `exactOptionalPropertyTypes`, no static collection entry satisfies. The cast is at the one call
  // site rather than at five, and the union above keeps the caller honest about what may be passed.
  return await render(entry as unknown as Parameters<typeof render>[0]);
}

/**
 * A stable HTML anchor for a collection entry. Ids from the content-layer loader carry no file
 * extension, but strip one if a loader ever supplies it, so an anchor never depends on that.
 */
export function entryAnchor(entry: { id: string }): string {
  return entry.id.replace(/\.(md|mdx)$/i, "");
}
