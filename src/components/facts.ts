/**
 * The facts this site is allowed to print, read from the files that hold them.
 *
 * D29 asks for life, and names where it comes from: "Real digests, real package counts, the real
 * 3.5 GB, the real Marathi sentence from the example recipe." None of those are copy. They are
 * values in files in this project, and a website that prints a digest it typed out by hand is
 * doing the same thing as a website that invents one — it is just slower to go wrong.
 *
 * So every value below is READ FROM ITS SOURCE FILE AT BUILD TIME when that file is reachable,
 * and every value carries the path it came from so the page can say where it got it.
 *
 * WHY THERE ARE ALSO LITERALS IN HERE
 * `auros-web` is its own repository. On this machine it sits beside `auros-base`, `auros-recipes`
 * and `hardware/`, and the live read works. On a CI runner that has checked out only this repo, it
 * does not. The literal is the transcription taken on the date recorded in `transcribedOn`, it is
 * only ever used when the source file cannot be opened, and the live value always wins. A
 * transcription with a date on it is honest; a transcription pretending to be a live read is not,
 * which is why `source.live` is on every group and why the components print it.
 *
 * Nothing here is generated, averaged, rounded for effect or estimated. If a fact is not in a file,
 * it is not in this module, and the page says nothing rather than something plausible.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

/** `<repo-root>/auros-web/src/components` → the directory the sibling repositories sit in. */
const REPOS = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function read(relative: string): string | undefined {
  try {
    return readFileSync(join(REPOS, relative), "utf8");
  } catch {
    return undefined;
  }
}

function match(text: string | undefined, re: RegExp): string | undefined {
  const m = text?.match(re);
  return m?.[1]?.trim();
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// THE BASE. auros-base/base.lock — resolved by CI, never edited by hand.
// ───────────────────────────────────────────────────────────────────────────────────────────────

const BASE_LOCK_PATH = "auros-base/base.lock";
const lock = read(BASE_LOCK_PATH);

const digest =
  match(lock, /^UPSTREAM_DIGEST=(\S+)$/m) ??
  "sha256:911281f2aaa42bfd17532c5cef917aba8d7ac8c0faeb1c1edc6a43dc28d0d2f1";
const pullBytesRaw = match(lock, /^UPSTREAM_PULL_SIZE_BYTES=(\d+)$/m) ?? "3758096384";
const resolvedAt = match(lock, /^UPSTREAM_RESOLVED_AT=(\S+)$/m) ?? "2026-09-20T21:25:07Z";
const upstreamImage = match(lock, /^UPSTREAM_IMAGE=(\S+)$/m) ?? "ghcr.io/ublue-os/aurora";
const upstreamTag = match(lock, /^UPSTREAM_TAG=(\S+)$/m) ?? "stable";

const pullBytes = Number(pullBytesRaw);

/** 3758096384 → "3.5 GB". One decimal place, because that is the precision the number supports. */
function gigabytes(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export const base = {
  /** The full digest. Printed in full on purpose: a truncated one is a thing you cannot check. */
  digestMono: digest,
  /** The same digest, shortened for a line that has to fit beside other things. */
  digestShortMono: `${digest.slice(0, 14)}…${digest.slice(-9)}`,
  upstreamMono: `${upstreamImage}:${upstreamTag}`,
  bytes: pullBytes,
  bytesMono: pullBytes.toLocaleString("en-US"),
  sizeMono: gigabytes(pullBytes),
  resolvedAtMono: resolvedAt,
  /** Just the date, for a line where the full timestamp is more precision than the sentence needs. */
  resolvedOnMono: resolvedAt.slice(0, 10),
  sourcePath: BASE_LOCK_PATH,
  live: lock !== undefined,
  transcribedOn: "2026-09-20",
} as const;

// ───────────────────────────────────────────────────────────────────────────────────────────────
// THE SCHEDULES. Two crons, in two workflow files, in two repositories.
// ───────────────────────────────────────────────────────────────────────────────────────────────

const NIGHTLY_PATH = "auros-base/.github/workflows/nightly.yml";
const STRANGER_PATH = "auros-recipes/.github/workflows/replaceable.yml";

const nightlyYml = read(NIGHTLY_PATH);
const strangerYml = read(STRANGER_PATH);

/** `'17 4 * * *'` → `04:17 UTC`. Returns undefined for anything it cannot read exactly. */
function cronTime(yml: string | undefined): string | undefined {
  const cron = match(yml, /- cron:\s*'(\d+\s+\d+\s+[^']+)'/);
  if (!cron) return undefined;
  const [minute, hour] = cron.split(/\s+/);
  if (minute === undefined || hour === undefined) return undefined;
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")} UTC`;
}

export const schedules = {
  /** The nightly base rebuild. Off the hour deliberately; the workflow file says why. */
  nightlyMono: cronTime(nightlyYml) ?? "04:17 UTC",
  nightlySourcePath: NIGHTLY_PATH,
  nightlyLive: nightlyYml !== undefined,

  /**
   * The `stranger` job: a container with podman, git and nothing of ours, cloning the public
   * repository and running the command printed on /replaceable, verbatim, every week.
   */
  strangerMono: cronTime(strangerYml) ?? "05:23 UTC",
  strangerDayMono: "Wednesday",
  strangerSourcePath: STRANGER_PATH,
  strangerLive: strangerYml !== undefined,
} as const;

// ───────────────────────────────────────────────────────────────────────────────────────────────
// THE EXAMPLE RECIPE. auros-recipes/customers/example-school/recipe.yaml.
//
// Line 1 of that file reads "# ILLUSTRATIVE EXAMPLE — not a customer. No organisation named here
// exists." Every component that prints any of this carries that label with it. §4.4.
// ───────────────────────────────────────────────────────────────────────────────────────────────

const RECIPE_PATH = "auros-recipes/customers/example-school/recipe.yaml";
const recipeYml = read(RECIPE_PATH);

export const exampleRecipe = {
  /**
   * The first thing a pupil sees. The site says "in your language" repeatedly and has never once
   * shown the language; this is the language. Marathi, in the script it is written in.
   */
  firstBootMessage:
    match(recipeYml, /^first_boot_message:\s*(.+)$/m) ??
    "नमस्कार! काही अडचण असल्यास शिक्षकांना सांगा.",
  firstBootLang: "mr",
  language: match(recipeYml, /^language:\s*(.+)$/m) ?? "Marathi",
  /** The floor on deletion. The customer saying: if you cannot take out this many, fail the build. */
  mustRemoveAtLeastMono: match(recipeYml, /must_remove_at_least:\s*(\d+)/) ?? "240",
  switchScriptsWithMono: match(recipeYml, /^switch_scripts_with:\s*(.+)$/m) ?? "Windows key + Spacebar",
  updatesWindowMono: match(recipeYml, /install_between:\s*"([^"]+)"/) ?? "21:00-05:00",
  sizeBudgetMono: `${match(recipeYml, /^size_budget_gb:\s*(\d+)/m) ?? "9"} GB`,
  modelsMono: (match(recipeYml, /^\s*models:\s*\[([^\]]+)\]/m) ?? "dell-latitude-e6440, hp-probook-650-g1, lenovo-thinkpad-t440")
    .split(",")
    .map((s) => s.trim()),
  approvedOnMono: match(recipeYml, /approved_by:.*?date:\s*"([\d-]+)"/s) ?? "2026-09-18",
  sourcePath: RECIPE_PATH,
  live: recipeYml !== undefined,
  /** Printed wherever any of the above is. Not a footnote — the same block, in the same voice. */
  illustrationNote:
    "Read from the example recipe in the public recipes repository, whose first line says it is an illustration and not a customer. No organisation named in it exists.",
} as const;

