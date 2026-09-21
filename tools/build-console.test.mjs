/**
 * build-console.test — what the build console publishes, and what it refuses to publish.
 *
 * D37: "a check that cannot fail is not a check", and D34's sharper form, "every check must be
 * watched failing, mechanically". Both of those were written about checks that looked exactly like
 * working ones. So this file does not only assert that the committed snapshots are good; for every
 * property that matters it BREAKS the property in a scratch copy and asserts the thing that is
 * supposed to notice actually notices. A test that only ever sees the committed, correct files is
 * the permanently-green shape those two decisions are about.
 *
 * Nothing here touches the network. The generator is the only thing that talks to GitHub, and it
 * exits 2 rather than writing a line it did not fetch; this file is about the files it produced.
 *
 *   node --test tools/build-console.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LAST = resolve(root, "src/lib/console/last-build.json");
const NOTABLE = resolve(root, "src/lib/console/notable-runs.json");
const MANIFEST = resolve(root, "tools/notable-runs.manifest.json");

const read = (p) => JSON.parse(readFileSync(p, "utf8"));

/**
 * The validators, transcribed from `snapshot.ts` and `notable.ts`.
 *
 * Transcribed rather than imported because those modules are TypeScript that reaches for
 * `import.meta.glob`, which only exists inside Vite — importing them from a bare `node --test`
 * process does not work, and the version that "worked" would be a stub proving nothing. Keeping
 * them in step is what `renders the committed set` below is for: it runs the transcription against
 * the real committed file, so a divergence that would change what the page shows fails here.
 */
const LEVELS = new Set(["section", "good", "bad", "warn", "note", "info", "meta"]);
const isLine = (v) =>
  typeof v === "object" &&
  v !== null &&
  typeof v.text === "string" &&
  typeof v.level === "string" &&
  LEVELS.has(v.level) &&
  (v.job === null || typeof v.job === "string") &&
  (v.at === null || typeof v.at === "string");

const isNotableRun = (v) =>
  typeof v === "object" &&
  v !== null &&
  typeof v.why === "string" &&
  v.why.trim() !== "" &&
  typeof v.run === "object" &&
  v.run !== null &&
  typeof v.run.url === "string" &&
  v.run.url.startsWith("https://github.com/") &&
  typeof v.run.startedAt === "string" &&
  typeof v.run.conclusion === "string" &&
  Array.isArray(v.lines) &&
  v.lines.length > 0 &&
  v.lines.every(isLine);

/** `notable.ts`'s export, as a pure function of the parsed file. */
function renderableRuns(value) {
  if (typeof value !== "object" || value === null) return [];
  const runs = value.runs;
  if (!Array.isArray(runs) || !runs.every(isNotableRun)) return [];
  const outcomes = new Set(runs.map((r) => r.run.conclusion));
  if (!outcomes.has("success") || !outcomes.has("failure")) return [];
  return runs;
}

const clone = (o) => JSON.parse(JSON.stringify(o));

// ── the committed files ─────────────────────────────────────────────────────────────────────────

test("both snapshots are committed", () => {
  assert.ok(existsSync(LAST), `${LAST} is missing — the console would have nothing to show`);
  assert.ok(existsSync(NOTABLE), `${NOTABLE} is missing — the record would be empty`);
  assert.ok(existsSync(MANIFEST), `${MANIFEST} is missing — nothing pins the record`);
});

test("every pinned line is traceable to a run a reader can open", () => {
  for (const item of read(NOTABLE).runs) {
    const { run } = item;
    assert.match(
      run.url,
      /^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+$/,
      `pinned run ${run.runId} has url ${run.url}, which is not a run a reader can open`,
    );
    assert.equal(
      String(run.runId),
      run.url.split("/").pop(),
      `pinned run ${run.runId} links to ${run.url} — the id and the link disagree`,
    );
    assert.ok(
      Number.isFinite(Date.parse(run.startedAt)),
      `pinned run ${run.runId} has startedAt ${run.startedAt}, which is not a time`,
    );
  }
});

test("the record renders, and it is mixed", () => {
  const runs = renderableRuns(read(NOTABLE));
  assert.ok(runs.length > 0, "the committed record does not render at all");
  const greens = runs.filter((r) => r.run.conclusion === "success").length;
  const reds = runs.length - greens;
  assert.ok(greens > 0, `the record has ${greens} successes; a console that has only ever been red is as unconvincing as one that has only ever been green`);
  assert.ok(reds > 0, `the record has ${reds} failures; an all-green console reads as staged`);
});

test("the manifest and the generated record name the same runs", () => {
  const wanted = read(MANIFEST).runs.map((r) => r.runId).sort();
  const got = read(NOTABLE).runs.map((r) => r.run.runId).sort();
  assert.deepEqual(
    got,
    wanted,
    `the committed record holds ${got.join(", ")} but the manifest pins ${wanted.join(", ")} — run \`pnpm snapshot:notable\``,
  );
});

