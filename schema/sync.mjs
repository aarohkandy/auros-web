#!/usr/bin/env node
/**
 * Keep every vendored copy of the recipe rulebook identical to the rulebook in `auros-recipes`.
 *
 * WHY COPIES AT ALL
 * The configurator must reject exactly what CI rejects, so the site validates against the real rules
 * and not a restatement of them. `auros-recipes` is a separate repository, so neither the site build
 * nor a Cloudflare Worker can reach across a checkout boundary at runtime and still be reproducible.
 * The answer is vendored copies plus a mechanical check: `--check` exits non-zero the moment a copy
 * and its source differ, so drift is a failed build rather than a thing somebody notices in March.
 *
 * WHAT IS VENDORED, AND WHY EACH ONE
 *
 *   recipe.schema.json        the grammar. Two destinations: the site (src/lib/recipe-validate.ts
 *                             imports it) and the Worker (worker/lib/recipe.js imports it).
 *
 *   reserved-families.json    the reserved KEY FAMILIES. A schema refuses `postInstall` as an unknown
 *                             property; these entries are why a reader is told "A recipe cannot run
 *                             code" and given the paragraph. This used to be a literal inside
 *                             auros-recipes/src/validate.ts, which meant the Worker ran the grammar and
 *                             CI ran the grammar plus these — so the Worker could bless an order CI
 *                             then refused, while the refusal text claimed the two were the same check.
 *
 *   catalogue.json            derived from catalogue/*.tsv. Membership only: does this application,
 *                             language, keyboard layout, switch combination or removable group exist.
 *                             Same reason. See derive-catalogue.mjs.
 *
 * WHY THE SITE COPY SITS OUTSIDE `src/`
 * It is a vendored artifact, not hand-written site source. `tools/honesty-gate.mjs` scans
 * `auros-web/src`, and the schema's refusal list contains the literal word "testimonial" inside
 * `"not": { "required": [...] }` — the schema FORBIDDING testimonials. Since the schema is
 * pretty-printed, that word is far enough from its `"not"` that the gate's negation heuristic no longer
 * sees the negation and reports it as a claim. Keeping the vendored copy out of the hand-written tree
 * is the correct shape anyway; widening an honesty rule to make a finding disappear is not.
 *
 *   node schema/sync.mjs          copy everything in
 *   node schema/sync.mjs --check  fail if any copy is stale  (run this in CI)
 *
 * After a copy lands, re-record the Worker's rule hashes:
 *   node worker/test/record-schema-hash.mjs
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve, relative } from 'node:path'
import { deriveCatalogue, serialise } from './derive-catalogue.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const web = resolve(here, '..')
const recipes = resolve(here, '..', '..', 'auros-recipes')

const check = process.argv.includes('--check')
const sha = (b) => createHash('sha256').update(b).digest('hex')
const show = (p) => relative(resolve(web, '..'), p)

/** @type {{ what: string, read: () => Buffer|string, dests: string[] }[]} */
const ARTEFACTS = [
  {
    what: 'schema/recipe.schema.json',
    read: () => readFileSync(join(recipes, 'schema', 'recipe.schema.json')),
    dests: [join(web, 'schema', 'recipe.schema.json'), join(web, 'worker', 'schema', 'recipe.schema.json')]
  },
  {
    what: 'schema/reserved-families.json',
    read: () => readFileSync(join(recipes, 'schema', 'reserved-families.json')),
    dests: [join(web, 'worker', 'schema', 'reserved-families.json')]
  },
  {
    what: 'catalogue/*.tsv (derived)',
    read: () => Buffer.from(serialise(deriveCatalogue(join(recipes, 'catalogue'))), 'utf8'),
    dests: [join(web, 'worker', 'catalogue', 'catalogue.json')]
  }
]

// A checkout without the sibling repository cannot prove a copy is current, and a check that passes
// when it cannot check is worse than no check.
if (!existsSync(join(recipes, 'schema', 'recipe.schema.json'))) {
  console.error(`schema/sync: cannot see ${show(recipes)}. Check out auros-recipes beside auros-web and run again.`)
  process.exit(2)
}

let stale = 0
for (const artefact of ARTEFACTS) {
  const source = artefact.read()
  for (const dest of artefact.dests) {
    if (check) {
      if (!existsSync(dest)) {
        console.error(`schema/sync: ${show(dest)} does not exist. Run \`node schema/sync.mjs\`.`)
        stale++
        continue
      }
      const have = readFileSync(dest)
      if (sha(have) !== sha(source)) {
        console.error(`schema/sync: ${show(dest)} is STALE.`)
        console.error(`  source ${sha(source).slice(0, 16)}  ${artefact.what}`)
        console.error(`  copy   ${sha(have).slice(0, 16)}`)
        stale++
        continue
      }
      console.log(`schema/sync: ${show(dest)} matches ${artefact.what} (sha256 ${sha(source).slice(0, 16)}).`)
    } else {
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, source)
      console.log(`schema/sync: ${artefact.what}\n           → ${show(dest)}\n             sha256 ${sha(source)}`)
    }
  }
}

if (check && stale > 0) {
  console.error('')
  console.error(`schema/sync: ${stale} vendored ${stale === 1 ? 'copy is' : 'copies are'} out of step with auros-recipes.`)
  console.error('The site and the Worker would validate against a different rulebook than CI, which is')
  console.error('the exact failure docs/CONFIGURATOR.md constraint 1 is about. Run `node schema/sync.mjs`,')
  console.error('then `node worker/test/record-schema-hash.mjs`.')
  process.exit(1)
}
