#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// snapshot-build-log — freeze the most recent REAL CI run into the file the build console renders.
//
// Spec §7: the build console "streams genuine build output … it is more interesting than any
// animation and it is true." The word carrying that sentence is *true*. Most of the time no build is
// in flight, so the console has to show something, and the only honest something is **a run that
// actually happened**. This tool produces it. It invents nothing: every line in the output file was
// printed by a GitHub Actions runner, and the file carries the run URL and timestamps so a reader
// can open the run and read the same line in its original context.
//
// The output is committed. That is deliberate — the site is statically built, so the snapshot has to
// exist at build time, and committing it means the diff shows exactly which real lines we chose to
// show. A reducer that quietly changed what the public sees would be the same bug as a fake console.
//
//   node tools/snapshot-build-log.mjs [--repo owner/name] [--workflow build.yml] [--branch main]
//                                     [--out src/lib/console/last-build.json] [--max-lines 160]
//                                     [--run <id>] [--check]
//
//   --run       snapshot one specific run instead of the latest completed one.
//   --check     exit 1 if the committed snapshot is not, LINE FOR LINE, what this tool derives
//               from the run that snapshot names. Not a run-id comparison: an id comparison is
//               green for a file with lines in it that no runner ever printed, which is the one
//               thing this tool exists to make impossible. Staleness is printed as a note.
//   --notable   snapshot the PINNED set in tools/notable-runs.manifest.json instead, into
//               src/lib/console/notable-runs.json. Combines with --check.
//
// Auth: GITHUB_TOKEN or GH_TOKEN with `actions: read`. Job logs are not public even for a public
// repository, so without a token this exits 2 — and exiting 2 is the point. There is no code path
// here that writes a snapshot from anything other than a log fetched from the API.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { firstDifference, explainDifference, runIdSets } from './lib/snapshot-diff.mjs'

const API = 'https://api.github.com'

// ── arguments ───────────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
function arg (name, fallback) {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}
const OPT = {
  repo: arg('repo', 'aarohkandy/auros-base'),
  workflow: arg('workflow', 'build.yml'),
  branch: arg('branch', 'main'),
  out: resolve(process.cwd(), arg('out', 'src/lib/console/last-build.json')),
  maxLines: Number(arg('max-lines', '160')),
  run: arg('run', null),
  check: argv.includes('--check'),
  // --notable snapshots the PINNED set in tools/notable-runs.manifest.json instead of the latest
  // run. Both modes share every line of the reducer below; the only difference is which real runs
  // they read and that the pinned set may widen `KEEP` per run, visibly, in a committed file.
  notable: argv.includes('--notable'),
  manifest: arg('manifest', 'tools/notable-runs.manifest.json'),
  notableOut: arg('notable-out', 'src/lib/console/notable-runs.json'),
}

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
if (!TOKEN) {
  console.error('snapshot-build-log: no GITHUB_TOKEN / GH_TOKEN. Job logs need `actions: read`.')
  console.error('Refusing to write a snapshot from anything but a real fetched log.')
  process.exit(2)
}

