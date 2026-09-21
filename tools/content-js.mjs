#!/usr/bin/env node
/**
 * AUROS — §6D's "no client-side framework for content pages", asserted rather than intended.
 *
 * The sentence has been true since the first commit because nobody added React. That is not the
 * same as it being enforced: the day somebody reaches for a component library to build one panel,
 * nothing in this repository notices, and the thing §6D is protecting — a 2012 laptop on a school
 * uplink parsing 200 KB of runtime to read a price list — is gone before anyone re-reads the spec.
 *
 * It also measures the JavaScript each page actually ships, against a committed budget, because
 * "unused JS on content pages" is invisible until somebody prints the number.
 *
 *   J1  No framework runtime anywhere in the shipped JavaScript. Signature-matched against the
 *       built bundles AND the inline scripts, so an inlined 3 KB Preact is caught too.
 *   J2  No render-blocking external script on any page. Every `<script src>` must be `type=module`
 *       (deferred by definition) or carry `defer`/`async`. This is what keeps the terrain canvas
 *       off the first-paint path.
 *   J3  No `<canvas>` in the served HTML. §7's terrain is generated after parse by
 *       `src/terrain/parallax.ts`; a canvas present in the document would mean it is being laid
 *       out before first paint, which is the exact LCP regression §7's "render once offscreen"
 *       exists to avoid. Checked against the bytes, so the claim cannot drift from the markup.
 *   J4  Per-page JavaScript transfer budget, committed. Inline bytes count: they are bytes the
 *       visitor downloads and the parser runs, and excluding them is how a budget quietly stops
 *       meaning anything.
 *
 * Usage:  node tools/content-js.mjs [--write]
 */

import { readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO = resolve(HERE, '..')
const args = process.argv.slice(2)
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1] }
const root = resolve(REPO, arg('root', 'dist'))
const write = args.includes('--write')
const BUDGETS = join(HERE, 'content-js-budgets.json')

/**
 * Framework signatures. Chosen to be strings a framework's RUNTIME contains after minification,
 * not strings a human might write in a comment — `__reactFiber$` survives every React build and
 * appears in nothing else.
 */
