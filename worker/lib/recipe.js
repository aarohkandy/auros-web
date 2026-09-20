/**
 * Server-side recipe validation.
 *
 * docs/CONFIGURATOR.md: "a client-side check is a convenience and never a control". Everything the
 * browser did is re-done here against the same schema document, on the assumption that the client is
 * hostile — that the panel was never run, that the JSON was hand-crafted, that the field names were
 * chosen to find a gap.
 */

// The import attribute is required by Node (ESM refuses a JSON import without it) and understood by
// esbuild, which is what wrangler bundles with. If a future bundler chokes on it, the fix is to inline
// the schema as a generated .js module — NOT to fetch it at runtime, which would mean validating
// against a document somebody else could serve.
import schema from '../schema/recipe.schema.json' with { type: 'json' }
import { compile, validate } from './jsonschema.js'
import { freeTextRefusals, reservedKeyRefusals, catalogueRefusals, collectKnownKeys, reservedByName } from './rules.js'

// Compiled once at module load, not per request. If the schema ever gains a keyword the evaluator does
// not implement, this throws while the Worker is starting — every route 500s and the deploy is
// obviously broken. That is the correct blast radius: the alternative is one quiet request accepting a
// recipe because the rule that would have rejected it was a keyword we skipped.
compile(schema)

/**
 * The two key sets the family detector needs, derived once at module load for the same reason the
 * schema is compiled once: they are a function of a file that cannot change while the Worker runs.
 */
const KNOWN_KEYS = collectKnownKeys(schema)
const NAMED_REFUSALS = reservedByName(schema)

export { schema }

/** Maximum bytes of request body we will even parse. Bounds regex work and JSON parse cost alike. */
export const MAX_BODY_BYTES = 64 * 1024

/**
 * @typedef {import('./jsonschema.js').ValidationError} ValidationError
 * @typedef {{ ok: true, recipe: Record<string, unknown> } | { ok: false, errors: ValidationError[] }} RecipeResult
 */

/**
 * @param {unknown} candidate
 * @returns {RecipeResult}
 */
export function validateRecipe (candidate) {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { ok: false, errors: [{ path: '/', keyword: 'type', message: 'a recipe is an object' }] }
  }
  // JSON.parse can produce a key literally named "__proto__" as an own property. It cannot poison a
  // prototype here, but it can produce a key that `in`/`hasOwnProperty` and the YAML emitter disagree
  // about, and a key two pieces of code disagree about is a key an attacker works with.
  const dangerous = ['__proto__', 'constructor', 'prototype']
  for (const key of deepKeys(candidate)) {
    if (dangerous.includes(key)) {
      return { ok: false, errors: [{ path: '/', keyword: 'propertyNames', message: `"${key}" is not a field name anything here will accept` }] }
    }
  }
  const { valid, errors } = validate(schema, candidate)

  // The rules a grammar cannot carry — the ones CI also runs. Before these existed the Worker was a
  // SUBSET of the control it told the customer it was, and a recipe it had blessed into a public
  // pull request could be refused by the CI it named in the blessing.
  //
  // They run ALONGSIDE the schema rather than after it, and that is deliberate. `postInstall` fails
  // the schema as "there is no postInstall field in this form" and fails the family detector as "A
  // recipe cannot run code", with the paragraph explaining why a format a stranger can send us a
  // command in is a format we cannot accept. Returning only the first would give the reader the
  // least useful of the two. CI reports both; so does this.
  const beyondTheGrammar = [
    ...freeTextRefusals(candidate),
    ...reservedKeyRefusals(candidate, KNOWN_KEYS, NAMED_REFUSALS),
    ...catalogueRefusals(/** @type {Record<string, any>} */ (candidate))
  ]

  if (!valid || beyondTheGrammar.length > 0) return { ok: false, errors: [...beyondTheGrammar, ...errors] }
  return { ok: true, recipe: /** @type {Record<string, unknown>} */ (candidate) }
}

/** @param {unknown} v @returns {Generator<string>} */
function * deepKeys (v, depth = 0) {
  if (depth > 12 || v === null || typeof v !== 'object') return
  if (Array.isArray(v)) { for (const x of v) yield * deepKeys(x, depth + 1); return }
  for (const k of Object.keys(v)) { yield k; yield * deepKeys(v[k], depth + 1) }
}

/**
 * Turn validation errors into the shape the configurator panel renders.
 *
 * The wording is the schema's own, never ours. docs/CONFIGURATOR.md constraint 4 asks the panel to show
 * the refusal "in the validator's own words, explaining why refusing is the point" — so every refusal
 * carries the `title` and the `description` written next to the rule in `recipe.schema.json`. If the
 * argument for a constraint ever needs rewording, it gets reworded in the schema, where the constraint
 * lives, and the site follows. There is no second copy of the argument to drift.
 *
 * @param {ValidationError[]} errors
 */
export function presentRefusal (errors) {
  // A refusal argues; a plain assertion just corrects. `not` is preferred over `additionalProperties`
  // because both fire for a forbidden field and only `not` carries the specific argument — writing
  // `version:` trips the root's additionalProperties AND `$defs/refusals/pins`, and it is "Nothing can
  // be held at a version" the reader needs to see, not "Customer recipe".
  // `refusal` first: those are the rules that come with an argument attached — a reserved key
  // family, a catalogue miss, command substitution in free text — and the argument is the thing
  // worth reading. Then `not`, then `additionalProperties`, which is the least informative of the
  // three and the one a reader learns nothing from.
  const refusals = [
    ...errors.filter(e => e.keyword === 'refusal'),
    ...errors.filter(e => e.keyword === 'not'),
    ...errors.filter(e => e.keyword === 'additionalProperties')
  ]
  const primary = refusals[0] ?? errors[0]
  return {
    refused: refusals.length > 0,
    headline: primary?.title ?? 'This is not a recipe the schema accepts',
    /** The paragraph from the schema explaining why the constraint is load-bearing. */
    why: primary?.reason ?? null,
    problems: errors.map(e => ({ at: e.path, says: e.message, rule: e.keyword, under: e.title ?? null }))
  }
}
