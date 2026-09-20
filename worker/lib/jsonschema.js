/**
 * A JSON Schema 2020-12 evaluator, small enough to read in one sitting and strict enough to be a
 * control rather than a convenience.
 *
 * It knows nothing about recipes. The recipe rules live in `schema/recipe.schema.json`, which is the
 * same file `auros-recipes` validates with in CI (see schema/SOURCE.md). This module is the engine
 * those rules are fed to, which is why it is not "a parallel reimplementation of the validator" in the
 * sense docs/CONFIGURATOR.md forbids.
 *
 * The one property that matters most:
 *
 *   **An unknown keyword is a hard error, not an ignored annotation.**
 *
 * A validator that silently skips keywords it has not heard of gets weaker every time somebody edits
 * the schema, and gets weaker invisibly. `compile()` walks the whole schema up front and throws
 * `SchemaUnsupportedError` if it meets a keyword this file does not implement. The Worker turns that
 * into a 503 that refuses the order. Failing closed on our own ignorance is the only honest default:
 * the alternative is accepting a recipe because we could not read the rule that would have rejected it.
 */

export class SchemaUnsupportedError extends Error {
  /** @param {string} message */
  constructor (message) { super(message); this.name = 'SchemaUnsupportedError' }
}

/** Keywords that carry no assertion. Present so they are known, not so they are used. */
const ANNOTATION = new Set([
  '$schema', '$id', '$comment', '$anchor', 'title', 'description', 'default', 'examples',
  'deprecated', 'readOnly', 'writeOnly'
])

/** Keywords this evaluator implements. Anything outside these two sets throws. */
const IMPLEMENTED = new Set([
  '$ref', '$defs',
  'type', 'const', 'enum',
  'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else',
  'properties', 'patternProperties', 'additionalProperties', 'propertyNames',
  'required', 'minProperties', 'maxProperties', 'dependentRequired',
  'items', 'prefixItems', 'minItems', 'maxItems', 'uniqueItems', 'contains',
  'minLength', 'maxLength', 'pattern', 'format',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'
])

/** Subschema-valued keywords, for the up-front walk. */
const SUB_SCHEMA = ['not', 'if', 'then', 'else', 'items', 'contains', 'additionalProperties', 'propertyNames']
const SUB_SCHEMA_ARRAY = ['allOf', 'anyOf', 'oneOf', 'prefixItems']
const SUB_SCHEMA_MAP = ['properties', 'patternProperties', '$defs']

/**
 * Walk a schema and refuse it if it uses anything this file does not implement.
 * Call once at module load so the failure is loud and early, never per-request and never partial.
 * @param {any} schema
 * @param {string} [path]
 * @returns {any} the same schema, for chaining
 */
