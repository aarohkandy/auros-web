/**
 * The pinned set of real runs that sits under the build console.
 *
 * WHY THIS EXISTS AT ALL. `last-build.json` holds the latest run, and on any given day the latest
 * run is whatever it happens to be. On the day this was written every completed `build.yml` run on
 * `main` had failed, so a console rendering only the latest one had only ever shown red — which is
 * exactly as unrepresentative as a console that has only ever shown green, and a reader cannot tell
 * either apart from a staged one. The pinned set fixes that by putting a handful of real runs on the
 * record permanently: the ones that measured the runner, the one that booted a 4.4 GB disk to a
 * login prompt, and the ones that broke for reasons worth reading.
 *
 * WHAT IT IS NOT. It is not a highlight reel we can curate into an advertisement. The generator
 * (`tools/snapshot-build-log.mjs --notable`) refuses to write a set that is all successes or all
 * failures, refuses any run whose workflow or outcome differs from what `tools/notable-runs.manifest.json`
 * declares — printing what the API actually said — and refuses a pinned run that reduces to zero
 * lines rather than leaving a sentence on the page with no evidence under it. The manifest's `keep`
 * and `drop` patterns can only widen or narrow WHICH of the lines a runner printed are shown; there
 * is no path in the tool, in this module, or in the component that can produce a line of text.
 *
 * `why` is the one part written by a person: a sentence saying why the run is worth a stranger's
 * attention. It sits next to the run's own URL so the reader can go and disagree with it.
 */

import type { BuildLine, BuildRun } from "./snapshot";

export interface NotableRun {
  /** The human sentence from the manifest. Everything else on the page came from the API. */
  why: string;
  run: BuildRun;
  linesShown: number;
  linesOmitted: number;
  linesInLog: number;
  lines: BuildLine[];
}

export interface NotableSet {
  schema: number;
  generatedAt: string;
  runs: NotableRun[];
}

const LEVELS: ReadonlySet<string> = new Set([
  "section",
  "good",
  "bad",
  "warn",
  "note",
  "info",
  "meta",
]);

/**
 * `import.meta.glob`, not a static import, for the same reason `snapshot.ts` uses one: the file is
 * generated and may legitimately be absent on a fresh clone. "We have nothing pinned yet" has to be
 * a state the page can render, not a build error.
 */
const found = import.meta.glob<{ default: unknown }>("./notable-runs.json", { eager: true });

function isLine(value: unknown): value is BuildLine {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["text"] === "string" &&
    typeof v["level"] === "string" &&
    LEVELS.has(v["level"]) &&
    (v["job"] === null || typeof v["job"] === "string") &&
    (v["at"] === null || typeof v["at"] === "string")
  );
}

function isRun(value: unknown): value is NotableRun {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v["why"] !== "string" || v["why"].trim() === "") return false;
  const run = v["run"];
  if (typeof run !== "object" || run === null) return false;
  const r = run as Record<string, unknown>;
  // A pinned run with no URL cannot be checked by the reader, and an unchecked claim is the thing
  // this whole component exists not to make. Strict on purpose.
  if (typeof r["url"] !== "string" || !r["url"].startsWith("https://github.com/")) return false;
  if (typeof r["startedAt"] !== "string" || typeof r["conclusion"] !== "string") return false;
  const lines = v["lines"];
  return Array.isArray(lines) && lines.length > 0 && lines.every(isLine);
}

/**
 * The pinned set, or `[]`.
 *
 * The all-green refusal is enforced twice: once in the generator, where it stops a bad set being
 * written, and once here, where it stops a bad set being RENDERED. They are different failures —
 * the generator protects the commit, this protects the page against a file edited by hand around
 * it — and D34's rule is that a check nobody can watch fail is not a check, so both are exercised
 * by `tools/build-console.test.mjs`.
 */
export const notableRuns: NotableRun[] = (() => {
  const mod = Object.values(found)[0];
  const value = mod?.default;
  if (typeof value !== "object" || value === null) return [];
  const runs = (value as Record<string, unknown>)["runs"];
  if (!Array.isArray(runs) || !runs.every(isRun)) return [];
  const outcomes = new Set(runs.map((r) => r.run.conclusion));
  if (!outcomes.has("success") || !outcomes.has("failure")) return [];
  return runs as NotableRun[];
})();