const FRAMEWORKS = [
  ['React', /__reactFiber\$|react-dom|createElement\("|ReactDOM|__reactProps\$/],
  ['Preact', /preact|__preactattr_|_preactOptions/],
  ['Vue', /__vue__|createElementVNode|Vue\.createApp|__VUE_/],
  ['Svelte', /svelte\/internal|\$\$invalidate|__svelte_meta/],
  ['Solid', /solid-js|createSignal\(|_\$insert\(/],
  ['Angular', /@angular\/|ɵɵdefineComponent|ng-version/],
  ['Lit', /lit-html|LitElement|_\$litType\$/],
  ['Alpine', /Alpine\.start|x-data=|__x_alpine/],
  ['htmx', /htmx\.(process|ajax)|hx-swap|hx-trigger/],
  ['jQuery', /jQuery|\$\.fn\.jquery/],
]

const stripComments = (h) => h.replace(/<!--[\s\S]*?-->/g, ' ')

const files = (await readdir(root)).filter((f) => f.endsWith('.html')).sort()
if (files.length === 0) { console.error(`content-js: no .html in ${root} — run \`pnpm build\` first`); process.exit(2) }

const budgets = existsSync(BUDGETS) ? JSON.parse(await readFile(BUDGETS, 'utf8')) : { pages: {} }
const failures = []
const rows = []

// J1, over the built bundles, once.
const assetDir = join(root, '_astro')
const bundles = existsSync(assetDir) ? (await readdir(assetDir)).filter((f) => f.endsWith('.js')) : []
if (bundles.length === 0) {
  // Not "nothing to check": a run that found no bundles has almost certainly been pointed at the
  // wrong directory, and would then pass forever. Fail loudly instead.
  failures.push(`J1  no JavaScript bundles found under ${assetDir}. This check cannot pass on a directory it cannot read.`)
}
for (const b of bundles) {
  const src = await readFile(join(assetDir, b), 'utf8')
  for (const [name, re] of FRAMEWORKS) {
    if (re.test(src)) failures.push(`J1  ${name} runtime signature found in dist/_astro/${b} — §6D forbids a client-side framework on content pages.`)
  }
}

for (const f of files) {
  const route = f === 'index.html' ? '/' : `/${f.replace(/\.html$/, '')}`
  const html = await readFile(join(root, f), 'utf8')
  const clean = stripComments(html)

  // J2 — every external script must be deferred.
  for (const m of clean.matchAll(/<script\b([^>]*\bsrc\s*=\s*"([^"]*)"[^>]*)>/gi)) {
    const [, attrs, src] = m
    const deferred = /\btype\s*=\s*"module"/i.test(attrs) || /\bdefer\b/i.test(attrs) || /\basync\b/i.test(attrs)
    if (!deferred) failures.push(`${route}  J2  render-blocking <script src="${src}"> — needs type="module", defer, or async.`)
  }

  // J1 again, for anything inlined.
  let inlineSrc = ''
  for (const m of clean.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    inlineSrc += `${m[1]}\n`
    for (const [name, re] of FRAMEWORKS) {
      if (re.test(m[1])) failures.push(`${route}  J1  ${name} runtime signature found in an INLINE script.`)
    }
  }

  // J3 — the terrain canvas must not be in the document.
  if (/<canvas\b/i.test(clean)) {
    failures.push(`${route}  J3  a <canvas> is present in the served HTML. §7's terrain is generated after parse precisely so it cannot be laid out before first paint.`)
  }

  // J4 — bytes over the wire, gzipped, which is what the visitor actually pays.
  let externalBytes = 0
  const srcs = [...clean.matchAll(/<script\b[^>]*\bsrc\s*=\s*"([^"]*)"/gi)].map((m) => m[1])
  const local = []
  for (const s of srcs) {
    if (/^https?:|^\/\//i.test(s)) continue // D33's one remote endpoint; not ours to budget
    const p = join(root, s.replace(/^\//, ''))
    try {
      await stat(p)
      externalBytes += gzipSync(await readFile(p)).length
      local.push(basename(s))
    } catch {
      failures.push(`${route}  J4  <script src="${s}"> does not resolve to a file in ${root}.`)
    }
  }
  // Inline script bodies are gzipped together, not individually: they arrive inside one gzipped
  // HTML response, so compressing them separately would overstate what the visitor pays.
  const total = externalBytes + (inlineSrc ? gzipSync(Buffer.from(inlineSrc, 'utf8')).length : 0)
  const budget = budgets.pages?.[route]
  if (!write) {
    if (budget === undefined) failures.push(`${route}  J4  no committed JavaScript budget. Run \`node tools/content-js.mjs --write\` and commit tools/content-js-budgets.json.`)
    else if (total > budget) failures.push(`${route}  J4  ships ${total} B of gzipped JavaScript; the committed budget is ${budget} B. Scripts on this page: ${local.join(', ') || '(inline only)'}`)
  }
  rows.push({ route, total, budget: budget ?? '-', scripts: local })
}

if (write) {
  const next = {
    note: 'Gzipped JavaScript bytes per page, as measured when written, plus 15% headroom. Regenerate with `node tools/content-js.mjs --write`. A number going UP here is the reviewable event — §6D keeps content pages framework-free, and this is where that stops being a promise.',
    pages: {},
  }
  for (const r of rows) next.pages[r.route] = Math.ceil(r.total * 1.15)
  await writeFile(BUDGETS, `${JSON.stringify(next, null, 2)}\n`)
  console.log(`content-js: wrote ${BUDGETS}`)
}

const pad = Math.max(...rows.map((r) => r.route.length), 6)
console.log('')
console.log(`content pages · ${rows.length} page(s) · JavaScript, gzipped, as the visitor receives it`)
console.log('')
console.log(`  ${'page'.padEnd(pad)}  ${'js (gz)'.padStart(9)}  ${'budget'.padStart(8)}  scripts`)
for (const r of rows) {
  console.log(`  ${r.route.padEnd(pad)}  ${String(r.total).padStart(9)}  ${String(r.budget).padStart(8)}  ${r.scripts.join(' ') || '(inline only)'}`)
}
console.log('')
if (failures.length) {
  console.log(`FAIL — ${failures.length} problem(s):`)
  for (const f of failures) console.log(`  ${f}`)
  process.exit(1)
}
console.log(`PASS — no framework runtime, no render-blocking script, no canvas in the document, every page inside its budget.`)