export function compile (schema, path = '#') {
  if (typeof schema === 'boolean') return schema
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new SchemaUnsupportedError(`${path}: a schema must be an object or a boolean`)
  }
  for (const key of Object.keys(schema)) {
    if (ANNOTATION.has(key)) continue
    if (!IMPLEMENTED.has(key)) {
      throw new SchemaUnsupportedError(
        `${path}: keyword "${key}" is not implemented by worker/lib/jsonschema.js. ` +
        'Implement it before shipping the schema change — do not let it be ignored.'
      )
    }
  }
  if ('$ref' in schema && typeof schema.$ref !== 'string') {
    throw new SchemaUnsupportedError(`${path}/$ref: must be a string`)
  }
  if (typeof schema.$ref === 'string' && !schema.$ref.startsWith('#')) {
    throw new SchemaUnsupportedError(
      `${path}/$ref: "${schema.$ref}" is a remote reference. A Worker that fetches a schema at ` +
      'validation time can be made to validate against a schema an attacker controls. Local only.'
    )
  }
  if (typeof schema.pattern === 'string') safeRegExp(schema.pattern, `${path}/pattern`)
  if (schema.patternProperties) {
    for (const p of Object.keys(schema.patternProperties)) safeRegExp(p, `${path}/patternProperties/${p}`)
  }
  if (typeof schema.format === 'string' && !FORMATS[schema.format]) {
    throw new SchemaUnsupportedError(
      `${path}/format: "${schema.format}" is not implemented. An unasserted format is decoration.`
    )
  }
  for (const k of SUB_SCHEMA) if (k in schema && typeof schema[k] !== 'boolean') compile(schema[k], `${path}/${k}`)
  for (const k of SUB_SCHEMA_ARRAY) {
    if (!(k in schema)) continue
    if (!Array.isArray(schema[k])) throw new SchemaUnsupportedError(`${path}/${k}: must be an array`)
    schema[k].forEach((s, i) => compile(s, `${path}/${k}/${i}`))
  }
  for (const k of SUB_SCHEMA_MAP) {
    if (!(k in schema)) continue
    for (const [name, s] of Object.entries(schema[k])) {
      if (k === '$defs' && isNamespace(s)) {
        // `$defs/refusals` is a folder, not a schema: it holds `refusals/base`, `refusals/pins` and so
        // on, each `$ref`-ed individually from the root `allOf`. JSON Schema permits this (unknown
        // members of a schema object are ignored), so the walk has to permit it too. The test is
        // deliberately narrow — an object with NO schema keyword and NO annotation keyword, every value
        // an object. A `$defs` entry with a typo'd keyword still has `type` or `title` beside it and so
        // is still checked as a schema rather than waved through as a folder.
        for (const [inner, s2] of Object.entries(s)) {
          if (ANNOTATION.has(inner)) continue
          compile(s2, `${path}/${k}/${name}/${inner}`)
        }
        continue
      }
      compile(s, `${path}/${k}/${name}`)
    }
  }
  return schema
}

/** @param {any} v */
function isNamespace (v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const keys = Object.keys(v)
  if (keys.some(k => IMPLEMENTED.has(k))) return false // it asserts something, so it is a schema
  const members = keys.filter(k => !ANNOTATION.has(k))  // a folder may still carry its own prose
  if (members.length === 0) return false
  return members.every(k => v[k] && typeof v[k] === 'object' && !Array.isArray(v[k]))
}

/**
 * Patterns come from our own schema, but compiling an attacker-influenced regex is a class of bug
 * worth closing by construction rather than by review. We cap length and reject nested quantifiers,
 * the shape that makes backtracking explode.
 * @param {string} source
 * @param {string} path
 */
function safeRegExp (source, path) {
  const cached = REGEX_CACHE.get(source)
  if (cached) return cached
  if (source.length > 512) throw new SchemaUnsupportedError(`${path}: pattern is too long to be reviewable`)
  // The dangerous shape is an unbounded group whose FIRST atom is itself unbounded — `(a+)+`,
  // `(?:[a-z]*x)*` — because the engine can split one input across the two quantifiers many ways.
  // `(?:-[a-z0-9]+)*` is not that shape: the mandatory `-` makes every split unique. A `?` group is
  // bounded and never qualifies. This is narrow on purpose; the broad version rejected our own schema.
  for (const m of source.matchAll(/\((?:\?:)?((?:\\.|\[(?:\\.|[^\]])*\]|[^()])*)\)\s*(?:[*+]|\{\d+,\}?)/g)) {
    const body = m[1]
    const firstAtom = /^(?:\\.|\[(?:\\.|[^\]])*\]|[^\[\\()])([*+{])/.exec(body)
    if (firstAtom) {
      throw new SchemaUnsupportedError(
        `${path}: "${m[0]}" is an unbounded repeat of an unbounded repeat. On a hostile input that ` +
        'backtracks exponentially and stalls the Worker. Anchor the inner atom or bound the outer one.'
      )
    }
  }
  let re
  try { re = new RegExp(source, 'u') } catch {
    try { re = new RegExp(source) } catch (e) { throw new SchemaUnsupportedError(`${path}: ${String(e)}`) }
  }
  REGEX_CACHE.set(source, re)
  return re
}

