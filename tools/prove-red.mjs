#!/usr/bin/env node
/**
 * AUROS — the two new gates, watched failing.
 *
 * DECISIONS.md D34: "every check must be watched failing, mechanically", and D37, which is the
 * sharper version — `verify` itself reported PASS on failing suites for an afternoon, and the only
 * reason anybody found out was a meta-test that broke it on purpose.
 *
 * `tools/lighthouse.mjs`, `tools/nojs.mjs` and `tools/content-js.mjs` are checks. Until this file existed, nobody had
 * watched either of them go red, and a Lighthouse gate is an unusually easy one to write green
 * forever: point it at the wrong directory, or a route list that resolves to nothing, or compare a
 * score against `undefined`, and it passes every build on any site at all.
 *
 * Each mutation below copies `dist/` to a scratch tree, breaks ONE thing, runs the gate that owns
 * it, and requires:
 *   1. a non-zero exit, and
 *   2. that the failure text names the reason stated here — so a mutation that trips the gate by
 *      accident (a crash, a missing file, a 500) is NOT scored as a catch.
 *
 * It also runs both gates unmutated and requires green. That is D34's direction audit in miniature:
 * a check seen in only one direction is not evidence.
 *
 * Usage:  node tools/prove-red.mjs [--only <id>] [--quick]
 *         --quick skips the Lighthouse mutations (they cost a Chrome run each) and proves the
 *         no-JS and content-JS gates only. CI runs the full set.
 */

import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO = resolve(HERE, '..')
const DIST = join(REPO, 'dist')
const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const quick = args.includes('--quick')

if (!readdirSync(DIST).some((f) => f.endsWith('.html'))) {
  console.error('prove-red: dist/ has no pages. Run `pnpm build` first.')
  process.exit(2)
}

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'auros-prove-red-'))
  cpSync(DIST, join(dir, 'dist'), { recursive: true })
  return join(dir, 'dist')
}

function edit(root, file, fn) {
  const p = join(root, file)
  writeFileSync(p, fn(readFileSync(p, 'utf8')))
}

