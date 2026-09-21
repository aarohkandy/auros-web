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
import {
  firstDifference,
  explainDifference,
  stripVolatile,
  runIdSets,
} from "./lib/snapshot-diff.mjs";

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
  (v.display === undefined || typeof v.display === "string") &&
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

// ── `--check` is a CONTENT check, not a run-id check ─────────────────────────────────────────────
//
// THE DEFECT THESE COVER. `snapshot-build-log.mjs --check` had two branches. The `--notable` one
// compared the full payload. The other one — for `last-build.json`, the file index, /how-it-works
// and /order all render — was:
//
//     if (onDisk.run?.runId === snapshot.run.runId) { console.log('up to date'); process.exit(0) }
//
// Two lines no runner printed were added to that file, the id was left alone, and `--check` exited
// 0 — and `--check` is exactly what `./verify` runs as "build console shows only real runs". One of
// the two was `✓ wifi associates · Intel 7260 · 3.1 s`: a hardware claim, on the page whose whole
// argument is that we do not make hardware claims we have not measured.
//
// `firstDifference` is the comparison the tool now performs, in both branches. These tests drive it
// with the ACTUAL injected lines, and the first one pins the old behaviour so that a revert to an
// id comparison cannot pass this file.

const FABRICATED = [
  { text: "✓ wifi associates · Intel 7260 · 3.1 s", level: "good", job: null, at: null },
  { text: "every check passed · signed · cosign keyless", level: "good", job: null, at: null },
];

/** The lines injected as the attack had them: in the middle, stamped inside the run's own window. */
function fabricate(snap) {
  const bad = clone(snap);
  const at = bad.lines.find((l) => l.at)?.at ?? null;
  bad.lines.splice(40, 0, ...FABRICATED.map((l) => ({ ...l, at, job: bad.lines[40]?.job ?? null })));
  return bad;
}

test("the committed snapshot compares equal to itself", () => {
  assert.equal(firstDifference(read(LAST), read(LAST)), null);
  assert.equal(firstDifference(read(NOTABLE), read(NOTABLE)), null);
});

test("generatedAt and $comment are the only things a re-run is allowed to move", () => {
  const a = read(LAST);
  const b = clone(a);
  b.generatedAt = "2030-01-01T00:00:00Z";
  b.$comment = "something else entirely";
  assert.equal(
    firstDifference(a, b),
    null,
    "a payload differing only in generatedAt/$comment was reported as a difference — the check would be red on every re-run and would get ignored",
  );
  assert.ok(!("generatedAt" in stripVolatile(a)), "stripVolatile left generatedAt in place");
  assert.ok(!("$comment" in stripVolatile(a)), "stripVolatile left $comment in place");
});

test("RED — the two fabricated lines are caught, and named", () => {
  const onDisk = fabricate(read(LAST));
  const wouldWrite = read(LAST);
  const diff = firstDifference(onDisk, wouldWrite);
  assert.ok(diff, "a snapshot with two lines no runner printed compared EQUAL to the derived one");
  const message = explainDifference(diff, { onDisk, wouldWrite }).join("\n");
  assert.match(
    message,
    /wifi associates/,
    `the refusal did not name the fabricated line. It said:\n${message}`,
  );
  assert.match(message, /first differing line/, "the refusal did not say it was a line that differs");
});

test("RED — the ORIGINAL defect: the run id is identical, so an id comparison is green", () => {
  // This is the check that shipped. It is reproduced here, not imported, precisely so that the
  // assertion is about the SHAPE of comparison rather than about today's code — a revert to
  // comparing run ids makes the fabricated file pass this reproduction and fail the test above.
  const onDisk = fabricate(read(LAST));
  const wouldWrite = read(LAST);
  const idOnlyVerdict = onDisk.run?.runId === wouldWrite.run.runId ? "up to date" : "stale";
  assert.equal(
    idOnlyVerdict,
    "up to date",
    "the fabricated file no longer has the same run id, so this test is not reproducing the defect any more",
  );
  assert.ok(
    firstDifference(onDisk, wouldWrite),
    "the content comparison agrees with the id comparison — the fix is not in place",
  );
});

