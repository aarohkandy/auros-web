#!/usr/bin/env node
// Re-record the vendored schema's rule hash after copying a new schema in from auros-recipes.
//   cp auros-recipes/schema/recipe.schema.json auros-web/worker/schema/
//   node auros-web/worker/test/record-schema-hash.mjs
// Deliberately a separate command rather than something the test does for you: a check that
// re-baselines itself is not a check.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { canonical } from '../lib/jsonschema.js'

const path = new URL('../schema/recipe.schema.json', import.meta.url)
const hash = createHash('sha256').update(canonical(JSON.parse(readFileSync(path, 'utf8')))).digest('hex')
writeFileSync(new URL('../schema/recipe.schema.sha256', import.meta.url), `${hash}  recipe.schema.json (canonical rule hash)\n`)
console.log(hash)
