/**
 * The pull request body.
 *
 * This text goes into a public repository and the customer reads it, so the tests are about honesty
 * rather than formatting: no number we have not measured, no compatibility claim, and the things a
 * customer will be most upset to discover in month two said in the body rather than in a footnote.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { explain } from '../lib/explain.js'

const REAL = JSON.parse(readFileSync(new URL('./fixtures-real-recipes.json', import.meta.url), 'utf8'))

describe('no number we have not measured', () => {
  test('without a removal report, no removal count is stated', () => {
    const text = explain(REAL['example-kiosk'])
    assert.match(text, /not in this file, because nothing has counted it yet/)
    assert.ok(!/removed \*\*\d+ packages\*\*/.test(text), 'a count appeared without a build having produced one')
  })

  test('the floor the customer set is described as a floor, not as a result', () => {
    const text = explain(REAL['example-kiosk'])
    assert.match(text, /at least 1100 packages/)
    assert.match(text, /that is a floor you set, not a result/)
  })

  test('with a real removal report, the number is stated and its source is named', () => {
    const text = explain(REAL['example-kiosk'], { removalReport: { removed: 1187, source: 'removal-report.json' } })
    assert.match(text, /removed \*\*1187 packages\*\*/)
    assert.match(text, /removal-report\.json/)
  })
})

describe('what does not come across is in the body, not in a footnote', () => {
  for (const name of Object.keys(REAL)) {
    test(`${name}: Office and Adobe are named explicitly (D16)`, () => {
      const text = explain(REAL[name])
      assert.match(text, /Microsoft Office and the Adobe applications do not come across/)
    })

    test(`${name}: Chrome and Edge passwords are stated as not movable by anyone (D15)`, () => {
      const text = explain(REAL[name])
      assert.match(text, /nobody can move them, including us/)
    })

    test(`${name}: there is no blanket compatibility claim`, () => {
      const text = explain(REAL[name])
      assert.ok(!/runs? (all|any|every) (windows )?(apps?|programs?)/i.test(text))
    })
  }

  test('with the compatibility layer on, the text says the layer does not make programs work', () => {
    const text = explain(REAL['example-school']) // this recipe enables windows_apps
    assert.match(text, /It does not make your programs work/)
  })

  test('tested programs are reported with the day somebody tried them, including the failures', () => {
    const text = explain(REAL['example-school'])
    assert.match(text, /\| Tally\.ERP \| 2026-09-11 \| fails \|/)
  })
})

describe('the payment ordering is stated the way it actually works', () => {
  test('nothing charged at order time, billed on a pass, nothing to refund on a fail', () => {
    const text = explain(REAL['example-kiosk'])
    assert.match(text, /\*\*nothing was charged\*\*/)
    assert.match(text, /billed when the test build passes/)
    assert.match(text, /nothing was ever taken, so there is nothing to refund/)
  })

  test('merging is described as starting a test build, not as shipping to laptops', () => {
    const text = explain(REAL['example-kiosk'])
    assert.match(text, /Merging it does not put anything on a laptop/)
  })
})

describe('it reads as this recipe and not a template', () => {
  test('the kiosk explains that the shell is absent rather than hidden', () => {
    const text = explain(REAL['example-kiosk'])
    assert.match(text, /There is no desktop/)
    assert.match(text, /they are not in the image/)
  })

  test('every application that stays is named', () => {
    const text = explain(REAL['example-school'])
    for (const app of REAL['example-school'].apps) assert.match(text, new RegExp(`- ${app.replace(/[+]/g, '\\+')}$`, 'm'))
  })

  test('the output is deterministic — the same recipe gives the same text', () => {
    assert.equal(explain(REAL['example-school']), explain(REAL['example-school']))
  })

  test('it says which explain wins where the two disagree', () => {
    assert.match(explain(REAL['example-kiosk']), /where the two differ, the build is right/)
  })
})