async function api (path, { raw = false } = {}) {
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    headers: {
      authorization: `Bearer ${TOKEN}`,
      accept: raw ? 'application/vnd.github+json' : 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'auros-snapshot-build-log',
    },
    redirect: raw ? 'manual' : 'follow',
  })
  if (raw) {
    // The logs endpoint 302s to a signed blob URL that rejects our Authorization header.
    if (res.status === 302 || res.status === 301) {
      const loc = res.headers.get('location')
      const blob = await fetch(loc, { headers: { 'user-agent': 'auros-snapshot-build-log' } })
      if (!blob.ok) throw new Error(`log blob ${blob.status}`)
      return blob.text()
    }
    if (res.status === 404 || res.status === 410) return null // expired or never retained
    if (!res.ok) throw new Error(`${path} → ${res.status}`)
    return res.text()
  }
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text().catch(() => '')}`)
  return res.json()
}

// ── which run ───────────────────────────────────────────────────────────────────────────────────
async function latestCompletedRun () {
  if (OPT.run) return api(`/repos/${OPT.repo}/actions/runs/${OPT.run}`)
  const q = new URLSearchParams({ branch: OPT.branch, status: 'completed', per_page: '10' })
  const { workflow_runs: runs = [] } = await api(
    `/repos/${OPT.repo}/actions/workflows/${OPT.workflow}/runs?${q}`)
  // "Completed" includes cancelled and skipped runs, which produce no interesting output. A failed
  // run is exactly as real as a successful one and is kept — §7 shows failures, it does not hide
  // them, and an all-green console is the less believable one.
  const usable = runs.find(r => r.conclusion === 'success' || r.conclusion === 'failure')
  if (!usable) throw new Error(`no completed success/failure run of ${OPT.workflow} on ${OPT.branch}`)
  return usable
}

// ── the reducer ─────────────────────────────────────────────────────────────────────────────────
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g
const STAMP = /^﻿?(\d{4}-\d\d-\d\dT[\d:.]+Z)\s?/

// Steps that are runner plumbing. Nothing a reader wants and nothing that says what we built.
const PLUMBING_STEP = /^(Set up job|Complete job|Post |Run actions\/|Checkout|Pre Run)/

// Groups the runner and actions/checkout open for themselves. Their titles AND their contents are
// infrastructure trivia — "Setting up auth", "Determining the checkout info" — and none of it is a
// fact about the image we are building.
const PLUMBING_GROUP = /^(Runner Image Provisioner|Operating System|Runner Image|GITHUB_TOKEN Permissions|Secret Source|Getting Git version info|Initializing the repository|Disabling automatic garbage collection|Setting up auth|Fetching the repository|Determining the checkout info|Checking out the ref|Persisting credentials|Cleaning the repository|Removing auth|Post job cleanup)/

// Lines that are progress furniture, transaction tables or directory listings: real, and noise.
const DROP = [
  /^auros\[[^\]]*\]\s+\.\//,               // the build-context file listing
  /·\s+build context at /,                  // …and the heading that introduced it
  /\d{1,3}%\s*\|/,                          // dnf/podman progress bars
  /^\s*\[\d+\/\d+\]/,
  /^(Updating and loading repositories|Repositories loaded\.|Running transaction|Complete!)$/,
  /^(Transaction Summary|Installing:|Package\s+Arch|Total size of inbound|After this operation)/,
  /^[-=─]{10,}$/,
  /^auros\[[^\]]*\]\s*[-=─]{10,}$/,
  /^(Filesystem|\/dev\/root|tmpfs|overlay)\s/,
  /^---\s|^\s*$/,
  /Node 20 is being deprecated/,
  /^\s*(Getting|Download|Prepare|Complete job name)/,
  /^auros\[policy\]\s*(!|=)/,               // the policy banner's box drawing
  // Registry transfer chatter. Every layer of a 3.5 GB base image announces itself by digest; that
  // is forty lines saying "a byte moved" and none saying what the image now contains.
  /^(Copying (blob|config)|Writing manifest|Storing signatures|Trying to pull|Getting image source signatures)/,
  /^STEP \d+\/\d+:/,
  // Podman's failure line echoes the entire multi-line `RUN` from the Containerfile back as one
  // 700-character string with literal \n in it. The three lines immediately above it — the ✗, the
  // script that failed, and the runner's exit code — are the fact; this is the fact's stack trace,
  // and it is at the run URL. Dropped for legibility, never to soften a failure.
  /^Error: building at STEP "RUN /,
  /Node\.js 20 is deprecated/,
  /^(warning|notice): (Node|The following actions)/,
]

// Lines worth a stranger's attention even when they are not one of our own `auros[…]` lines.
const KEEP = [
  /^auros[:[]/,
  /^S\d+[: ]/,
  /^(mirror-upstream:|\s+(source|destination|already mirrored|verified:|using explicit))/,
  /^(AUROS_BASE_FROM|SOURCE_DATE_EPOCH)=/,
  /^(profiles to boot|publishable):/,
  /gate, harness and Containerfile all present/,
  /nightly\.yml is enabled/,
  /^##\[(error|warning|notice)\]/,
  /^Error:/,
  /sha256:[0-9a-f]{8}/,
  /\b(pruning|pruned|reclaimed|packages|signed|cosign|published|booting|test vm)\b/i,
  /would remove tag/,
]

function classify (text) {
  if (/^##\[error\]/.test(text) || /(^|\s)✗/.test(text) || /^auros: FAILED/.test(text) || /^Error:/.test(text)) return 'bad'
  if (/^##\[warning\]/.test(text) || /^auros\[policy\]\s+!/.test(text)) return 'warn'
  if (/(^|\s)✓/.test(text) || /\bPASS\b/.test(text)) return 'good'
  if (/──/.test(text) || /^auros: running /.test(text)) return 'section'
  if (/^##\[notice\]/.test(text)) return 'note'
  return 'info'
}

/** One job's raw log → the lines worth showing, in order, with the time each was printed. */
function reduceJobLog (raw, jobName, extraKeep = [], extraDrop = []) {
  const keep = extraKeep.length ? [...KEEP, ...extraKeep] : KEEP
  const drop = extraDrop.length ? [...DROP, ...extraDrop] : DROP
  const out = []
  let inGroup = false
  let last = null
  for (const rawLine of raw.split('\n')) {
    const m = STAMP.exec(rawLine)
    const at = m ? m[1] : null
    let text = rawLine.replace(STAMP, '').replace(ANSI, '').replace(/\r$/, '').trimEnd()
    // `##[group]Run …` echoes the whole shell script back, including its comments. That is source
    // code, not output; the reader can read the workflow file if they want it. Every OTHER group is
    // a section the pipeline opened on purpose (`::group::build a — derive`) and its title is one of
    // the most useful lines in the log — so it is kept, and so are its contents. Getting this
    // backwards silently emptied the console once: the step that fails never reaches its
    // `endgroup`, so treating all groups as noise threw away the entire failure.
    if (text.startsWith('##[group]')) {
      const title = text.slice('##[group]'.length).trim()
      if (/^Run\b/.test(title) || PLUMBING_GROUP.test(title)) { inGroup = true; continue }
      inGroup = false
      out.push({ text: title, level: 'section', job: jobName, at })
      last = title
      continue
    }
    if (text.startsWith('##[endgroup]')) { inGroup = false; continue }
    if (inGroup) continue
    if (!text.trim()) continue
    if (drop.some(re => re.test(text))) continue
    if (!keep.some(re => re.test(text))) continue
    // Classify BEFORE deriving the readable form of the runner's `##[error]` prefix — the prefix
    // is the only thing marking a workflow-level failure, and stripping it first silently turned
    // every one of them into an ordinary grey line.
    const level = classify(text)
    // `text` IS THE RUNNER'S LINE, byte for byte after the reductions above (timestamp, ANSI,
    // trailing space). It used to be rewritten here: `##[error]X` was published as `error: X`, and
    // the component's claim is that a reader "can open the run and find the same line" — but
    // GitHub's UI renders the annotation rather than showing that string, so for those lines the
    // string on our page was ours, not the runner's. Nine of them shipped.
    //
    // Everything else this reducer does is purely reductive: it drops lines and strips prefixes the
    // runner added, never invents one. `display` keeps the readable form for the page WITHOUT
    // making the published `text` something a reader cannot search for in the log.
    const display = text.replace(/^##\[(error|warning|notice)\]/, (_, k) => `${k}: `)
    if (text === last) continue // "Login Succeeded!" three times is one fact
    last = text
    const line = { text, level, job: jobName, at }
    if (display !== text) line.display = display
    out.push(line)
  }
  return out
}

