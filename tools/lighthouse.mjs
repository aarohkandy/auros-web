#!/usr/bin/env node
/**
 * AUROS — measure Lighthouse (mobile) on every built page, and fail below the §6D floor.
 *
 * Spec §6D: "Lighthouse ≥ 95 on mobile." That line had never been executed. It is executed here,
 * against `dist/` served by `tools/serve-dist.mjs`, with the pinned `lighthouse` in devDependencies
 * (pinned exactly: a floating Lighthouse changes the scoring curve and turns "we regressed" and
 * "they reweighted" into the same red, which is the one thing a gate must never do).
 *
 * Mobile is Lighthouse's DEFAULT form factor — moto-g-power emulation, 1.6 Mbps / 150 ms simulated
 * throttling, 4x CPU slowdown. This script passes NO desktop preset and no throttling override, so
 * what it reports is the mobile number the spec asks for. `--form-factor=mobile` is passed anyway,
 * explicitly, so that a future Lighthouse changing its default cannot silently change what we claim.
 *
 * D19/D37: every child process's exit status is read directly. Nothing is piped through anything.
 *
 * Usage:
 *   node tools/lighthouse.mjs                      # build must already exist in dist/
 *   node tools/lighthouse.mjs --root dist --out .lighthouse
 *   node tools/lighthouse.mjs --threshold 95 --runs 1
 *   node tools/lighthouse.mjs --pages /,/pricing   # subset, for iterating
 */

import { spawn } from 'node:child_process'
import { readdir, mkdir, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO = resolve(HERE, '..')

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}

const root = resolve(REPO, arg('root', 'dist'))
const outDir = resolve(REPO, arg('out', '.lighthouse'))
const threshold = Number(arg('threshold', '95'))
const runs = Number(arg('runs', '1'))
const quiet = args.includes('--quiet')

/**
 * The categories §6D's "≥ 95" is enforced on, and why these two and not four.
 *
 * `performance` and `accessibility` are the promise: a 2012 laptop's owner is on a slow connection
 * and a school has readers who use a keyboard and a screen reader. `best-practices` and `seo` are
 * measured and REPORTED — a regression in either should be visible — but they are not gates,
 * because both contain audits that move with the browser's deprecation list rather than with
 * anything we changed, and a gate that goes red because Chrome deprecated an API is a gate people
 * learn to ignore.
 */
const GATED = ['performance', 'accessibility']
const REPORTED = ['best-practices', 'seo']
const ALL = [...GATED, ...REPORTED]

function run(cmd, argv, opts = {}) {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, argv, { stdio: opts.stdio ?? 'inherit', ...opts })
    child.on('error', fail)
    child.on('exit', (code, signal) => {
      if (code === 0) ok()
      else fail(new Error(`${cmd} exited ${code ?? `on ${signal}`}`))
    })
  })
}

/** Start the static server and wait for it to say which port it got. */
function startServer() {
  return new Promise((ok, fail) => {
    const child = spawn(process.execPath, [join(HERE, 'serve-dist.mjs'), '--root', root, '--port', '0'], {
      stdio: ['ignore', 'pipe', 'inherit'],
      cwd: REPO,
    })
    let buf = ''
    const timer = setTimeout(() => fail(new Error('serve-dist.mjs never printed a listening line')), 15_000)
    child.stdout.on('data', (d) => {
      buf += d.toString()
      const m = buf.match(/listening (\S+)/)
      if (m) {
        clearTimeout(timer)
        ok({ origin: m[1], child })
      }
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      fail(new Error(`serve-dist.mjs exited ${code} before listening`))
    })
  })
}

/** The routes a visitor can reach, derived from dist/ rather than from a list somebody maintains. */
async function routes() {
  const explicit = arg('pages', null)
  if (explicit) return explicit.split(',').map((s) => s.trim()).filter(Boolean)
  const files = (await readdir(root)).filter((f) => f.endsWith('.html')).sort()
  if (files.length === 0) throw new Error(`no .html files in ${root} — run \`pnpm build\` first`)
  return files.map((f) => (f === 'index.html' ? '/' : `/${f.replace(/\.html$/, '')}`))
}

