/**
 * A YAML *emitter*. Deliberately not a parser.
 *
 * The order flow accepts JSON and writes YAML. It never accepts YAML text and forwards it, which is
 * what makes "assume the client is hostile" cheap to hold here: there is no path by which a string the
 * visitor typed becomes YAML *structure*. An anchor, a merge key, a tag like `!!python/object`, a
 * second document, a key smuggled through an unquoted newline — none of them survive a round trip
 * through a validated JavaScript object and back out through an emitter that quotes anything it is not
 * certain of. The file that lands in a public repository is a file this function wrote.
 */

/** Keys that need no quoting. Every key in recipe.schema.json is of this shape. */
const PLAIN_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Scalars that must be quoted even though they look like words, because YAML 1.1 readers (and plenty
 * of 1.2 ones) will turn them into booleans, nulls or numbers. `on`, `no` and `y` are the famous ones;
 * a Norwegian locale abbreviated `no` is the famous bug.
 */
const AMBIGUOUS = /^(?:|~|null|Null|NULL|true|True|TRUE|false|False|FALSE|y|Y|n|N|yes|Yes|YES|no|No|NO|on|On|ON|off|Off|OFF)$/

/**
 * Anything that a YAML reader might resolve to something other than a string gets quotes.
 *
 * The rule is broader than YAML 1.2 requires, on purpose: `recipe.yaml` is read by our compiler, by
 * GitHub's preview, by whatever the customer opens it in, and by the customer's own fork years from
 * now. YAML 1.1 resolvers are still everywhere and they are hungry. `restart_daily_at: 10:30` is read
 * by PyYAML as the integer **630** — sexagesimal — which would silently become half past nothing. The
 * cost of quoting a scalar that did not need it is an extra pair of quotes; the cost of not quoting one
 * that did is a fleet that restarts at the wrong time and a bug nobody can see in the file.
 */
const NEEDS_QUOTING = new RegExp([
  '^\\s|\\s$', //                                    leading/trailing space changes the value silently
  '^[-?:,\\[\\]{}#&*!|>\'"%@`]', //                  an indicator character in first position
  '[:#]\\s', //                                      ": " opens a mapping, " #" opens a comment
  '[\\n\\r\\t\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u202a-\\u202e]', // controls and bidi marks
  '^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$', //         YAML 1.1 sexagesimal: "10:30" is 630
  '^[-+]?(?:0|[1-9][0-9_]*)$', //                    decimal integer
  '^[-+]?0[boxBOX_0-9a-fA-F]+$', //                  octal, hex, binary
  '^[-+]?(?:[0-9][0-9_]*)?\\.[0-9_]*(?:[eE][-+]?[0-9]+)?$', // float
  '^[-+]?\\.(?:inf|Inf|INF|nan|NaN|NAN)$', //        infinities and NaN
  '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}' //               timestamp
].join('|'))

/**
 * @typedef {{ order: string[], children: Record<string, KeyOrder> }} KeyOrder
 */

/**
 * @param {Record<string, unknown>} obj
 * @param {{ header?: string[], keyOrder?: KeyOrder|null }} [opts]
 * @returns {string} YAML text, newline-terminated.
 */
export function toYaml (obj, opts = {}) {
  const head = (opts.header ?? []).map(l => (l ? `# ${l}` : '#')).join('\n')
  const body = emitMapping(obj, 0, opts.keyOrder ?? null)
  return (head ? head + '\n\n' : '') + body
}

/**
 * Read the key order out of the schema, at every depth.
 *
 * Determinism alone would be satisfied by sorting alphabetically, and the file would be correct and
 * unreadable — `also_test` above `machines`, `accent` above `preset`. Schema order is the order a
 * person wrote the questions in, so a recipe we emit reads like a recipe a person wrote. The
 * configurator panel is the most persuasive object on the site (§6D); an alphabetised one is not.
 *
 * @param {any} schema a JSON Schema node
 * @param {number} [depth]
 * @returns {KeyOrder|null}
 */
export function keyOrderFromSchema (schema, depth = 0) {
  if (!schema || typeof schema !== 'object' || depth > 8) return null
  const props = schema.properties
  if (!props) {
    // Walk through the wrappers the schema uses around object shapes.
    for (const key of ['items', 'then', 'else']) {
      const sub = keyOrderFromSchema(schema[key], depth + 1)
      if (sub) return sub
    }
    return null
  }
  /** @type {KeyOrder} */
  const node = { order: Object.keys(props), children: {} }
  for (const [name, sub] of Object.entries(props)) {
    const child = keyOrderFromSchema(sub, depth + 1)
    if (child) node.children[name] = child
  }
  return node
}