// ── the pinned set ──────────────────────────────────────────────────────────────────────────────
// The latest run is one run, and on any given day it is whatever it is. Today every completed
// `build.yml` run on main had failed, so a console showing only the latest one had only ever been
// red — which is exactly as unrepresentative as a console that has only ever been green, and a
// reader has no way to tell either apart from a staged one.
//
// So a small set of runs is PINNED, in `tools/notable-runs.manifest.json`, by run id. The manifest
// carries a human sentence about why each run is worth reading and, where the run is not a
// `build.yml` run, extra `keep` patterns — because the reducer's default KEEP list is tuned to our
// own `auros[…]` build lines and would silently drop `aurora login:` and `4.4G disk.qcow2`, which
// are the most interesting true lines we have.
//
// Three properties make this safe to widen:
//   · `keep` can only SELECT from lines a runner printed. There is no path here that writes text.
//   · Every entry declares the workflow and outcome it expects, and a run that does not match makes
//     the tool exit 1 PRINTING WHAT THE API ACTUALLY SAYS. A mistyped id cannot become a silent gap.
//   · The set must contain at least one success AND at least one failure, or the tool refuses. An
//     all-green console is not a thing this file can be edited into without the tool objecting.
async function buildNotable () {
  const manifestPath = resolve(process.cwd(), OPT.manifest)
  if (!existsSync(manifestPath)) {
    console.error(`snapshot-build-log: manifest ${manifestPath} is missing.`)
    process.exit(2)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const entries = Array.isArray(manifest.runs) ? manifest.runs : []
  if (entries.length === 0) {
    console.error('snapshot-build-log: the manifest names no runs. Refusing to write an empty set.')
    process.exit(2)
  }
  const perRun = Number(manifest.maxLinesPerRun ?? 14)

  const out = []
  for (const entry of entries) {
    const repo = entry.repo ?? OPT.repo
    // A pinned id that does not resolve is the single most likely way this file goes wrong — a
    // typo, a run deleted, the wrong repository. The stack trace `fetch` would otherwise print
    // names the URL and not the entry, so it is caught here and the refusal names both.
    let run
    try { run = await api(`/repos/${repo}/actions/runs/${entry.runId}`) }
    catch (e) {
      console.error(`snapshot-build-log: cannot read run ${entry.runId} in ${repo}: ${e.message}`)
      console.error(`  the manifest pins it as ${entry.expect?.workflow ?? 'an unnamed workflow'} (${entry.expect?.conclusion ?? 'unknown outcome'})`)
      console.error('Refusing to write a record with a run nobody can open.')
      process.exit(1)
    }

    // Assert against the API, and when it disagrees say what the API said. Four build cycles were
    // lost today to remembered layouts; the rule that came out of it is that a failed assertion
    // must print what IS there, not only what was expected.
    const want = entry.expect ?? {}
    const gotWorkflow = run.name ?? ''
    const gotConclusion = run.conclusion ?? run.status ?? ''
    if (want.workflow && gotWorkflow !== want.workflow) {
      console.error(`snapshot-build-log: run ${entry.runId} is workflow "${gotWorkflow}", manifest expects "${want.workflow}".`)
      console.error(`  ${run.html_url}`)
      process.exit(1)
    }
    if (want.conclusion && gotConclusion !== want.conclusion) {
      console.error(`snapshot-build-log: run ${entry.runId} concluded "${gotConclusion}", manifest expects "${want.conclusion}".`)
      console.error(`  ${run.html_url}`)
      process.exit(1)
    }

    const extraKeep = (entry.keep ?? []).map(src => new RegExp(src))
    // `drop` is strictly reductive: it can only remove lines the runner printed, never add one.
    // It exists because a pinned probe run carries its own furniture — osbuild's per-stage
    // durations, a directory listing — that is real and says nothing.
    const extraDrop = (entry.drop ?? []).map(src => new RegExp(src))
    const { jobs = [] } = await api(`/repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`)
    let lines = []
    let inLog = 0
    for (const job of jobs) {
      if (job.conclusion === 'skipped') continue
      if (!(job.steps ?? []).some(st => !PLUMBING_STEP.test(st.name))) continue
      let raw
      try { raw = await api(`/repos/${repo}/actions/jobs/${job.id}/logs`, { raw: true }) }
      catch (e) { console.error(`  ! log for "${job.name}" unavailable: ${e.message}`); continue }
      if (raw == null) { console.error(`  ! log for "${job.name}" has expired`); continue }
      inLog += raw.split('\n').length
      lines.push(...reduceJobLog(raw, job.name, extraKeep, extraDrop))
    }
    lines = lines
      .map((l, i) => ({ l, i, t: l.at ? Date.parse(l.at) : Number.NaN }))
      .sort((a, b) => (Number.isNaN(a.t) || Number.isNaN(b.t) ? a.i - b.i : a.t - b.t || a.i - b.i))
      .map(x => x.l)

    if (lines.length === 0) {
      // A run whose log has expired reduces to nothing. Dropping it quietly would leave a `why`
      // sentence on the page with no output under it, which is the shape of a claim with no
      // evidence — the one thing this component exists not to be.
      console.error(`snapshot-build-log: run ${entry.runId} reduced to 0 lines. Its log may have expired.`)
      console.error(`  ${run.html_url}`)
      console.error('Refusing to publish a pinned run with nothing under it.')
      process.exit(1)
    }

    const shown = lines.length
    let omitted = 0
    if (shown > perRun) {
      const head = Math.floor(perRun * 0.5)
      const tail = perRun - head - 1
      omitted = shown - head - tail
      lines = [
        ...lines.slice(0, head),
        { text: `… ${omitted} more lines in this run`, level: 'meta', job: null, at: null },
        ...lines.slice(shown - tail),
      ]
    }

    const started = run.run_started_at ?? run.created_at
    out.push({
      why: entry.why,
      run: {
        repo,
        workflow: gotWorkflow,
        runId: run.id,
        runNumber: run.run_number,
        attempt: run.run_attempt ?? 1,
        url: run.html_url,
        conclusion: run.conclusion,
        title: run.head_commit?.message?.split('\n')[0] ?? run.display_title ?? null,
        headSha: run.head_sha,
        startedAt: started,
        endedAt: run.updated_at ?? started,
        durationSeconds: Math.max(0, Math.round((Date.parse(run.updated_at ?? started) - Date.parse(started)) / 1000)),
      },
      linesShown: lines.length,
      linesOmitted: omitted,
      linesInLog: inLog,
      lines,
    })
    console.error(`  ${gotWorkflow} #${run.run_number} (${run.conclusion}): ${lines.length} lines kept`)
  }

  const outcomes = new Set(out.map(r => r.run.conclusion))
  if (!outcomes.has('success') || !outcomes.has('failure')) {
    console.error(`snapshot-build-log: the pinned set is all ${[...outcomes].join('/')}.`)
    console.error('It must contain at least one success AND at least one failure. A console that has')
    console.error('only ever been green — or only ever been red — reads as staged, and would be.')
    process.exit(1)
  }

  // Newest first: a reader arriving from the latest run above reads backwards in time, which is the
  // order these actually happened in and the order the story makes sense in.
  out.sort((a, b) => Date.parse(b.run.startedAt) - Date.parse(a.run.startedAt))

  const payload = {
    $comment: 'Generated by auros-web/tools/snapshot-build-log.mjs --notable from the real runs pinned in tools/notable-runs.manifest.json. Do not hand-edit: every line here was printed by a GitHub Actions runner and can be read in context at run.url.',
    schema: 1,
    generatedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    runs: out,
  }
  const text = JSON.stringify(payload, null, 2) + '\n'
  const dest = resolve(process.cwd(), OPT.notableOut)

  if (OPT.check) {
    if (!existsSync(dest)) { console.error(`snapshot-build-log: ${dest} is missing`); process.exit(1) }
    const onDisk = JSON.parse(readFileSync(dest, 'utf8'))
    // `generatedAt` moves on every run and says nothing about what the page shows. Everything else
    // is compared in full, so a reducer change that silently altered a published line is a red CI.
    const diff = firstDifference(onDisk, payload)
    if (!diff) {
      console.log(`snapshot-build-log: pinned set up to date (${out.length} runs).`)
      process.exit(0)
    }
    console.error('snapshot-build-log: the committed pinned set is not what this tool would write.')
    // NOT two lists of run ids. The first version printed exactly that, and when a fabricated LINE
    // was injected it printed the same list twice — a refusal that names a dimension which has not
    // changed reads as a spurious failure, and the one check that worked was the one nobody would
    // have believed. Name the run and the line, and print both texts.
    for (const l of explainDifference(diff, { onDisk, wouldWrite: payload })) console.error(l)
    const sets = runIdSets(onDisk, payload)
    if (sets) {
      console.error(`  the pinned SET also differs — on disk: ${sets.onDisk.join(', ')}`)
      console.error(`                              would write: ${sets.wouldWrite.join(', ')}`)
    }
    console.error('  run `pnpm snapshot:notable` if the reducer or the manifest changed; if it did not,')
    console.error('  the committed file has been edited by hand and the line above is the edit.')
    process.exit(1)
  }

  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, text)
  console.log(`snapshot-build-log: ${out.length} pinned runs → ${dest}`)
  for (const r of out) console.log(`  ${r.run.conclusion === 'success' ? '✓' : '✗'} ${r.run.workflow} #${r.run.runNumber}  ${r.run.url}`)
  process.exit(0)
}

