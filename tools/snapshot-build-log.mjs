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
//   --run    snapshot one specific run instead of the latest completed one.
//   --check  exit 1 if the committed snapshot is not what this tool would write (for CI).
//
// Auth: GITHUB_TOKEN or GH_TOKEN with `actions: read`. Job logs are not public even for a public
// repository, so without a token this exits 2 — and exiting 2 is the point. There is no code path
// here that writes a snapshot from anything other than a log fetched from the API.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

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
function reduceJobLog (raw, jobName) {
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
    if (DROP.some(re => re.test(text))) continue
    if (!KEEP.some(re => re.test(text))) continue
    // Classify BEFORE rewriting the runner's `##[error]` prefix into something readable — the
    // prefix is the only thing marking a workflow-level failure, and stripping it first silently
    // turned every one of them into an ordinary grey line.
    const level = classify(text)
    text = text.replace(/^##\[(error|warning|notice)\]/, (_, k) => `${k}: `)
    if (text === last) continue // "Login Succeeded!" three times is one fact
    last = text
    out.push({ text, level, job: jobName, at })
  }
  return out
}

// ── build the snapshot ──────────────────────────────────────────────────────────────────────────
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
  if (!existsSync(OPT.out)) { console.error(`snapshot-build-log: ${OPT.out} is missing`); process.exit(1) }
  const onDisk = JSON.parse(readFileSync(OPT.out, 'utf8'))
  if (onDisk.run?.runId === snapshot.run.runId) {
    console.log(`snapshot-build-log: up to date (run ${snapshot.run.runId}).`)
    process.exit(0)
  }
  console.error(`snapshot-build-log: stale. On disk: run ${onDisk.run?.runId}. Latest: ${snapshot.run.runId}.`)
  process.exit(1)
}

mkdirSync(dirname(OPT.out), { recursive: true })
writeFileSync(OPT.out, text)
console.error('')
console.log(`snapshot-build-log: ${lines.length} lines from ${snapshot.run.conclusion} run #${snapshot.run.runNumber}`)
console.log(`  ${snapshot.run.url}`)
console.log(`  → ${OPT.out}`)
