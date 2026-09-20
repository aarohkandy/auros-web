/**
 * Server-side validation, and above all the REFUSALS.
 *
 * The ordinary tests here — that the three real recipes pass — are the easy half. The half that
 * matters is every way a recipe can try to stop being a recipe: naming a base, pinning a version,
 * running a script, adding a repository, dropping a file, skipping a check, carrying a password,
 * making a claim. Each of those is a thing somebody will genuinely ask for, politely, with a good
 * reason, and the answer is a schema with no word for it.
 *
 * Each refusal test asserts two things: that it is refused, and that the refusal comes back carrying
 * the schema's own argument for why. The second matters because the configurator renders that text to
 * the visitor (docs/CONFIGURATOR.md constraint 4), and a refusal with no argument attached is just an
 * error message.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateRecipe, presentRefusal } from '../lib/recipe.js'
import { compile, validate, SchemaUnsupportedError } from '../lib/jsonschema.js'

const REAL = JSON.parse(readFileSync(new URL('./fixtures-real-recipes.json', import.meta.url), 'utf8'))
const school = () => structuredClone(REAL['example-school'])
const kiosk = () => structuredClone(REAL['example-kiosk'])

/** @param {object} recipe */
function refusalOf (recipe) {
  const result = validateRecipe(recipe)
  assert.equal(result.ok, false, 'expected this recipe to be refused, and it was accepted')
  return presentRefusal(result.errors)
}

describe('the recipes that exist', () => {
  for (const name of Object.keys(REAL)) {
    test(`${name} validates against the same schema CI uses`, () => {
      const result = validateRecipe(REAL[name])
      assert.equal(result.ok, true, result.ok ? '' : JSON.stringify(result.errors, null, 2))
    })
  }
})

describe('refusals — a recipe may only ADD', () => {
  // Every one of these is a field somebody will ask for. The test is not that it errors; it is that
  // the reader is told why the absence is deliberate.
  const forbidden = [
    ['from', 'ghcr.io/someone/else:latest', /base image/i],
    ['base', 'ubuntu:24.04', /base image/i],
    ['image', 'ghcr.io/x/y', /base image/i],
    ['registry', 'ghcr.io', /base image/i],
    ['digest', 'sha256:aaaa', /base image/i],
    ['containerfile', 'FROM scratch', /base image/i],
    ['kernel', '6.9.1', /kernel/i],
    ['kernel_args', ['quiet'], /kernel/i],
    ['drivers', ['nvidia'], /kernel/i],
    ['firmware', ['iwlwifi'], /kernel/i],
    ['pin', { firefox: '129' }, /version/i],
    ['version', '1.2.3', /version/i],
    ['hold', ['kernel'], /version/i],
    ['exclude', ['plasma'], /version/i],
    ['run', 'curl https://example.com | sh', /run code/i],
    ['script', './setup.sh', /run code/i],
    ['post_install', ['echo hi'], /run code/i],
    ['hooks', { pre: 'x' }, /run code/i],
    ['repos', ['copr:someone/thing'], /software source/i],
    ['copr', 'someone/thing', /software source/i],
    ['nogpgcheck', true, /software source/i],
    ['files', { '/etc/x': 'y' }, /arbitrary files/i],
    ['overlay', 'overlay/', /arbitrary files/i],
    ['systemd_units', ['x.service'], /arbitrary files/i],
    ['skip_checks', true, /less testing/i],
    ['skip_tests', true, /less testing/i],
    ['force', true, /less testing/i],
    ['rollback', false, /safety net/i],
    ['disable_updates', true, /safety net/i],
    ['auto_update', false, /safety net/i]
  ]

  for (const [field, value, titlePattern] of forbidden) {
    test(`"${field}" is refused, with the schema's own argument attached`, () => {
      const presented = refusalOf({ ...school(), [field]: value })
      assert.equal(presented.refused, true)
      assert.match(presented.headline, titlePattern, `the refusal headline for "${field}" was: ${presented.headline}`)
      assert.ok(presented.why && presented.why.length > 40, `"${field}" was refused with no explanation, which is the one thing a refusal here may not do`)
      assert.ok(
        presented.problems.some(p => p.says.includes(field)),
        'the refusal should name the field that caused it'
      )
    })
  }

  test('a credential is refused, and the refusal says where credentials actually go', () => {
    const presented = refusalOf({ ...school(), password: 'hunter2' })
    assert.match(presented.headline, /credential/i)
    assert.match(presented.why, /public/i, 'the argument is that the repository is public — that is the reason, and it should be said')
  })

  test('a testimonial is refused, because the website renders what is in these files', () => {
    const presented = refusalOf({ ...school(), testimonial: 'Best OS ever — a real school' })
    assert.match(presented.headline, /general claim/i)
  })

  test('an unknown field is refused rather than ignored', () => {
    const presented = refusalOf({ ...school(), enable_telemetry: true })
    assert.equal(presented.refused, true)
    assert.ok(presented.problems.some(p => p.rule === 'additionalProperties' && p.says.includes('enable_telemetry')))
  })
})