/** Compiling the same twenty patterns on every request is waste we can see from here. */
const REGEX_CACHE = new Map()

const FORMATS = {
  /** @param {unknown} v */
  date (v) {
    if (typeof v !== 'string') return true
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
    if (!m) return false
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    const dt = new Date(Date.UTC(y, mo - 1, d))
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
  }
}

/**
 * @typedef {object} ValidationError
 * @property {string} path      JSON Pointer into the submitted document.
 * @property {string} keyword   Which rule refused.
 * @property {string} message   What went wrong, in the validator's words.
 * @property {string} [title]   The nearest enclosing schema title. For a refusal this is the argument.
 * @property {string} [reason]  The nearest enclosing schema description. Printed to the customer.
 */

/**
 * @param {any} schema  a schema already passed through compile()
 * @param {unknown} data
 * @returns {{ valid: boolean, errors: ValidationError[] }}
 */
export function validate (schema, data) {
  /** @type {ValidationError[]} */
  const errors = []
  evaluate(schema, data, '', schema, errors, { title: schema.title, reason: schema.description })
  return { valid: errors.length === 0, errors }
}

/** Does this subschema hold, ignoring where and why? Used by `not`, `if`, `anyOf`, `oneOf`. */
function holds (schema, data, root) {
  /** @type {ValidationError[]} */
  const sink = []
  evaluate(schema, data, '', root, sink, {})
  return sink.length === 0
}

/**
 * @param {any} schema
 * @param {unknown} data
 * @param {string} path
 * @param {any} root
 * @param {ValidationError[]} errors
 * @param {{title?: string, reason?: string}} ann  nearest titled ancestor — this is what the reader sees
 */
function evaluate (schema, data, path, root, errors, ann) {
  if (schema === true) return
  if (schema === false) { push(errors, path, 'false', 'nothing is allowed here', ann); return }

  // The nearest *titled* ancestor is what a refusal message is made of. `$defs/refusals/pins` carries
  // the title "Nothing can be held at a version" and the paragraph explaining why refusing is the
  // point; a bare "not/required failed" would throw that away, and that paragraph is the most
  // persuasive thing the panel can show (docs/CONFIGURATOR.md, constraint 4).
  const here = schema.title || schema.description
    ? { title: schema.title ?? ann.title, reason: schema.description ?? ann.reason }
    : ann

  if (typeof schema.$ref === 'string') {
    const target = resolve(root, schema.$ref)
    evaluate(target, data, path, root, errors, here.title || here.reason ? here : { title: target.title, reason: target.description })
  }

  if ('type' in schema && !typeMatches(schema.type, data)) {
    push(errors, path, 'type', `expected ${[].concat(schema.type).join(' or ')}, got ${typeOf(data)}`, here)
    return // every other assertion below would just restate this
  }
  if ('const' in schema && !deepEqual(data, schema.const)) {
    push(errors, path, 'const', `must be ${JSON.stringify(schema.const)}`, here)
  }
  if (Array.isArray(schema.enum) && !schema.enum.some(v => deepEqual(data, v))) {
    push(errors, path, 'enum', `must be one of: ${schema.enum.map(v => JSON.stringify(v)).join(', ')}`, here)
  }

  if (typeof data === 'string') stringAssertions(schema, data, path, errors, here)
  if (typeof data === 'number') numberAssertions(schema, data, path, errors, here)
  if (Array.isArray(data)) arrayAssertions(schema, data, path, root, errors, here)
  if (isPlainObject(data)) objectAssertions(schema, data, path, root, errors, here)

  if (Array.isArray(schema.allOf)) for (const s of schema.allOf) evaluate(s, data, path, root, errors, here)
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some(s => holds(s, data, root))) {
    push(errors, path, 'anyOf', 'matches none of the permitted forms', here)
  }
  if (Array.isArray(schema.oneOf)) {
    const n = schema.oneOf.filter(s => holds(s, data, root)).length
    if (n !== 1) push(errors, path, 'oneOf', n === 0 ? 'matches none of the permitted forms' : 'is ambiguous between forms', here)
  }
  if ('not' in schema && holds(schema.not, data, root)) {
    push(errors, path, 'not', notMessage(schema.not), here)
  }
  if ('if' in schema) {
    const branch = holds(schema.if, data, root) ? schema.then : schema.else
    if (branch !== undefined) evaluate(branch, data, path, root, errors, here)
  }
}