if (OPT.notable) await buildNotable()

// ── build the snapshot ──────────────────────────────────────────────────────────────────────────
//
// `--check` re-derives THE RUN THE COMMITTED FILE NAMES, not the latest one. Two reasons, and the
// first is the whole point of the check:
//
//   · The question `--check` has to answer is "is every line in this file a line that runner
//     printed?" That is a question about run N, so it has to be asked of run N. Asked of whatever
//     ran most recently, the answer is always "different run" and the content is never looked at —
//     which is how two fabricated lines sat in this file while the check exited 0.
//   · Staleness is a different question with a different answer ("run `pnpm snapshot`"), and it is
//     not a dishonesty. Conflating them made the check red on every pull request that followed a new
//     run, for a reason unrelated to the file, and a gate that is red for an unrelated reason is one
//     people learn to skip (D40).
//
// Staleness is still reported, below, as a note that does not fail.
let onDiskSnapshot = null
if (OPT.check) {
  if (!existsSync(OPT.out)) {
    console.error(`snapshot-build-log: ${OPT.out} is missing`)
    process.exit(1)
  }
  try { onDiskSnapshot = JSON.parse(readFileSync(OPT.out, 'utf8')) }
  catch (e) { console.error(`snapshot-build-log: ${OPT.out} is not JSON: ${e.message}`); process.exit(1) }
  const named = onDiskSnapshot?.run?.runId
  if (named == null) {
    console.error(`snapshot-build-log: ${OPT.out} names no run (run.runId is absent).`)
    console.error('  A snapshot that does not say which run it came from cannot be checked against one.')
    process.exit(1)
  }
  if (!OPT.run) OPT.run = String(named)
  else if (String(OPT.run) !== String(named)) {
    console.error(`snapshot-build-log: --run ${OPT.run} --check, but ${OPT.out} names run ${named}.`)
    console.error('  Checking one run against a file written from another would compare two different builds.')
    process.exit(1)
  }
}