describe('refusals — the rules that are about safety, not about scope', () => {
  test('a kiosk must carry its kiosk block', () => {
    const r = kiosk()
    delete r.kiosk
    const presented = refusalOf(r)
    assert.ok(presented.problems.some(p => p.says.includes('kiosk')))
  })

  test('a kiosk cannot also describe a desktop, because it has none', () => {
    const presented = refusalOf({ ...kiosk(), desktop: { taskbar_and_start_menu: true } })
    assert.equal(presented.refused, true)
  })

  test('a kiosk cannot run Windows programs', () => {
    const presented = refusalOf({ ...kiosk(), windows_apps: { enabled: true, we_promise_nothing_else: true } })
    assert.equal(presented.refused, true)
  })

  test('a terminal only exists on an open machine', () => {
    const r = school() // policy: managed
    r.desktop = { ...(r.desktop ?? {}), can_reach_a_terminal: true }
    const result = validateRecipe(r)
    assert.equal(result.ok, false, 'a managed machine with a terminal is a managed machine with a way out of being managed')
  })

  test('locked means locked — installing apps cannot be re-enabled under it', () => {
    const r = school()
    r.policy = 'locked'
    r.desktop = { ...(r.desktop ?? {}), can_install_apps: true }
    assert.equal(validateRecipe(r).ok, false)
  })

  test('accessibility cannot be pruned', () => {
    const r = school()
    r.prune = { ...r.prune, also_remove: ['screen reader'] }
    assert.equal(validateRecipe(r).ok, false)
  })

  test('keeping a normal desktop means saying what comes out of it', () => {
    const r = school()
    r.prune = { keep_only_the_apps_above: false, must_remove_at_least: 10 }
    assert.equal(validateRecipe(r).ok, false, 'keep_only=false with no also_remove is a recipe that removes nothing and calls itself Auros')
  })

  test('enabling the Windows layer requires the honest sentence', () => {
    const r = school()
    r.windows_apps = { enabled: true } // no we_promise_nothing_else
    assert.equal(validateRecipe(r).ok, false, 'D16: the compatibility layer cannot be switched on without the claim it is bounded by')
  })

  test('a positive compatibility result requires its caveats written down', () => {
    const r = school()
    r.windows_apps = {
      enabled: true,
      we_promise_nothing_else: true,
      tested: [{ app: 'Some ERP', date: '2026-09-01', result: 'works' }] // no note
    }
    assert.equal(validateRecipe(r).ok, false, 'D16: "works" with no caveats is how a blanket claim starts')
  })

  test('a compatibility claim cannot be made while the layer is off', () => {
    const r = school()
    r.windows_apps = { enabled: false, tested: [{ app: 'X', date: '2026-09-01', result: 'fails' }] }
    assert.equal(validateRecipe(r).ok, false)
  })
})

describe('refusals — the shape of the request itself', () => {
  test('a non-object is not a recipe', () => {
    for (const bad of [null, [], 'name: x', 42, true]) {
      assert.equal(validateRecipe(bad).ok, false)
    }
  })

  test('prototype-shaped keys are refused outright, at any depth', () => {
    const withProto = JSON.parse('{"schema":1,"organisation":{"__proto__":{"admin":true}}}')
    const result = validateRecipe(withProto)
    assert.equal(result.ok, false)
    assert.ok(result.errors.some(e => e.message.includes('__proto__')))
  })

  test('a schema version we do not recognise is refused rather than guessed at', () => {
    assert.equal(validateRecipe({ ...school(), schema: 2 }).ok, false)
  })

  test('a name that could be read as an image tag is refused', () => {
    for (const bad of ['Example', 'example_school', 'example.school', 'ghcr.io/x', 'a', 'x--y', '-x']) {
      assert.equal(validateRecipe({ ...school(), name: bad }).ok, false, `"${bad}" should be refused as a recipe name`)
    }
  })
})

describe('the evaluator fails closed', () => {
  test('an unimplemented keyword throws instead of being ignored', () => {
    assert.throws(
      () => compile({ type: 'object', unevaluatedProperties: false }),
      SchemaUnsupportedError,
      'a keyword the evaluator does not implement must stop the deploy, not become a rule nobody enforces'
    )
  })

  test('a remote $ref is refused', () => {
    assert.throws(() => compile({ $ref: 'https://example.com/schema.json' }), SchemaUnsupportedError)
  })

  test('an unbounded repeat of an unbounded repeat is refused', () => {
    assert.throws(() => compile({ type: 'string', pattern: '^(a+)+$' }), SchemaUnsupportedError)
  })

  test('but the patterns our own schema actually uses are accepted', () => {
    for (const p of ['^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$', '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$']) {
      assert.doesNotThrow(() => compile({ type: 'string', pattern: p }), `${p} is safe and must not be rejected`)
    }
  })

  test('an unknown format is refused, because an unasserted format is decoration', () => {
    assert.throws(() => compile({ type: 'string', format: 'email' }), SchemaUnsupportedError)
  })

  test('if/then applies the branch, and the if-errors are not reported', () => {
    const s = compile({
      type: 'object',
      properties: { kind: { const: 'kiosk' }, shell: { type: 'string' } },
      if: { properties: { kind: { const: 'kiosk' } }, required: ['kind'] },
      then: { not: { required: ['shell'] } }
    })
    assert.equal(validate(s, { kind: 'kiosk' }).valid, true)
    assert.equal(validate(s, { kind: 'kiosk', shell: 'bash' }).valid, false)
  })

  test('uniqueItems compares by value, not by reference', () => {
    const s = compile({ type: 'array', uniqueItems: true })
    assert.equal(validate(s, [{ a: 1 }, { a: 1 }]).valid, false)
    assert.equal(validate(s, [{ a: 1, b: 2 }, { b: 2, a: 1 }]).valid, false, 'key order must not make two identical objects look different')
  })

  test('string lengths count characters, not UTF-16 units', () => {
    const s = compile({ type: 'string', maxLength: 2 })
    assert.equal(validate(s, '🙂🙂').valid, true, 'two emoji are two characters; counting them as four would refuse a valid Marathi or emoji string')
  })
})