test("RED — a swapped line in the pinned set names the LINE, not two identical id lists", () => {
  // D-rule 2: when an assertion fails it must print what IS there. The pinned check DID catch this
  // and then printed "on disk: 35544563774, 35543147750, …" twice — the same list, naming a
  // dimension that had not changed. The one refusal that worked read like a spurious failure.
  const wouldWrite = read(NOTABLE);
  const onDisk = clone(wouldWrite);
  onDisk.runs[0].lines[0].text = "every check passed · signed · cosign keyless";
  const diff = firstDifference(onDisk, wouldWrite);
  assert.ok(diff, "a fabricated line in the pinned set compared equal");
  const message = explainDifference(diff, { onDisk, wouldWrite }).join("\n");
  assert.match(message, /every check passed/, `the refusal did not print the line on disk:\n${message}`);
  assert.match(message, new RegExp(String(onDisk.runs[0].run.runId)), "the refusal did not name the run");
  assert.equal(
    runIdSets(onDisk, wouldWrite),
    null,
    "the pinned SETS differ in this fixture, so it is not reproducing the defect — the point is that they do NOT",
  );
});

test("RED — a set that really did change still reports the sets", () => {
  const wouldWrite = read(NOTABLE);
  const onDisk = clone(wouldWrite);
  onDisk.runs[0].run.runId = 1;
  const sets = runIdSets(onDisk, wouldWrite);
  assert.ok(sets, "a genuinely different pinned set was not reported as one");
  assert.notDeepEqual(sets.onDisk, sets.wouldWrite);
});

test("RED — a line removed from the committed file is caught at the line it was removed from", () => {
  const wouldWrite = read(LAST);
  const onDisk = clone(wouldWrite);
  const dropped = onDisk.lines.splice(12, 1)[0];
  const diff = firstDifference(onDisk, wouldWrite);
  assert.ok(diff, "a snapshot missing one of the runner's lines compared equal");
  const message = explainDifference(diff, { onDisk, wouldWrite }).join("\n");
  assert.match(message, /line 12/, `the refusal did not point at line 12:\n${message}`);
  assert.ok(dropped, "fixture removed nothing");
});

// ── the published `text` is the runner's string ──────────────────────────────────────────────────
//
// The component tells a reader they can open the run and find the same line. That was true of every
// reduction the tool performs — ANSI, timestamps, trailing space, group titles, consecutive
// duplicates — except one: `##[error]X` was PUBLISHED as `error: X`. GitHub renders the annotation
// rather than showing that prefix, so a reader searching the log for "error: " finds nothing. Nine
// such lines shipped. The prefix now stays in `text` and the readable form rides in `display`.

const ANNOTATION = /^##\[(error|warning|notice)\]/;
const REWRITTEN = /^(error|warning|notice): /;
const allLines = () => [
  ...read(LAST).lines.map((l) => ({ l, where: `last-build.json` })),
  ...read(NOTABLE).runs.flatMap((r) => r.lines.map((l) => ({ l, where: `notable run ${r.run.runId}` }))),
];

test("no published line has had an annotation prefix rewritten into its text", () => {
  for (const { l, where } of allLines()) {
    assert.ok(
      !REWRITTEN.test(l.text),
      `${where}: text is "${l.text.slice(0, 60)}…" — that string is ours, not the runner's. ` +
        "A reader who opens the run and searches for it finds nothing.",
    );
  }
});

test("every line with a display carries the runner's annotation in text, and agrees with it", () => {
  let seen = 0;
  for (const { l, where } of allLines()) {
    if (l.display === undefined) continue;
    seen++;
    assert.match(l.text, ANNOTATION, `${where}: a display was set on a line with no annotation prefix: ${l.text}`);
    assert.equal(
      l.display,
      l.text.replace(ANNOTATION, (_, k) => `${k}: `),
      `${where}: display and text disagree — display is not a rendering of text, it is a second line`,
    );
    seen++;
  }
  assert.ok(seen > 0, "no line in either committed file carries a display; this check has nothing to observe");
});

