#!/usr/bin/env node
/**
 * Keep `auros-web/schema/recipe.schema.json` byte-identical to the schema in `auros-recipes`.
 *
 * WHY A COPY AT ALL
 * The configurator must reject exactly what CI rejects, so the site validates against the real
 * schema and not a restatement of it. `auros-recipes` is a separate repository, so the site
 * cannot reach across a checkout boundary at build time and still build reproducibly. The
 * answer is a vendored copy plus a mechanical check: `--check` exits non-zero the moment the
 * copy and the source differ, so drift is a failed build rather than a thing someone notices
 * in March.
 *
 * WHY IT SITS OUTSIDE `src/`
 * It is a vendored artifact, not hand-written site source. `tools/honesty-gate.mjs` scans
 * `auros-web/src`, and the schema's refusal list contains the literal word "testimonial"
 * inside `"not": { "required": [...] }` — the schema FORBIDDING testimonials. Since the schema
 * was pretty-printed, that word is now far enough from its `"not"` that the gate's
 * negation heuristic no longer sees the negation and reports it as a claim. Keeping the
 * vendored copy out of the hand-written tree is the correct shape anyway; widening an honesty
 * rule to make a finding disappear is not.
 *
 *   node schema/sync.mjs          copy the schema in
 *   node schema/sync.mjs --check  fail if the copy is stale  (run this in CI)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const DEST = join(here, 'recipe.schema.json')
const SOURCE = resolve(here, '..', '..', 'auros-recipes', 'schema', 'recipe.schema.json')

const check = process.argv.includes('--check')
const sha = (b) => createHash('sha256').update(b).digest('hex')

if (!existsSync(SOURCE)) {
  if (check && existsSync(DEST)) {
    // A checkout without the sibling repository cannot prove the copy is current, and a check
    // that passes when it cannot check is worse than no check.
    console.error(`schema/sync: cannot see ${SOURCE}. Check out auros-recipes beside auros-web and run again.`)
    process.exit(2)
  }
  console.error(`schema/sync: no source schema at ${SOURCE}`)
  process.exit(2)
}

const source = readFileSync(SOURCE)

if (check) {
  if (!existsSync(DEST)) {
    console.error('schema/sync: no vendored copy. Run `node schema/sync.mjs`.')
    process.exit(1)
  }
  const dest = readFileSync(DEST)
  if (sha(dest) !== sha(source)) {
    console.error('schema/sync: the vendored recipe schema is STALE.')
    console.error(`  source ${sha(source).slice(0, 16)}  ${SOURCE}`)
    console.error(`  copy   ${sha(dest).slice(0, 16)}  ${DEST}`)
    console.error('  The site would validate against a different rulebook than CI. Run `node schema/sync.mjs`.')
    process.exit(1)
  }
  console.log(`schema/sync: vendored copy matches source (sha256 ${sha(source).slice(0, 16)}).`)
  process.exit(0)
}

writeFileSync(DEST, source)
console.log(`schema/sync: copied ${SOURCE}\n           → ${DEST}\n             sha256 ${sha(source)}`)