/**
 * @param {Record<string, unknown>} obj
 * @param {number} indent
 * @param {KeyOrder|null} ord
 */
function emitMapping (obj, indent, ord) {
  const pad = ' '.repeat(indent)
  const keys = orderKeys(Object.keys(obj), ord?.order)
  let out = ''
  for (const key of keys) {
    const value = obj[key]
    if (value === undefined) continue
    const child = ord?.children?.[key] ?? null
    const k = PLAIN_KEY.test(key) && !AMBIGUOUS.test(key) ? key : quote(key)
    if (isMap(value)) {
      out += Object.keys(value).length === 0 ? `${pad}${k}: {}\n` : `${pad}${k}:\n${emitMapping(value, indent + 2, child)}`
    } else if (Array.isArray(value)) {
      out += value.length === 0 ? `${pad}${k}: []\n` : `${pad}${k}:\n${emitSequence(value, indent + 2, child)}`
    } else if (typeof value === 'string' && value.includes('\n')) {
      out += `${pad}${k}: ${emitBlock(value, indent + 2)}`
    } else {
      out += `${pad}${k}: ${emitScalar(value)}\n`
    }
  }
  return out
}

/** @param {unknown[]} items @param {number} indent @param {KeyOrder|null} ord */
function emitSequence (items, indent, ord) {
  const pad = ' '.repeat(indent)
  let out = ''
  for (const item of items) {
    if (isMap(item)) {
      out += `${pad}-\n${emitMapping(item, indent + 2, ord)}`
    } else if (Array.isArray(item)) {
      out += `${pad}-\n${emitSequence(item, indent + 2, ord)}`
    } else if (typeof item === 'string' && item.includes('\n')) {
      out += `${pad}- ${emitBlock(item, indent + 2)}`
    } else {
      out += `${pad}- ${emitScalar(item)}\n`
    }
  }
  return out
}

/** @param {unknown} v */
function emitScalar (v) {
  if (v === null) return 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new TypeError('a recipe cannot contain a non-finite number')
    return String(v)
  }
  if (typeof v !== 'string') throw new TypeError(`cannot write ${typeof v} into YAML`)
  if (v === '') return "''"
  if (AMBIGUOUS.test(v) || NEEDS_QUOTING.test(v)) return quote(v)
  return v
}

/**
 * Multi-line prose becomes a literal block, which preserves it byte for byte. If any line would make
 * the block ambiguous — leading whitespace, trailing whitespace, a control character — we fall back to
 * a double-quoted scalar, which is uglier and always exact. Exact beats pretty in a file that is an
 * operating system.
 * @param {string} v @param {number} indent
 */
function emitBlock (v, indent) {
  const pad = ' '.repeat(indent)
  const lines = v.split('\n')
  const trailingNewline = lines.length > 1 && lines[lines.length - 1] === ''
  const content = trailingNewline ? lines.slice(0, -1) : lines
  const CONTROL = new RegExp('[\\u0000-\\u0008\\u000b-\\u001f\\u007f-\\u009f]')
  const unsafe = v.endsWith('\n\n') || content.length === 0 ||
    content.some(l => /^\s/.test(l) || /\s$/.test(l) || CONTROL.test(l))
  if (unsafe) return `${quote(v)}\n`
  const chomp = trailingNewline ? '|' : '|-'
  return `${chomp}\n` + content.map(l => (l === '' ? '' : pad + l)).join('\n') + '\n'
}

/** JSON's string escaping is a strict subset of YAML's double-quoted style, so this is exact. */
function quote (s) { return JSON.stringify(s) }

/** @param {unknown} v @returns {v is Record<string, unknown>} */
function isMap (v) { return typeof v === 'object' && v !== null && !Array.isArray(v) }

/** Schema order first, then anything unexpected, alphabetically. Same recipe in, same bytes out. */
function orderKeys (keys, keyOrder) {
  if (!keyOrder) return [...keys].sort((a, b) => a.localeCompare(b))
  const rank = new Map(keyOrder.map((k, i) => [k, i]))
  return [...keys].sort((a, b) => {
    const ra = rank.has(a) ? rank.get(a) : Number.MAX_SAFE_INTEGER
    const rb = rank.has(b) ? rank.get(b) : Number.MAX_SAFE_INTEGER
    return ra === rb ? a.localeCompare(b) : ra - rb
  })
}
