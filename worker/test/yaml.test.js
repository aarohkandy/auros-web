/**
 * The YAML emitter.
 *
 * The threat model is narrow and worth stating: the Worker accepts JSON and writes YAML into a public
 * repository under our name. A visitor cannot inject YAML *structure* — anchors, tags, a second
 * document, a key smuggled through an unquoted newline — because nothing they send is ever treated as
 * YAML text. What they can still do is get a string written in a form a reader resolves as something
 * other than a string, and these tests are about that.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { toYaml, keyOrderFromSchema } from '../lib/yaml.js'
import { schema } from '../lib/recipe.js'

const REAL = JSON.parse(readFileSync(new URL('./fixtures-real-recipes.json', import.meta.url), 'utf8'))
const ORDER = keyOrderFromSchema(schema)

describe('values that must not change meaning on the way out', () => {
  test('a time is quoted, because YAML 1.1 reads 10:30 as the number 630', () => {
    const out = toYaml({ restart_daily_at: '10:30' })
    assert.match(out, /restart_daily_at: "10:30"/)
  })

  test('a date is quoted rather than becoming a timestamp', () => {
    assert.match(toYaml({ date: '2026-09-17' }), /date: "2026-09-17"/)
  })

  test('a string of digits stays a string', () => {
    assert.match(toYaml({ code: '0042' }), /code: "0042"/)
  })

  test('the words that are secretly booleans are quoted', () => {
    for (const word of ['no', 'No', 'yes', 'on', 'off', 'y', 'n', 'null', '~', 'true']) {
      assert.match(toYaml({ language: word }), new RegExp(`language: "${word.replace('~', '~')}"`), `"${word}" must be quoted — a Norwegian locale abbreviated "no" is the classic version of this bug`)
    }
  })

  test('an empty string is written as an empty string, not as null', () => {
    assert.match(toYaml({ note: '' }), /note: ''/)
  })

  test('leading and trailing space survives', () => {
    const out = toYaml({ label: ' spaced ' })
    assert.match(out, /label: " spaced "/)
  })
})

describe('nothing a visitor types becomes structure', () => {
  const attacks = {
    'a newline that would open a new key': 'Front desk\nadmin_override: true',
    'a comment that would swallow the rest of the line': 'Front desk # policy: open',
    'an anchor': '&evil anchor',
    'an alias': '*evil',
    'a tag': '!!python/object/apply:os.system',
    'a document separator': '---\npolicy: open',
    'a flow mapping': '{policy: open}',
    'a colon-space pair': 'key: value'
  }

  for (const [description, value] of Object.entries(attacks)) {
    test(`${description} is written as a value and nothing else`, () => {
      const out = toYaml({ display_name: value, policy: 'kiosk' })
      const lines = out.trimEnd().split('\n')
      // Either it is quoted onto one line, or it is a properly indented literal block. Either way the
      // only top-level keys in the output are the two we put there.
      const topLevel = lines.filter(l => /^[A-Za-z_"]/.test(l)).map(l => l.split(':')[0].replace(/"/g, ''))
      assert.deepEqual(topLevel.sort(), ['display_name', 'policy'], `"${value}" produced extra top-level keys: ${out}`)
    })
  }

  test('a key that is not a plain identifier is quoted', () => {
    const out = toYaml({ 'policy: open\nx': 1 })
    assert.match(out, /^"policy: open\\nx": 1/m)
  })
})

describe('the file reads like a file a person wrote', () => {
  for (const name of Object.keys(REAL)) {
    test(`${name} survives a round trip through the emitter unchanged in meaning`, () => {
      const out = toYaml(REAL[name], { keyOrder: ORDER })
      // Structural round-tripping is asserted by the Python check in CI, which has a real YAML parser.
      // Here we assert the properties we can: every key present, nothing extra, and schema order kept.
      for (const key of Object.keys(REAL[name])) {
        assert.match(out, new RegExp(`^${key}:`, 'm'), `${key} is missing from the emitted file`)
      }
      const emittedTopKeys = out.split('\n').filter(l => /^[a-z_]+:/.test(l)).map(l => l.split(':')[0])
      const schemaOrder = Object.keys(schema.properties)
      const expected = schemaOrder.filter(k => k in REAL[name])
      assert.deepEqual(emittedTopKeys, expected, 'top-level keys are not in schema order')
    })
  }

  test('prose becomes a literal block, so it stays exactly as written', () => {
    const out = toYaml({ for: 'One line.\nAnother line.\n' })
    assert.match(out, /for: \|\n {2}One line\.\n {2}Another line\.\n/)
  })

  test('prose with an indented line falls back to a quoted scalar rather than a wrong block', () => {
    const out = toYaml({ for: 'One line.\n  indented\n' })
    assert.match(out, /for: "One line/, 'an indented line inside a literal block changes its meaning; quoting is uglier and exact')
  })

  test('the same recipe always produces the same bytes', () => {
    const shuffled = Object.fromEntries(Object.entries(REAL['example-kiosk']).reverse())
    assert.equal(toYaml(REAL['example-kiosk'], { keyOrder: ORDER }), toYaml(shuffled, { keyOrder: ORDER }))
  })
})
