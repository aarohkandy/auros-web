/**
 * Derive the Worker's catalogue-membership file from `auros-recipes/catalogue/*.tsv`.
 *
 * WHY THE WORKER NEEDS A CATALOGUE AT ALL
 * `/order-submit` used to run the schema and stop. The schema is a grammar: it knows that `apps` is a
 * list of strings of a certain shape, and it cannot know that "Totally Fake App" is not a thing this
 * base image can install. CI knows, because `auros-recipes/src/validate.ts` resolves every application,
 * language and keyboard against the catalogue. So the Worker accepted recipes CI then refused — and
 * the Worker's own refusal text says "This is the same schema auros-recipes validates with in CI",
 * which was true of the schema document and false of the validation. An order the Worker blessed, made
 * into a public pull request and created a Stripe Checkout session for could then be rejected by the CI
 * it had told the customer it already satisfied.
 *
 * WHY A DERIVED JSON RATHER THAN THE .tsv FILES
 * The Worker is bundled by esbuild, which imports JSON and does not import TSV. A generated JSON is
 * therefore the shipping format, and the drift risk that comes with any generated file is handled the
 * same way the schema's is: this module is the only thing that writes it, the sha256 of every source
 * file is recorded inside it, and `worker/test/catalogue-provenance.test.js` re-derives from
 * `auros-recipes` and fails on any difference. A copy that a test can regenerate byte-for-byte is not
 * really a second file.
 *
 * WHAT IS IN IT: membership, and nothing else. The Worker does not compile a recipe, so it needs to
 * know that a name resolves, never what it resolves to. Package references stay out of the bundle,
 * which also keeps the one public thing about our base image out of a public JavaScript file.
 */

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const SOURCES = ['apps.tsv', 'languages.tsv', 'keyboards.tsv', 'groups.tsv']

/** Rows of a tab-separated file, comments and blank lines dropped, header row consumed. */
function readTsv (text) {
  const rows = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (line.trim() === '' || line.startsWith('#')) continue
    rows.push(line.split('\t').map(c => c.trim()))
  }
  if (rows.length === 0) throw new Error('a catalogue file with no rows is a catalogue that refuses everything')
  return rows.slice(1)
}

const sha = (s) => createHash('sha256').update(s).digest('hex')
const sorted = (set) => [...set].sort()

/**
 * @param {string} catalogueDir  auros-recipes/catalogue
 * @returns {object} the document, ready to be JSON.stringify'd with two-space indent
 */
export function deriveCatalogue (catalogueDir) {
  /** @type {Record<string,string>} */
  const text = {}
  /** @type {Record<string,string>} */
  const source = {}
  for (const file of SOURCES) {
    text[file] = readFileSync(join(catalogueDir, file), 'utf8')
    source[file] = sha(text[file])
  }

  const apps = new Set()
  for (const row of readTsv(text['apps.tsv'])) if (row[0]) apps.add(row[0])

  const languages = new Set()
  for (const row of readTsv(text['languages.tsv'])) if (row[0]) languages.add(row[0])

  // keyboards.tsv holds two kinds of row in one file, told apart by the `kind` column: a `layout` a
  // recipe may name, and a `toggle` it may name as switch_scripts_with. They are separate vocabularies
  // and mixing them would let a recipe set its keyboard to a key combination.
  const layouts = new Set()
  const toggles = new Set()
  for (const row of readTsv(text['keyboards.tsv'])) {
    const [kind, name] = row
    if (!name) continue
    if (kind === 'layout') layouts.add(name)
    else if (kind === 'toggle') toggles.add(name)
  }

  const groups = new Set()
  for (const row of readTsv(text['groups.tsv'])) if (row[0]) groups.add(row[0])

  for (const [name, set] of Object.entries({ apps, languages, layouts, toggles, groups })) {
    if (set.size === 0) throw new Error(`catalogue: no ${name} at all — refusing to ship a vocabulary that accepts nothing`)
  }

  return {
    $comment:
      'GENERATED. Derived from auros-recipes/catalogue/*.tsv by auros-web/schema/derive-catalogue.mjs. ' +
      'Do not edit: worker/test/catalogue-provenance.test.js re-derives it and fails on any difference. ' +
      'Membership only — the Worker resolves names, it does not compile them, so no package reference is here.',
    source,
    apps: sorted(apps),
    languages: sorted(languages),
    layouts: sorted(layouts),
    toggles: sorted(toggles),
    groups: sorted(groups)
  }
}

export function serialise (doc) {
  return JSON.stringify(doc, null, 2) + '\n'
}