/**
 * The two Windows programs the example recipe records a real test result for, with the dates the
 * tests were run. The .exe argument is made in the abstract everywhere else on this site; this is
 * the argument with two rows in it, one of which is a failure.
 */
export const exampleWindowsApps = [
  {
    appMono: "Vidyalaya School ERP desktop client",
    dateMono: "2026-09-11",
    resultMono: "works with caveats",
    note: "Prints report cards. The fingerprint attendance module cannot see the reader.",
  },
  {
    appMono: "Tally.ERP",
    dateMono: "2026-09-11",
    resultMono: "fails",
    note: "Crashes during licence activation. The office PC stays on Windows for Tally.",
  },
] as const;

// ───────────────────────────────────────────────────────────────────────────────────────────────
// THE COMPATIBILITY TABLE. hardware/compat.tsv — a header row, and as of today nothing under it.
//
// SPEC §8 calls this "the thing competitors cannot copy quickly" after fifty rows. It has none.
// Printing the empty table, dated, is worth more than describing a full one, and it is the only
// table on the internet a competitor cannot fake being ahead of.
// ───────────────────────────────────────────────────────────────────────────────────────────────

const COMPAT_PATH = "hardware/compat.tsv";
const compatTsv = read(COMPAT_PATH);
const compatLines = (compatTsv ?? "model\tyear\tsource\tcpu\tram_gb\tfirmware\twifi\ttrackpad\tsuspend\tbrightness\tgpu\taudio\twebcam\tverdict\tnotes\ttested_on\ttester")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

export const compat = {
  columnsMono: (compatLines[0] ?? "").split("\t").filter(Boolean),
  rowCount: Math.max(0, compatLines.length - 1),
  sourcePath: COMPAT_PATH,
  live: compatTsv !== undefined,
} as const;