const run = await latestCompletedRun()
const { jobs = [] } = await api(`/repos/${OPT.repo}/actions/runs/${run.id}/jobs?per_page=100`)

/** @type {{text:string,level:string,job:string|null,at:string|null}[]} */
let lines = []
const jobSummary = []
/** Every line the runner printed, before this reducer chose any of them. Reported on the page. */
let linesInLog = 0
for (const job of jobs) {
  jobSummary.push({
    name: job.name,
    conclusion: job.conclusion,
    startedAt: job.started_at,
    completedAt: job.completed_at,
  })
  if (job.conclusion === 'skipped') continue
  // A step list is cheap to filter on and saves pulling logs for jobs that are pure plumbing.
  const hasRealStep = (job.steps ?? []).some(s => !PLUMBING_STEP.test(s.name))
  if (!hasRealStep) continue
  let raw
  try { raw = await api(`/repos/${OPT.repo}/actions/jobs/${job.id}/logs`, { raw: true }) }
  catch (e) { console.error(`  ! log for "${job.name}" unavailable: ${e.message}`); continue }
  if (raw == null) { console.error(`  ! log for "${job.name}" has expired`); continue }
  linesInLog += raw.split('\n').length
  const kept = reduceJobLog(raw, job.name)
  console.error(`  ${job.name}: ${kept.length} lines kept`)
  lines.push(...kept)
}

