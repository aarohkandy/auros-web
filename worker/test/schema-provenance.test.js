/**
 * The vendored schema must be the schema.
 *
 * The comparison is over the *canonical* form — a stable stringify with sorted keys — rather than over
 * the bytes. That is not laziness about whitespace. A byte comparison fails when somebody runs a JSON
 * formatter over `auros-recipes/schema/recipe.schema.json`, which is a change to nothing at all, and a
 * check that goes red for a reformat is a check people learn to re-baseline without reading. The thing
 * that must not drift is the set of rules, and canonical equality is exactly the set of rules.
 *
 * (This test earned its keep the first time it ran: the schema had been reformatted upstream while the
 * Worker was being written, and a byte check would have reported it as drift it was not.)
 *
 * Two assertions, catching two different accidents:
 *
 *  1. The vendored copy matches its recorded canonical hash — catches somebody editing the copy to
 *     make the site accept something, which would silently diverge the site's rules from CI's.
 *  2. The vendored copy matches `auros-recipes` when that repository is checked out beside this one —
 *     catches the schema moving on and the copy staying behind. It skips where the sibling repository
 *     is not present, which is auros-web's own standalone CI; (1) still runs everywhere.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { canonical } from '../lib/jsonschema.js'
import { schema as vendoredSchema } from '../lib/recipe.js'

const here = fileURLToPath(new URL('.', import.meta.url))
const recorded = readFileSync(`${here}../schema/recipe.schema.sha256`, 'utf8').trim().split(/\s+/)[0]
const sibling = `${here}../../../auros-recipes/schema/recipe.schema.json`

const ruleHash = (obj) => createHash('sha256').update(canonical(obj)).digest('hex')

test('the vendored schema still contains the rules it was recorded with', () => {
  assert.equal(
    ruleHash(vendoredSchema),
    recorded,
    'worker/schema/recipe.schema.json has been changed. It is a copy, not a source — change ' +
    'auros-recipes/schema/recipe.schema.json, copy it back, and update recipe.schema.sha256.'
  )
})

test('the vendored schema has the same rules as auros-recipes', { skip: existsSync(sibling) ? false : 'auros-recipes is not checked out beside auros-web' }, () => {
  const upstream = JSON.parse(readFileSync(sibling, 'utf8'))
  assert.equal(
    ruleHash(vendoredSchema),
    ruleHash(upstream),
    'The schema in auros-recipes has moved and the Worker\'s copy has not. Until they match, the site ' +
    'can render YAML that CI rejects — the exact failure docs/CONFIGURATOR.md constraint 1 is about. ' +
    'Run: cp auros-recipes/schema/recipe.schema.json auros-web/worker/schema/ && ' +
    'node worker/test/record-schema-hash.mjs'
  )
})