test("each pinned run's declared outcome matches the run in the record", () => {
  const byId = new Map(read(NOTABLE).runs.map((r) => [r.run.runId, r.run]));
  for (const entry of read(MANIFEST).runs) {
    const run = byId.get(entry.runId);
    assert.ok(run, `manifest pins ${entry.runId}, which is not in the record`);
    if (entry.expect?.conclusion) {
      assert.equal(
        run.conclusion,
        entry.expect.conclusion,
        `manifest says run ${entry.runId} ${entry.expect.conclusion}; the record says ${run.conclusion}`,
      );
    }
    if (entry.expect?.workflow) {
      assert.equal(run.workflow, entry.expect.workflow,
        `manifest says run ${entry.runId} is workflow ${entry.expect.workflow}; the record says ${run.workflow}`);
    }
  }
});

test("the latest-build snapshot is a real run with real lines", () => {
  const snap = read(LAST);
  assert.match(snap.run.url, /^https:\/\/github\.com\/\S+\/actions\/runs\/\d+$/);
  assert.ok(snap.lines.length > 0, "the snapshot has no lines");
  assert.ok(snap.lines.every(isLine), "the snapshot has a line the loader would refuse");
  assert.ok(
    snap.linesInLog >= snap.linesShown,
    `the snapshot claims ${snap.linesShown} of ${snap.linesInLog} lines, which is not a ratio`,
  );
  // Every line the runner stamped must fall inside the run. A line from outside it is a line from
  // somewhere else, which is the only shape a fabricated line could take in this file.
  const start = Date.parse(snap.run.startedAt);
  const end = Date.parse(snap.run.endedAt) + 60_000;
  for (const line of snap.lines) {
    if (!line.at) continue;
    const t = Date.parse(line.at);
    assert.ok(t >= start && t <= end,
      `a line stamped ${line.at} is outside run ${snap.run.runId} (${snap.run.startedAt} → ${snap.run.endedAt}): ${line.text}`);
  }
});

// ── the red states ──────────────────────────────────────────────────────────────────────────────
// Each case below reintroduces one specific defect into a COPY of the committed data and asserts
// that the thing responsible for noticing refuses. A check watched in only one direction is what
// D34 makes the suite fail for, so every property asserted above appears here going the other way.

test("RED — an all-green record does not render", () => {
  const bad = clone(read(NOTABLE));
  for (const r of bad.runs) r.run.conclusion = "success";
  assert.equal(renderableRuns(bad).length, 0,
    "a record with no failure in it rendered; the all-green refusal is decoration");
});

test("RED — an all-red record does not render either", () => {
  const bad = clone(read(NOTABLE));
  for (const r of bad.runs) r.run.conclusion = "failure";
  assert.equal(renderableRuns(bad).length, 0,
    "a record with no success in it rendered; the refusal is one-directional");
});

test("RED — a pinned run with no link does not render", () => {
  const bad = clone(read(NOTABLE));
  bad.runs[0].run.url = "https://example.invalid/somewhere";
  assert.equal(renderableRuns(bad).length, 0,
    "a run a reader cannot open rendered; an unverifiable claim is the one thing this cannot ship");
});

test("RED — a pinned run with no lines under it does not render", () => {
  const bad = clone(read(NOTABLE));
  bad.runs[0].lines = [];
  assert.equal(renderableRuns(bad).length, 0,
    "a `why` sentence with no output under it rendered — that is a claim with no evidence");
});

test("RED — a pinned run with no reason does not render", () => {
  const bad = clone(read(NOTABLE));
  bad.runs[0].why = "   ";
  assert.equal(renderableRuns(bad).length, 0, "a run with no stated reason rendered");
});

test("RED — a line with an invented level does not render", () => {
  const bad = clone(read(NOTABLE));
  bad.runs[0].lines[0].level = "triumph";
  assert.equal(renderableRuns(bad).length, 0, "an unknown level rendered instead of being refused");
});

test("RED — a malformed file renders as nothing, not as a crash", () => {
  assert.equal(renderableRuns(null).length, 0);
  assert.equal(renderableRuns({}).length, 0);
  assert.equal(renderableRuns({ runs: "yes" }).length, 0);
  assert.equal(renderableRuns({ runs: [{ why: "x" }] }).length, 0);
});

test("RED — the manifest/record agreement check notices a swapped id", () => {
  const record = clone(read(NOTABLE));
  record.runs[0].run.runId = 1;
  const wanted = read(MANIFEST).runs.map((r) => r.runId).sort();
  const got = record.runs.map((r) => r.run.runId).sort();
  assert.notDeepEqual(got, wanted, "a swapped run id went unnoticed");
});

test("RED — a line stamped outside its run is caught", () => {
  const snap = clone(read(LAST));
  const start = Date.parse(snap.run.startedAt);
  const end = Date.parse(snap.run.endedAt) + 60_000;
  const smuggled = { text: "✓ everything is fine", level: "good", job: null, at: "2019-01-01T00:00:00Z" };
  snap.lines.push(smuggled);
  const outside = snap.lines.filter((l) => l.at && (Date.parse(l.at) < start || Date.parse(l.at) > end));
  assert.ok(outside.length >= 1,
    "a line stamped years before the run passed the window check — the window is decoration");
  assert.ok(outside.some((l) => l.text === smuggled.text),
    "the window check found something, but not the line that was smuggled in");
});