// Jobs run in parallel, so API order is not the order a person watching the build would have seen
// things. The runner stamps every line, so sort by that: the result is the log as it actually
// happened, which is the only ordering a console is allowed to claim.
lines = lines
  .map((l, i) => ({ l, i, t: l.at ? Date.parse(l.at) : Number.NaN }))
  .sort((a, b) => (Number.isNaN(a.t) || Number.isNaN(b.t) ? a.i - b.i : a.t - b.t || a.i - b.i))
  .map(x => x.l)

if (lines.length === 0) {
  console.error('snapshot-build-log: the run produced no lines this reducer recognises.')
  console.error('Refusing to write an empty or invented snapshot. Check the run:', run.html_url)
  process.exit(2)
}

const total = lines.length
let omitted = 0
if (total > OPT.maxLines) {
  // Elide from the MIDDLE. The head is how the build starts (what it resolved, what it mirrored)
  // and the tail is how it ended (what passed, what broke). Both are the parts that mean something.
  // The elision is a visible line, never a silent cut.
  const head = Math.floor(OPT.maxLines * 0.45)
  const tail = OPT.maxLines - head - 1
  omitted = total - head - tail
  lines = [
    ...lines.slice(0, head),
    { text: `… ${omitted} lines from this run are not shown here · the full log is at the run URL`, level: 'meta', job: null, at: null },
    ...lines.slice(total - tail),
  ]
}