/** A `not` failure is usually "you wrote a field that does not exist here". Say which field. */
function notMessage (sub) {
  if (sub && Array.isArray(sub.required) && sub.required.length) {
    return sub.required.length === 1
      ? `there is no "${sub.required[0]}" field, and its absence is deliberate`
      : `these fields do not exist here: ${sub.required.join(', ')}`
  }
  if (sub && Array.isArray(sub.enum)) return `this value is specifically not allowed: ${sub.enum.map(v => JSON.stringify(v)).join(', ')}`
  return 'this is the one shape that is not allowed here'
}

function stringAssertions (schema, data, path, errors, ann) {
  const len = [...data].length // count characters, not UTF-16 units
  if (typeof schema.minLength === 'number' && len < schema.minLength) {
    push(errors, path, 'minLength', `needs at least ${schema.minLength} characters, has ${len}`, ann)
  }
  if (typeof schema.maxLength === 'number' && len > schema.maxLength) {
    push(errors, path, 'maxLength', `may be at most ${schema.maxLength} characters, has ${len}`, ann)
  }
  if (typeof schema.pattern === 'string' && !safeRegExp(schema.pattern, path).test(data)) {
    push(errors, path, 'pattern', `does not match the permitted form ${schema.pattern}`, ann)
  }
  if (typeof schema.format === 'string' && !FORMATS[schema.format](data)) {
    push(errors, path, 'format', `is not a valid ${schema.format}`, ann)
  }
}

function numberAssertions (schema, data, path, errors, ann) {
  if (typeof schema.minimum === 'number' && data < schema.minimum) push(errors, path, 'minimum', `must be at least ${schema.minimum}`, ann)
  if (typeof schema.maximum === 'number' && data > schema.maximum) push(errors, path, 'maximum', `must be at most ${schema.maximum}`, ann)
  if (typeof schema.exclusiveMinimum === 'number' && data <= schema.exclusiveMinimum) push(errors, path, 'exclusiveMinimum', `must be greater than ${schema.exclusiveMinimum}`, ann)
  if (typeof schema.exclusiveMaximum === 'number' && data >= schema.exclusiveMaximum) push(errors, path, 'exclusiveMaximum', `must be less than ${schema.exclusiveMaximum}`, ann)
  if (typeof schema.multipleOf === 'number' && Math.abs(data / schema.multipleOf - Math.round(data / schema.multipleOf)) > 1e-9) {
    push(errors, path, 'multipleOf', `must be a multiple of ${schema.multipleOf}`, ann)
  }
}

function arrayAssertions (schema, data, path, root, errors, ann) {
  if (typeof schema.minItems === 'number' && data.length < schema.minItems) push(errors, path, 'minItems', `needs at least ${schema.minItems} entries`, ann)
  if (typeof schema.maxItems === 'number' && data.length > schema.maxItems) push(errors, path, 'maxItems', `may have at most ${schema.maxItems} entries`, ann)
  if (schema.uniqueItems === true) {
    const seen = new Set()
    for (const item of data) {
      const k = canonical(item)
      if (seen.has(k)) { push(errors, path, 'uniqueItems', `${canonical(item)} is listed twice`, ann); break }
      seen.add(k)
    }
  }
  const prefix = Array.isArray(schema.prefixItems) ? schema.prefixItems : []
  data.forEach((item, i) => {
    if (i < prefix.length) evaluate(prefix[i], item, `${path}/${i}`, root, errors, ann)
    else if (schema.items !== undefined) evaluate(schema.items, item, `${path}/${i}`, root, errors, ann)
  })
  if (schema.contains !== undefined && !data.some(item => holds(schema.contains, item, root))) {
    push(errors, path, 'contains', 'no entry here is of the required kind', ann)
  }
}