const GATE_SCRIPT = { lighthouse: 'lighthouse.mjs', nojs: 'nojs.mjs', 'content-js': 'content-js.mjs' }
function runGate(gate, root, extra = []) {
  const script = GATE_SCRIPT[gate]
  if (!script) throw new Error(`prove-red: no script for gate "${gate}"`)
  const r = spawnSync(process.execPath, [join(HERE, script), '--root', root, ...extra], {
    cwd: REPO, encoding: 'utf8',
    // Merged, and read directly — never piped through anything. D19/D37 is exactly the bug where a
    // pipeline's exit status belonged to `tail` and every failure scored as a pass.
    env: { ...process.env },
  })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/**
 * Every row: what is broken, which gate must notice, and the string its complaint must contain.
 * The `expect` string is the load-bearing half. Without it this file would pass on a gate that
 * crashed for an unrelated reason, which is the same class of bug it exists to catch.
 */
const MUTATIONS = [
  {
    id: 'nojs-argument-into-template',
    gate: 'nojs',
    why: 'the page’s argument is moved inside a <template>, so only JavaScript can reveal it',
    expect: 'N2',
    apply(root) {
      edit(root, 'faq.html', (h) =>
        h.replace(/<main\b([^>]*)>([\s\S]*?)<\/main>/i, (_m, attrs, inner) =>
          `<main${attrs}><h1>Questions</h1><template>${inner}</template></main>`),
      )
    },
  },
  {
    id: 'nojs-argument-behind-hidden',
    gate: 'nojs',
    why: 'the argument is present but carries `hidden`, which only a script would remove',
    expect: 'N3',
    apply(root) {
      edit(root, 'pricing.html', (h) =>
        h.replace(/<main\b([^>]*)>([\s\S]*?)<\/main>/i, (_m, attrs, inner) =>
          `<main${attrs}><h1>Pricing</h1><div hidden>${inner}</div></main>`),
      )
    },
  },
  {
    id: 'nojs-mailto-deleted',
    gate: 'nojs',
    why: 'every mailto: is removed, so §6D’s fallback has nowhere to land',
    expect: 'N4',
    apply(root) {
      for (const f of readdirSync(root).filter((x) => x.endsWith('.html'))) {
        edit(root, f, (h) => h.replace(/mailto:/gi, 'https://example.invalid/#'))
      }
    },
  },
  {
    id: 'nojs-mailto-only-inside-a-template',
    gate: 'nojs',
    why: 'the mailto survives but only inside a <template>, i.e. only a script ever renders it',
    expect: 'N4',
    apply(root) {
      for (const f of readdirSync(root).filter((x) => x.endsWith('.html'))) {
        edit(root, f, (h) =>
          h.replace(/<a\b([^>]*\bhref="mailto:[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi,
            (_m, a, t) => `<template><a ${a}>${t}</a></template>`),
        )
      }
    },
  },
  {
    id: 'nojs-wrong-address',
    gate: 'nojs',
    why: 'a stale hard-coded address diverges from the one copy.ts owns',
    expect: 'N5',
    apply(root) {
      edit(root, 'order.html', (h) => h.replace(/mailto:[^"?]*/i, 'mailto:orders@auros.invalid'))
    },
  },
  {
    id: 'nojs-noscript-stripped',
    gate: 'nojs',
    why: 'the <noscript> fallback is deleted from a page whose form is a JavaScript-only <template>',
    expect: 'N6',
    apply(root) {
      edit(root, 'configure.html', (h) => h.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ''))
    },
  },
  {
    id: 'nojs-placeholder-undisclosed',
    gate: 'nojs',
    why: 'the placeholder address is offered without the page saying it is not live (§4.4)',
    expect: 'N7',
    apply(root) {
      edit(root, 'configure.html', (h) => h.replace(/placeholder/gi, 'address'))
    },
  },
  {
    id: 'js-framework-in-a-bundle',
    gate: 'content-js',
    why: 'a React runtime signature appears in a shipped bundle, which is what \u00a76D forbids on content pages',
    expect: 'J1',
    apply(root) {
      const dir = join(root, '_astro')
      const f = readdirSync(dir).find((x) => x.endsWith('.js'))
      writeFileSync(join(dir, f), `${readFileSync(join(dir, f), 'utf8')}\nwindow.__reactFiber$x=1;\n`)
    },
  },
  {
    id: 'js-render-blocking-script',
    gate: 'content-js',
    why: 'a content page gains a synchronous external <script>, which puts JavaScript on the first-paint path',
    expect: 'J2',
    apply(root) {
      writeFileSync(join(root, 'blocker.js'), 'window.__b=1;\n')
      edit(root, 'faq.html', (h) => h.replace(/<\/title>/i, '</title><script src="/blocker.js"></script>'))
    },
  },
  {
    id: 'js-canvas-in-the-document',
    gate: 'content-js',
    why: 'the terrain canvas is placed in the served HTML, so it is laid out before first paint',
    expect: 'J3',
    apply(root) {
      edit(root, 'index.html', (h) => h.replace(/<body\b([^>]*)>/i, (_m, a) => `<body${a}><canvas width="960" height="4000"></canvas>`))
    },
  },
  {
    id: 'js-over-budget',
    gate: 'content-js',
    why: 'a content page starts shipping far more JavaScript than its committed budget',
    expect: 'J4',
    apply(root) {
      writeFileSync(join(root, '_astro', 'bloat.js'), `export const x=${JSON.stringify('y'.repeat(400_000).split(''))}\n`)
      edit(root, 'faq.html', (h) => h.replace(/<\/body>/i, '<script type="module" src="/_astro/bloat.js"></script></body>'))
    },
  },
  {
    id: 'lh-accessibility',
    gate: 'lighthouse',
    lighthouse: true,
    page: '/faq',
    why: 'three real accessibility defects are injected: no document language, an image with no alt text, and a link with no name',
    expect: 'accessibility',
    apply(root) {
      edit(root, 'faq.html', (h) =>
        h
          .replace(/<html\b[^>]*>/i, '<html>')
          .replace(/<main\b([^>]*)>/i,
            (_m, a) => `<main${a}><img src="/favicon.svg" width="40" height="40"><a href="/pricing"></a>`),
      )
    },
  },
  {
    id: 'lh-performance',
    gate: 'lighthouse',
    lighthouse: true,
    page: '/faq',
    why: 'a render-blocking synchronous script that also burns the main thread is added to the head',
    expect: 'performance',
    apply(root) {
      // ~1.5 MB of source, then a busy loop. Both halves matter: the bytes move FCP/LCP under
      // simulated 4G, the loop moves TBT. A gate that only watched one metric would miss the other.
      const filler = `/*${'x'.repeat(1_500_000)}*/\n`
      const busy = 'var t=Date.now();var s=0;while(Date.now()-t<1200){s+=Math.sqrt(t%97);}window.__s=s;\n'
      writeFileSync(join(root, 'prove-red-blocker.js'), filler + busy)
      edit(root, 'faq.html', (h) => h.replace(/<\/title>/i, '</title><script src="/prove-red-blocker.js"></script>'))
    },
  },
]

// ── the green direction, first ──────────────────────────────────────────────────────────────────
const results = []
function record(id, ok, detail) {
  results.push({ id, ok, detail })
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${id}${detail ? `  — ${detail}` : ''}`)
}

console.log('prove-red: the direction audit — both gates on an UNMUTATED build must be green\n')
for (const gate of ['nojs', 'content-js']) {
  const g = runGate(gate, DIST)
  record(`green/${gate}`, g.code === 0, g.code === 0 ? 'exits 0 on the real dist' : `exited ${g.code}\n${g.out.slice(-1500)}`)
}
if (!quick) {
  const g = runGate('lighthouse', DIST, ['--pages', '/faq', '--quiet', '--out', '.lighthouse-prove-red'])
  record('green/lighthouse', g.code === 0, g.code === 0 ? 'exits 0 on the real dist' : `exited ${g.code}\n${g.out.slice(-1500)}`)
}

console.log('\nprove-red: the red direction — one deliberate defect at a time\n')
for (const m of MUTATIONS) {
  if (only && m.id !== only) continue
  if (quick && m.lighthouse) { console.log(` skip  ${m.id}  (--quick)`); continue }
  const root = scratch()
  try {
    m.apply(root)
    const extra = m.lighthouse ? ['--pages', m.page, '--quiet', '--out', '.lighthouse-prove-red'] : []
    const g = runGate(m.gate, root, extra)
    if (g.code === 0) {
      record(m.id, false, `the ${m.gate} gate exited 0 with this broken: ${m.why}`)
    } else if (!g.out.includes(m.expect)) {
      // Red for the wrong reason is not a catch. This is D34's rule and it is the half that a
      // mutation harness usually skips.
      record(m.id, false, `went red (exit ${g.code}) but never printed "${m.expect}" — red for a different reason.\n${g.out.slice(-1200)}`)
    } else {
      record(m.id, true, `${m.gate} red for the stated reason (${m.expect})`)
    }
  } finally {
    rmSync(resolve(root, '..'), { recursive: true, force: true })
  }
}

const bad = results.filter((r) => !r.ok)
console.log('')
if (bad.length) {
  console.log(`prove-red: FAIL — ${bad.length} of ${results.length}`)
  for (const b of bad) console.log(`\n  ${b.id}\n    ${b.detail}`)
  process.exit(1)
}
console.log(`prove-red: PASS — ${results.length} check(s); every gate seen green AND seen red for its stated reason.`)