function slug(route) {
  return route === '/' ? 'index' : route.replace(/^\//, '').replace(/\//g, '_')
}

async function measure(origin, route) {
  const base = join(outDir, slug(route))
  const lhBin = join(REPO, 'node_modules', 'lighthouse', 'cli', 'index.js')
  if (!existsSync(lhBin)) throw new Error(`lighthouse not installed at ${lhBin} — run \`pnpm install\``)

  const scores = []
  let last = null
  for (let i = 0; i < runs; i++) {
    // Lighthouse appends `.report.<ext>` to `--output-path` when more than one format is asked
    // for, so the path we pass must NOT already carry it. Probed, not remembered: passing
    // `x.report` produced `x.report.report.json`.
    const stem = `${base}${runs > 1 ? `.${i}` : ''}`
    const jsonPath = `${stem}.report.json`
    await run(
      process.execPath,
      [
        lhBin,
        `${origin}${route}`,
        '--form-factor=mobile',
        `--only-categories=${ALL.join(',')}`,
        '--output=json',
        '--output=html',
        `--output-path=${stem}`,
        '--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage --disable-gpu',
        '--max-wait-for-load=45000',
        '--quiet',
      ],
      { stdio: quiet ? 'ignore' : 'inherit', cwd: REPO },
    )
    last = JSON.parse(await readFile(jsonPath, 'utf8'))
    scores.push(Object.fromEntries(ALL.map((c) => [c, Math.round((last.categories[c]?.score ?? 0) * 100)])))
  }
  // Several runs: report the MEDIAN, not the best. Reporting the best of n is how a flaky 94
  // becomes a 96 in a report and a 94 for the visitor.
  const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  const final = Object.fromEntries(ALL.map((c) => [c, median(scores.map((s) => s[c]))]))
  return { route, scores: final, report: last }
}

function failingAudits(report, categoryId) {
  const cat = report.categories[categoryId]
  if (!cat) return []
  return cat.auditRefs
    .map((ref) => ({ ref, audit: report.audits[ref.id] }))
    .filter(({ audit }) => audit && audit.score !== null && audit.score < 0.9)
    .filter(({ ref }) => ref.weight > 0 || categoryId === 'accessibility')
    .sort((a, b) => b.ref.weight - a.ref.weight)
    .slice(0, 8)
    .map(({ ref, audit }) => `      ${audit.id} (weight ${ref.weight}, score ${audit.score}) ${audit.displayValue ?? ''}`)
}

async function main() {
  // `rm -rf` on a path the caller supplied. Refuse the two that would delete real work: the repo
  // itself and the directory being measured. Cheap, and the alternative is a --out typo removing
  // dist/ or src/ with no confirmation.
  if (outDir === REPO || outDir === root || REPO.startsWith(`${outDir}/`) || root.startsWith(`${outDir}/`)) {
    throw new Error(`--out ${outDir} would delete the repository or the directory being measured`)
  }
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  const paths = await routes()
  const { origin, child } = await startServer()
  const results = []
  try {
    for (const route of paths) {
      process.stderr.write(`lighthouse: ${route}\n`)
      results.push(await measure(origin, route))
    }
  } finally {
    child.kill('SIGTERM')
  }

  const pad = Math.max(...results.map((r) => r.route.length), 6)
  console.log('')
  console.log(`Lighthouse ${JSON.parse(await readFile(join(REPO, 'node_modules/lighthouse/package.json'), 'utf8')).version} · mobile · median of ${runs} run(s) · gate ≥ ${threshold}`)
  console.log('')
  console.log(`  ${'page'.padEnd(pad)}  ${ALL.map((c) => c.slice(0, 5).padStart(6)).join('')}`)
  console.log(`  ${'-'.repeat(pad)}  ${ALL.map(() => '------').join('')}`)
  for (const r of results) {
    console.log(`  ${r.route.padEnd(pad)}  ${ALL.map((c) => String(r.scores[c]).padStart(6)).join('')}`)
  }
  console.log('')

  const failures = []
  for (const r of results) {
    for (const c of GATED) {
      if (r.scores[c] < threshold) failures.push({ route: r.route, category: c, score: r.scores[c], report: r.report })
    }
  }

  if (failures.length === 0) {
    console.log(`PASS — ${results.length} page(s), ${GATED.join(' and ')} ≥ ${threshold} on every one.`)
    console.log(`Reports: ${outDir}`)
    return 0
  }

  console.log(`FAIL — ${failures.length} page/category pair(s) below ${threshold}:`)
  for (const f of failures) {
    console.log(`  ${f.route}  ${f.category} = ${f.score}`)
    // "Print what IS there, not only what was missing." The audits that cost the points are named
    // here so the run output is the diagnosis, not a prompt to go and open an HTML report.
    const lines = failingAudits(f.report, f.category)
    if (lines.length) console.log(lines.join('\n'))
  }
  console.log(`\nReports: ${outDir}`)
  return 1
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`lighthouse.mjs: ${err.message}`)
    process.exit(2)
  },
)
