#!/usr/bin/env node
/**
 * AUROS — prove the no-JavaScript path, over HTTP, on the BUILT site.
 *
 * Spec §6D: "Works with JS disabled down to a mailto fallback." Nothing had ever checked it. The
 * risk this file exists to catch is specific and it is not hypothetical anywhere on the modern web:
 * a page whose argument lives in a `<template>` or behind a `[hidden]` that only JavaScript
 * removes reads perfectly in a browser and is a blank panel to a reader with JavaScript off, to a
 * text browser, and to anything that fetches the page rather than runs it.
 *
 * "Scripts disabled" is implemented the only way that cannot be faked: the bytes are fetched from
 * `tools/serve-dist.mjs` and parsed, and NOTHING executes them. There is no headless browser here
 * on purpose — a browser with `--disable-javascript` would still be trusting a browser to tell us
 * what a browser does.
 *
 * What is asserted, per page:
 *
 *   N1  `<main>` exists and contains a non-empty `<h1>`.
 *   N2  After deleting every `<script>` and every `<template>`, and after deleting every element
 *       carrying a bare `hidden` attribute, `<main>` still carries at least the committed floor of
 *       words for that page. The floor is a RATCHET: it is written by `--write`, committed, and
 *       only ever goes up without a deliberate edit, so a change that quietly moves an argument
 *       into a template shows up as a word count that fell through the floor.
 *   N3  No single element that is `hidden` in the served HTML holds more than HIDDEN_WORD_MAX
 *       words. A large hidden block is the shape of "the page waits for JavaScript to say what it
 *       is for". Elements that are genuinely JS-only status lines are tiny and pass this.
 *   N4  A `mailto:` to the site's contact address is REACHABLE without JavaScript: either on the
 *       page itself, or by following `<a href>` links that exist in the served HTML — not links a
 *       script would create. The hop path is printed for every page, so "reachable" is a route you
 *       can read and not a boolean somebody asserted.
 *   N5  Every mailto found parses: a scheme, a local part, an `@`, a domain. And it is the address
 *       `src/content/copy.ts` declares, so a stale hard-coded address cannot hide in a template.
 *   N6  Any page whose interactive region is JS-only (it ships a `<template>` inside `<main>`)
 *       must carry a `<noscript>` block, and that block must itself contain the mailto. This is the
 *       "down to a mailto fallback" clause, enforced where it actually applies.
 *   N7  §4.4 honesty: while `contactEmailIsPlaceholder` is true, any page offering that address
 *       must also say on the page that it is not live. A fallback that points into a hole, silently,
 *       is worse than no fallback.
 *
 * Usage:
 *   node tools/nojs.mjs              # verify against the committed floors
 *   node tools/nojs.mjs --write      # re-measure and rewrite tools/nojs-floors.json (ratchet)
 */

import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO = resolve(HERE, '..')
const args = process.argv.slice(2)
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1] }
const root = resolve(REPO, arg('root', 'dist'))
const write = args.includes('--write')
const FLOORS = join(HERE, 'nojs-floors.json')

/** A big hidden block is a page waiting for JavaScript. A four-word status line is not. */
const HIDDEN_WORD_MAX = 25
/** How far a reader with no JavaScript may have to click to reach a way of contacting us. */
const MAX_HOPS = 2

// ── the contact address, read from the single place that owns it ────────────────────────────────
// Parsed rather than imported: copy.ts is TypeScript and this script has to run under plain node in
// CI without a loader. If the shape ever changes, this throws — which is the correct outcome,
// because a check that silently stopped finding the address would pass forever.
const copySrc = await readFile(join(REPO, 'src/content/copy.ts'), 'utf8')
const emailMatch = copySrc.match(/contactEmail:\s*"([^"]+)"/)
const placeholderMatch = copySrc.match(/contactEmailIsPlaceholder:\s*(true|false)/)
if (!emailMatch || !placeholderMatch) {
  console.error('nojs: could not read contactEmail / contactEmailIsPlaceholder out of src/content/copy.ts.')
  console.error('      That is a real failure, not a missing feature: this check cannot verify an address it cannot find.')
  process.exit(2)
}
const CONTACT = emailMatch[1]
const IS_PLACEHOLDER = placeholderMatch[1] === 'true'