const started = run.run_started_at ?? run.created_at
const ended = jobSummary.reduce((acc, j) => (j.completedAt && j.completedAt > acc ? j.completedAt : acc), started)

const snapshot = {
  $comment: 'Generated by auros-web/tools/snapshot-build-log.mjs from a real GitHub Actions run. Do not hand-edit: every line here was printed by a runner and can be read in context at run.url.',
  schema: 1,
  generatedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  run: {
    repo: OPT.repo,
    workflow: run.name ?? OPT.workflow,
    runId: run.id,
    runNumber: run.run_number,
    attempt: run.run_attempt ?? 1,
    url: run.html_url,
    conclusion: run.conclusion,
    // The commit subject, not `display_title`: GitHub truncates the latter for its own UI, and a
    // sentence a person wrote is worth more unabridged than abridged.
    title: run.head_commit?.message?.split('\n')[0] ?? run.display_title ?? null,
    headSha: run.head_sha,
    startedAt: started,
    endedAt: ended,
    durationSeconds: Math.max(0, Math.round((Date.parse(ended) - Date.parse(started)) / 1000)),
  },
  jobs: jobSummary,
  linesShown: lines.length,
  linesOmitted: omitted,
  linesInLog,
  lines,
}

const text = JSON.stringify(snapshot, null, 2) + '\n'

if (OPT.check) {
  // The whole payload, not the run id. `generatedAt` and `$comment` are stripped by
  // firstDifference; everything a reader can see is compared, so a line that no runner printed is a
  // red build. This is what `--notable --check` already did, and the honesty-critical file — the one
  // the landing page renders — was the one left comparing a single integer.
  const diff = firstDifference(onDiskSnapshot, snapshot)
  if (diff) {
    console.error(`snapshot-build-log: ${OPT.out} is not what this tool derives from run ${snapshot.run.runId}.`)
    for (const l of explainDifference(diff, { onDisk: onDiskSnapshot, wouldWrite: snapshot })) console.error(l)
    console.error(`  the run: ${snapshot.run.url}`)
    console.error('  run `pnpm snapshot` if the reducer changed; if it did not, the committed file has been')
    console.error('  edited by hand and the line above is the edit.')
    process.exit(1)
  }
  console.log(`snapshot-build-log: up to date — every line matches run ${snapshot.run.runId} (${snapshot.lines.length} lines).`)
  // Freshness is a NOTE. It says to run the tool; it does not claim the file is dishonest, because
  // it is not. Wrapped because a failure to look up the latest run must not turn a passing content
  // check into a red one — that would put us back where we started.
  try {
    const q = new URLSearchParams({ branch: OPT.branch, status: 'completed', per_page: '10' })
    const { workflow_runs: runs = [] } = await api(
      `/repos/${OPT.repo}/actions/workflows/${OPT.workflow}/runs?${q}`)
    const newest = runs.find(r => r.conclusion === 'success' || r.conclusion === 'failure')
    if (newest && newest.id !== snapshot.run.runId) {
      console.log(`  note: a newer completed run exists (${newest.id}, ${newest.conclusion}). ` +
        'The committed file is honest about the run it names; `pnpm snapshot` moves it forward.')
    }
  } catch (e) {
    console.log(`  note: could not check whether a newer run exists (${e.message}). The content check above stands.`)
  }
  process.exit(0)
}

mkdirSync(dirname(OPT.out), { recursive: true })
writeFileSync(OPT.out, text)
console.error('')
console.log(`snapshot-build-log: ${lines.length} lines from ${snapshot.run.conclusion} run #${snapshot.run.runNumber}`)
console.log(`  ${snapshot.run.url}`)
console.log(`  → ${OPT.out}`)