test("RED — a display that is not a rendering of its own text is caught", () => {
  const bad = clone(read(LAST));
  const line = bad.lines.find((l) => l.display !== undefined);
  assert.ok(line, "the fixture has no annotated line to corrupt");
  line.display = "✓ everything is fine";
  assert.notEqual(
    line.display,
    line.text.replace(ANNOTATION, (_, k) => `${k}: `),
    "a display invented out of nothing matched its text — the agreement check is decoration",
  );
});

// ── the shipping tool actually uses the comparison above ─────────────────────────────────────────
// The tests above exercise the library. This one asserts the TOOL reaches for it, in the branch
// that was wrong, because a library nothing calls is a library that proves nothing about the gate.
test("the tool's non-notable --check compares the payload, not the run id", () => {
  const src = readFileSync(resolve(root, "tools/snapshot-build-log.mjs"), "utf8");
  assert.match(src, /firstDifference\(onDiskSnapshot, snapshot\)/,
    "the latest-build --check branch no longer calls firstDifference on the whole payload");
  assert.ok(
    !/onDisk\.run\?\.runId === snapshot\.run\.runId/.test(src),
    "the run-id-only comparison is back in snapshot-build-log.mjs; that is the bug, verbatim",
  );
  assert.match(src, /if \(!OPT\.run\) OPT\.run = String\(named\)/,
    "--check no longer derives from the run the committed file names, so it is back to failing as 'stale'");
});

// ── two sentences that were true in one state and printed in both ────────────────────────────────
//
// Read from the sources rather than from a rendered page, because these run before `astro build`
// and because the defect is structural: a string that is printed unconditionally while describing a
// conditional state. Both are the same shape as the one `outcomeNote` in BuildConsole.astro had
// already been split for.

const copySrc = readFileSync(resolve(root, "src/content/copy.ts"), "utf8");
const componentSrc = readFileSync(resolve(root, "src/components/BuildConsole.astro"), "utf8");

/** The value of a single-line string literal in an object, by key. */
function literal(src, key) {
  const m = new RegExp(`\\b${key}:\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(src);
  assert.ok(m, `${key} is not a plain string literal in the source any more — this test cannot read it`);
  return m[1];
}

test("the subtitle's claim about a run below is conditional on there being one", () => {
  // The unconditional version ended "…what is below is the last run that actually happened rather
  // than a picture of a steady state", printed directly above a panel that says, with no snapshot
  // committed, "We have no record of a completed run to show you here".
  const always = literal(copySrc, "subtitle");
  assert.ok(
    !/below/i.test(always),
    `buildConsole.subtitle is printed in both states and says: "${always}" — "below" is a claim about a panel that may be empty`,
  );
  const noRecord = literal(copySrc, "subtitleNoRecord");
  assert.ok(
    !/last run|actually happened/i.test(noRecord),
    `the no-record clause claims a run: "${noRecord}"`,
  );
  assert.match(
    componentSrc,
    /snap \? buildConsole\.subtitleLastRun : buildConsole\.subtitleNoRecord/,
    "the component no longer chooses the subtitle's last clause on whether a snapshot exists",
  );
});

test("the noscript only promises a live stream on a console that can have one", () => {
  // client.ts returns before opening an EventSource unless the component was given a `recipe` or a
  // `run`. index, how-it-works and order pass neither, so on every page that ships there is no live
  // stream — and the shipped <noscript> said "The live stream needs JavaScript", which told a reader
  // with script enabled that they were getting live output.
  assert.match(
    componentSrc,
    /const canStream = Boolean\(recipe \|\| run\)/,
    "the component no longer derives whether it can stream from the same condition client.ts uses",
  );
  assert.match(
    componentSrc,
    /canStream \? strings\.noscriptLive : strings\.noscriptStatic/,
    "the <noscript> no longer chooses its sentence on whether this console can stream at all",
  );
  const live = literal(componentSrc, "noscriptLive");
  const staticNote = literal(componentSrc, "noscriptStatic");
  assert.match(live, /live stream/i, "noscriptLive stopped being the live-stream sentence");
  assert.ok(
    !/live stream needs/i.test(staticNote),
    `the sentence shown on a console with nothing to stream still promises a stream: "${staticNote}"`,
  );
});