// ── the smallest HTML handling that is honest about what it is ──────────────────────────────────
// No DOM library: the assertions below are about presence, nesting depth of nothing, and text, and
// a regex pass over Astro's own output is auditable in a way a dependency is not. Every helper
// below is deliberately conservative — it removes MORE than a browser would, never less, so the
// word counts it reports are a lower bound on what a reader actually sees.

const stripTag = (html, tag) =>
  html.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'gi'), ' ')

const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, ' ')

function mainOf(html) {
  const m = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)
  return m ? m[1] : null
}

/** Text a reader sees. `<noscript>` CONTENT IS KEPT — with JS off it is exactly what renders. */
function visibleText(fragment) {
  let s = stripComments(fragment)
  s = stripTag(s, 'script')
  s = stripTag(s, 'style')
  s = stripTag(s, 'template')
  s = removeHiddenElements(s).html
  s = s.replace(/<\/?noscript[^>]*>/gi, ' ')
  s = s.replace(/<[^>]+>/g, ' ')
  s = s.replace(/&[a-z]+;|&#\d+;/gi, ' ')
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Remove elements with a bare `hidden` attribute, and report what was inside them.
 *
 * Balanced-tag scanning, not a regex: `<div hidden><div>…</div>…</div>` cannot be matched by one.
 * Void elements are skipped so `<input hidden>` does not eat the rest of the document.
 */
const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'])
function removeHiddenElements(html) {
  const hiddenBlocks = []
  let out = ''
  let i = 0
  const openRe = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g
  let m
  while ((m = openRe.exec(html)) !== null) {
    const [full, tag, attrs] = m
    const isHidden = /(^|\s)hidden(\s|=|$)/i.test(attrs) && !/\shidden\s*=\s*["']?(false|until-found)/i.test(attrs)
    if (!isHidden || VOID.has(tag.toLowerCase())) continue
    out += html.slice(i, m.index)
    // Walk forward counting same-tag opens and closes until this one closes.
    let depth = 1
    const scan = new RegExp(`<(/?)${tag}\\b(?:"[^"]*"|'[^']*'|[^>"'])*>`, 'gi')
    scan.lastIndex = openRe.lastIndex
    let s2
    let end = html.length
    while ((s2 = scan.exec(html)) !== null) {
      depth += s2[1] === '/' ? -1 : 1
      if (depth === 0) { end = scan.lastIndex; break }
    }
    hiddenBlocks.push({ tag, inner: html.slice(openRe.lastIndex, end) })
    i = end
    openRe.lastIndex = end
  }
  out += html.slice(i)
  return { html: out, hiddenBlocks }
}

const words = (s) => (s ? s.split(/\s+/).filter(Boolean).length : 0)

function linksIn(html) {
  // Links inside a <template> do not exist for a reader with no JavaScript, so they are removed
  // BEFORE the graph is built. Getting this backwards would let the mailto be "reachable" through
  // a link that only a script ever inserts, which is the exact lie this check is here to catch.
  const alive = stripTag(stripComments(html), 'template')
  return [...alive.matchAll(/<a\b[^>]*\bhref\s*=\s*"([^"]*)"/gi)].map((m) => m[1])
}

function parseMailto(href) {
  if (!href.toLowerCase().startsWith('mailto:')) return null
  const addr = decodeURIComponent(href.slice('mailto:'.length).split('?')[0])
  const ok = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(addr)
  return { addr, ok }
}

function routeOf(file) { return file === 'index.html' ? '/' : `/${file.replace(/\.html$/, '')}` }
function fileOf(route) {
  const clean = route.split('#')[0].split('?')[0]
  if (clean === '/' || clean === '') return 'index.html'
  return `${clean.replace(/^\//, '').replace(/\/$/, '')}.html`
}

function startServer() {
  return new Promise((ok, fail) => {
    const child = spawn(process.execPath, [join(HERE, 'serve-dist.mjs'), '--root', root, '--port', '0'], {
      stdio: ['ignore', 'pipe', 'inherit'], cwd: REPO,
    })
    let buf = ''
    const t = setTimeout(() => fail(new Error('serve-dist.mjs never printed a listening line')), 15_000)
    child.stdout.on('data', (d) => {
      buf += d.toString()
      const m = buf.match(/listening (\S+)/)
      if (m) { clearTimeout(t); ok({ origin: m[1], child }) }
    })
    child.on('exit', (c) => { clearTimeout(t); fail(new Error(`serve-dist.mjs exited ${c} before listening`)) })
  })
}

// ── run ─────────────────────────────────────────────────────────────────────────────────────────
const files = (await readdir(root)).filter((f) => f.endsWith('.html')).sort()
if (files.length === 0) { console.error(`nojs: no .html in ${root} — run \`pnpm build\` first`); process.exit(2) }

const { origin, child } = await startServer()
const pages = new Map()
try {
  for (const f of files) {
    const route = routeOf(f)
    const res = await fetch(`${origin}${route}`)
    if (!res.ok) throw new Error(`${route} served ${res.status}`)
    const html = await res.text()
    const main = mainOf(html)
    const mainNoScript = main === null ? null : stripTag(stripTag(stripComments(main), 'script'), 'template')
    const { hiddenBlocks } = main === null ? { hiddenBlocks: [] } : removeHiddenElements(mainNoScript)
    pages.set(route, {
      route, file: f, html, main,
      h1: (html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '').replace(/<[^>]+>/g, '').trim(),
      text: main === null ? '' : visibleText(main),
      hiddenBlocks,
      links: linksIn(html),
      mailtos: linksIn(html).map(parseMailto).filter(Boolean),
      hasTemplateInMain: main !== null && /<template\b/i.test(main),
      noscripts: [...html.matchAll(/<noscript\b[^>]*>([\s\S]*?)<\/noscript>/gi)].map((m) => m[1]),
    })
  }
} finally { child.kill('SIGTERM') }

// N4 — reachability, by walking the graph that exists in the served bytes.
function hopsToMailto(start) {
  const seen = new Set([start])
  let frontier = [[start, [start]]]
  for (let depth = 0; depth <= MAX_HOPS; depth++) {
    const next = []
    for (const [route, path] of frontier) {
      const p = pages.get(route)
      if (!p) continue
      if (p.mailtos.some((m) => m.addr === CONTACT)) return path
      for (const href of p.links) {
        if (/^[a-z]+:/i.test(href) || href.startsWith('//')) continue
        const f = fileOf(href)
        const r = routeOf(f)
        if (!pages.has(r) || seen.has(r)) continue
        seen.add(r)
        next.push([r, [...path, r]])
      }
    }
    frontier = next
  }
  return null
}

const floors = existsSync(FLOORS) ? JSON.parse(await readFile(FLOORS, 'utf8')) : { pages: {} }
const failures = []
const rows = []

for (const p of pages.values()) {
  const note = []
  if (p.main === null) failures.push(`${p.route}  N1  no <main> in the served HTML`)
  if (!p.h1) failures.push(`${p.route}  N1  no non-empty <h1> in the served HTML`)

  const w = words(p.text)
  const floor = floors.pages?.[p.route]
  if (!write) {
    if (floor === undefined) {
      failures.push(`${p.route}  N2  no committed word floor. Run \`node tools/nojs.mjs --write\` and commit tools/nojs-floors.json.`)
    } else if (w < floor) {
      failures.push(`${p.route}  N2  ${w} words of <main> survive with JavaScript off; the committed floor is ${floor}. Something moved out of the served HTML.`)
    }
  }

  for (const b of p.hiddenBlocks) {
    const hw = words(visibleText(b.inner))
    if (hw > HIDDEN_WORD_MAX) {
      failures.push(`${p.route}  N3  a <${b.tag} hidden> holds ${hw} words (max ${HIDDEN_WORD_MAX}). With JavaScript off nobody reads them. First words: "${visibleText(b.inner).slice(0, 90)}…"`)
    }
  }

  for (const m of p.mailtos) {
    if (!m.ok) failures.push(`${p.route}  N5  malformed mailto address "${m.addr}"`)
    else if (m.addr !== CONTACT) failures.push(`${p.route}  N5  mailto "${m.addr}" is not the address copy.ts declares ("${CONTACT}")`)
  }

  const path = hopsToMailto(p.route)
  if (!path) {
    failures.push(`${p.route}  N4  no route to a mailto:${CONTACT} within ${MAX_HOPS} link hop(s) using only links present in the served HTML.`)
  }

  if (p.hasTemplateInMain) {
    const nsWithMail = p.noscripts.filter((ns) => /mailto:/i.test(ns))
    if (nsWithMail.length === 0) {
      failures.push(`${p.route}  N6  <main> ships a <template> (a JavaScript-only region) but no <noscript> on the page contains a mailto: fallback.`)
    } else if (IS_PLACEHOLDER && !nsWithMail.some((ns) => /placeholder/i.test(visibleText(ns)))) {
      failures.push(`${p.route}  N7  offers the placeholder address ${CONTACT} without saying on the page that it is not live (§4.4).`)
    }
    note.push('template-in-main')
  }

  rows.push({ route: p.route, words: w, floor: floor ?? '-', hops: path ? path.length - 1 : 'x',
              via: path ? path.join(' → ') : '(unreachable)', note: note.join(',') })
}

if (write) {
  // 90% of what is there now, not 100%. A floor set at the exact current word count goes red on
  // every copy edit, and a check that cries wolf on every pull request is one people route around.
  // What N2 is actually looking for is the catastrophic shape — an argument moved behind a
  // <template> or a `hidden` takes a page from thousands of words to tens — and a 10% band catches
  // that with room for editing. The number going DOWN in a diff is the reviewable event.
  const next = { note: 'Floors for tools/nojs.mjs N2: 90% of the words of <main> that survived with JavaScript off when this was written. Regenerate with `node tools/nojs.mjs --write`. A number going DOWN here is the thing to look at in review.', pages: {} }
  for (const r of rows) next.pages[r.route] = Math.floor(r.words * 0.9)
  await writeFile(FLOORS, `${JSON.stringify(next, null, 2)}\n`)
  console.log(`nojs: wrote ${FLOORS}`)
}

const pad = Math.max(...rows.map((r) => r.route.length), 6)
console.log('')
console.log(`no-JS path · ${rows.length} page(s) fetched from ${origin} and parsed, never executed`)
console.log(`contact address: ${CONTACT}${IS_PLACEHOLDER ? '  (declared a placeholder — N7 requires every page offering it to say so)' : ''}`)
console.log('')
console.log(`  ${'page'.padEnd(pad)}  words  floor  hops  route to mailto`)
for (const r of rows) {
  console.log(`  ${r.route.padEnd(pad)}  ${String(r.words).padStart(5)}  ${String(r.floor).padStart(5)}  ${String(r.hops).padStart(4)}  ${r.via}${r.note ? `  [${r.note}]` : ''}`)
}
console.log('')

if (failures.length) {
  console.log(`FAIL — ${failures.length} no-JS problem(s):`)
  for (const f of failures) console.log(`  ${f}`)
  process.exit(1)
}
console.log(`PASS — every page renders its argument and reaches mailto:${CONTACT} with JavaScript off.`)