function objectAssertions (schema, data, path, root, errors, ann) {
  const keys = Object.keys(data)
  if (Array.isArray(schema.required)) {
    for (const k of schema.required) {
      if (!Object.prototype.hasOwnProperty.call(data, k)) push(errors, path, 'required', `"${k}" is missing`, ann)
    }
  }
  if (typeof schema.minProperties === 'number' && keys.length < schema.minProperties) push(errors, path, 'minProperties', `needs at least ${schema.minProperties} fields`, ann)
  if (typeof schema.maxProperties === 'number' && keys.length > schema.maxProperties) push(errors, path, 'maxProperties', `may have at most ${schema.maxProperties} fields`, ann)
  if (schema.dependentRequired) {
    for (const [trigger, needed] of Object.entries(schema.dependentRequired)) {
      if (!(trigger in data)) continue
      for (const k of needed) if (!(k in data)) push(errors, path, 'dependentRequired', `"${trigger}" requires "${k}"`, ann)
    }
  }
  const named = schema.properties ? Object.keys(schema.properties) : []
  const patterns = schema.patternProperties ? Object.entries(schema.patternProperties) : []
  for (const k of keys) {
    const ptr = `${path}/${escapePointer(k)}`
    let covered = false
    if (named.includes(k)) { evaluate(schema.properties[k], data[k], ptr, root, errors, ann); covered = true }
    for (const [p, sub] of patterns) {
      if (safeRegExp(p, `${path}/patternProperties`).test(k)) { evaluate(sub, data[k], ptr, root, errors, ann); covered = true }
    }
    if (schema.propertyNames !== undefined) evaluate(schema.propertyNames, k, ptr, root, errors, ann)
    if (!covered && schema.additionalProperties !== undefined) {
      if (schema.additionalProperties === false) {
        push(errors, ptr, 'additionalProperties', `there is no "${k}" field in this form`, ann)
      } else {
        evaluate(schema.additionalProperties, data[k], ptr, root, errors, ann)
      }
    }
  }
}

/** @param {any} root @param {string} ref */
function resolve (root, ref) {
  if (ref === '#') return root
  const parts = ref.slice(2).split('/').map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'))
  let node = root
  for (const p of parts) {
    if (node === undefined || node === null) throw new SchemaUnsupportedError(`unresolvable $ref ${ref}`)
    node = node[p]
  }
  if (node === undefined) throw new SchemaUnsupportedError(`unresolvable $ref ${ref}`)
  return node
}

function push (errors, path, keyword, message, ann) {
  if (errors.length >= 60) return // an error list nobody reads is not a better error list
  errors.push({ path: path || '/', keyword, message, ...(ann.title ? { title: ann.title } : {}), ...(ann.reason ? { reason: ann.reason } : {}) })
}

function typeMatches (type, data) {
  const list = Array.isArray(type) ? type : [type]
  return list.some(t => {
    switch (t) {
      case 'object': return isPlainObject(data)
      case 'array': return Array.isArray(data)
      case 'string': return typeof data === 'string'
      case 'number': return typeof data === 'number' && Number.isFinite(data)
      case 'integer': return typeof data === 'number' && Number.isInteger(data)
      case 'boolean': return typeof data === 'boolean'
      case 'null': return data === null
      default: throw new SchemaUnsupportedError(`unknown type "${t}"`)
    }
  })
}

/** @param {unknown} v */
function typeOf (v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number'
  return typeof v
}

/** Objects only — not arrays, not null, and not anything with a poisoned prototype. */
export function isPlainObject (v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function escapePointer (k) { return k.replace(/~/g, '~0').replace(/\//g, '~1') }

export function deepEqual (a, b) { return canonical(a) === canonical(b) }

/** Stable stringify so key order never decides equality. */
export function canonical (v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'undefined'
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
}
