/**
 * The last real build, read at site-build time.
 *
 * Spec §7 gives the build console one job — stream genuine pipeline output — and D29 makes it the
 * page's living element, "a thing genuinely happening", explicitly *instead of* animation. Both of
 * those depend on one property: every line the console shows was printed by a machine that ran.
 *
 * Most of the time no build is in flight. The honest thing to show then is not an empty box and
 * certainly not a plausible-looking one: it is **the last run that actually happened**, said to be
 * exactly that, with the time it happened and a link to it. That is what this module loads.
 *
 * The file it reads is written by `tools/snapshot-build-log.mjs` from the GitHub Actions API and
 * committed. Nothing here can produce a line: if the file is missing or malformed, this module
 * returns `null` and the console says there is nothing to show. There is no default, no fixture and
 * no example run. A console that can invent output is worse than no console on a page whose entire
 * argument is that we tell you what we removed.
 */

export type LineLevel = "section" | "good" | "bad" | "warn" | "note" | "info" | "meta";

export interface BuildLine {
  text: string;
  level: LineLevel;
  /** The job the line came from, or null for a line this site added about the log itself. */
  job: string | null;
  /** ISO timestamp the runner stamped on the line. */
  at: string | null;
}

export interface BuildRun {
  repo: string;
  workflow: string;
  runId: number;
  runNumber: number;
  attempt: number;
  url: string;
  conclusion: "success" | "failure" | string;
  title: string | null;
  headSha: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
}

export interface BuildSnapshot {
  schema: number;
  generatedAt: string;
  run: BuildRun;
  linesShown: number;
  linesOmitted: number;
  lines: BuildLine[];
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
 * `import.meta.glob` rather than a static import, because the snapshot is generated and may
 * legitimately be absent — on a fresh clone, or before the first run of the tool. A static import
 * of a missing file fails the build, which would turn "we have no build to show" into "the site
 * does not exist". The absence has to be a state the site can render, not a build error.
 */
const found = import.meta.glob<{ default: unknown }>("./last-build.json", { eager: true });

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

/** Validated, or null. Deliberately strict: a half-parsed log is a log we cannot vouch for. */
function parse(value: unknown): BuildSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const run = v["run"];
  if (typeof run !== "object" || run === null) return null;
  const r = run as Record<string, unknown>;
  if (typeof r["url"] !== "string" || typeof r["startedAt"] !== "string") return null;
  if (typeof r["conclusion"] !== "string") return null;
  const lines = v["lines"];
  if (!Array.isArray(lines) || lines.length === 0 || !lines.every(isLine)) return null;
  return v as unknown as BuildSnapshot;
}

/** The last real run, or null if we have no record of one. Null is a state, not a failure. */
export const lastBuild: BuildSnapshot | null = (() => {
  const mod = Object.values(found)[0];
  return mod ? parse(mod.default) : null;
})();

/** `7m 44s`. A duration is a fact about a machine, so it is rendered in mono wherever it appears. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

/**
 * `+1:23` — how far into the run this line was printed. Elapsed rather than wall-clock because the
 * reader is looking at a build, not at a clock, and because it is true in every timezone.
 */
export function elapsed(at: string | null, startedAt: string): string {
  if (!at) return "";
  const d = (Date.parse(at) - Date.parse(startedAt)) / 1000;
  if (!Number.isFinite(d) || d < 0) return "";
  const m = Math.floor(d / 60);
  const s = Math.floor(d % 60);
  return `+${m}:${String(s).padStart(2, "0")}`;
}

/** `2026-09-20 22:14 UTC`. The server has no timezone to be right about, so it states the one it has. */
export function utcStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

/** The short commit, which is how anyone who has the repository open would refer to it. */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}
