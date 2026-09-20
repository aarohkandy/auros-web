/**
 * Stripe: the fixed prices, the mechanism, and the guard that keeps it wired to nothing.
 *
 * The price tests are not testing arithmetic. Prices are §9-reserved — they belong to the human, not to
 * anybody working on this code — so these assertions exist to make an edit to them show up as a red
 * test with the spec quoted next to it, rather than as a diff that looks like a number.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { TIERS, TRIAL_PERIOD_DAYS, checkoutParams, callStripe, billNow, releaseNow, tierFor } from '../lib/stripe.js'

const OFF = { secretKey: 'sk_test_should_never_be_used', live: false }
const neverCalled = () => { throw new Error('a Stripe request was made while STRIPE_LIVE_ENABLED was off') }

describe('the prices are the ones in the spec (§6D, reserved by §9)', () => {
  test('one machine is $79, one time', () => {
    assert.equal(TIERS['one-machine'].unitAmount, 7900)
    assert.equal(TIERS['one-machine'].mode, 'payment')
    assert.equal(TIERS['one-machine'].minimumQuantity, 1)
  })
  test('school and nonprofit is $15 per device per year, 25 minimum', () => {
    assert.equal(TIERS.school.unitAmount, 1500)
    assert.equal(TIERS.school.interval, 'year')
    assert.equal(TIERS.school.minimumQuantity, 25)
  })
  test('business fleet is $12 per device per month, 10 minimum', () => {
    assert.equal(TIERS.business.unitAmount, 1200)
    assert.equal(TIERS.business.interval, 'month')
    assert.equal(TIERS.business.minimumQuantity, 10)
  })
  test('single-purpose is $19 per device per month, 5 minimum', () => {
    assert.equal(TIERS['single-purpose'].unitAmount, 1900)
    assert.equal(TIERS['single-purpose'].interval, 'month')
    assert.equal(TIERS['single-purpose'].minimumQuantity, 5)
  })
  test('self-serve is $0, because the recipes are public', () => {
    assert.equal(TIERS['self-serve'].unitAmount, 0)
  })
})

describe('the floors hold', () => {
  test('a school order below 25 devices is refused with the reason said plainly', () => {
    const r = tierFor('school', 12)
    assert.equal(r.ok, false)
    assert.match(r.reason, /starts at 25 devices/)
  })
  test('a tier that does not exist is refused', () => {
    assert.equal(tierFor('enterprise-platinum', 100).ok, false)
  })
  test('the floor is expressed twice, so it cannot be edited down on Stripe\'s own page', () => {
    const p = checkoutParams({ tier: TIERS.school, devices: 40, recipeName: 'x', successUrl: 'https://a/', cancelUrl: 'https://b/' })
    assert.equal(p['line_items[0][quantity]'], '40')
    assert.equal(p['line_items[0][adjustable_quantity][minimum]'], '25')
  })
  test('a quantity below the floor is raised to it rather than accepted', () => {
    const p = checkoutParams({ tier: TIERS.school, devices: 3, recipeName: 'x', successUrl: 'https://a/', cancelUrl: 'https://b/' })
    assert.equal(p['line_items[0][quantity]'], '25')
  })
})

describe('the mechanism (PLAN.md §3.8, DECISION-SHEET B15)', () => {
  test('a subscription uses a trial covering the build window, and $0 is charged at checkout', () => {
    const p = checkoutParams({ tier: TIERS.school, devices: 40, recipeName: 'x', successUrl: 'https://a/', cancelUrl: 'https://b/' })
    assert.equal(p.mode, 'subscription')
    assert.equal(p['subscription_data[trial_period_days]'], String(TRIAL_PERIOD_DAYS))
    assert.ok(TRIAL_PERIOD_DAYS >= 7, 'the trial has to outlast a build, a hardware surprise and a weekend')
  })

  test('a subscription never asks for manual capture, because that mode does not exist there', () => {
    const p = checkoutParams({ tier: TIERS.business, devices: 30, recipeName: 'x', successUrl: 'https://a/', cancelUrl: 'https://b/' })
    assert.equal(p['payment_intent_data[capture_method]'], undefined, 'capture_method lives under payment_intent_data, which is payment-mode only — asking for it here is the bug B15 records')
  })

  test('an unfinished trial cancels rather than quietly becoming a subscription', () => {
    const p = checkoutParams({ tier: TIERS.school, devices: 25, recipeName: 'x', successUrl: 'https://a/', cancelUrl: 'https://b/' })
    assert.equal(p['subscription_data[trial_settings][end_behavior][missing_payment_method]'], 'cancel')
  })

  test('the $79 one-time tier keeps payment mode with manual capture', () => {
    const p = checkoutParams({ tier: TIERS['one-machine'], devices: 1, recipeName: 'x', successUrl: 'https://a/', cancelUrl: 'https://b/' })
    assert.equal(p.mode, 'payment')
    assert.equal(p['payment_intent_data[capture_method]'], 'manual')
    assert.equal(p['subscription_data[trial_period_days]'], undefined)
  })

  test('the recipe name travels on the metadata, which is how the webhook finds the order again', () => {
    const p = checkoutParams({ tier: TIERS.school, devices: 25, recipeName: 'hopelink', successUrl: 'https://a/', cancelUrl: 'https://b/' })
    assert.equal(p['metadata[recipe]'], 'hopelink')
    assert.equal(p['subscription_data[metadata][recipe]'], 'hopelink')
  })

  test('billing a subscription ends the trial now, with no proration fragment', async () => {
    const r = await billNow(OFF, { mode: 'subscription', subscriptionId: 'sub_123' }, 'k')
    assert.equal(r.live, false)
    assert.equal(r.planned.path, '/subscriptions/sub_123')
    assert.deepEqual(r.planned.params, { trial_end: 'now', proration_behavior: 'none' })
  })

  test('billing a one-time order captures the authorisation', async () => {
    const r = await billNow(OFF, { mode: 'payment', paymentIntentId: 'pi_123' }, 'k')
    assert.equal(r.planned.path, '/payment_intents/pi_123/capture')
  })

  test('a failing build cancels, and there is no refund call anywhere because nothing was captured', async () => {
    const sub = await releaseNow(OFF, { mode: 'subscription', subscriptionId: 'sub_123' }, 'k')
    assert.equal(sub.planned.method, 'DELETE')
    const pay = await releaseNow(OFF, { mode: 'payment', paymentIntentId: 'pi_123' }, 'k')
    assert.equal(pay.planned.path, '/payment_intents/pi_123/cancel')
    assert.ok(!JSON.stringify([sub, pay]).includes('refund'), 'a refund path would mean something had been captured, which would mean the ordering was wrong')
  })
})

describe('the live guard (§9: anything touching a real card is the human\'s decision)', () => {
  test('with the switch off, nothing is sent and the intended call is returned instead', async () => {
    const r = await callStripe({ ...OFF, fetchImpl: neverCalled }, 'POST', '/checkout/sessions', { mode: 'payment' })
    assert.equal(r.live, false)
    assert.deepEqual(r.planned, { method: 'POST', path: '/checkout/sessions', params: { mode: 'payment' } })
    assert.match(r.note, /§9/)
  })

  test('with the switch on but no key, it throws rather than silently skipping', async () => {
    await assert.rejects(
      () => callStripe({ secretKey: undefined, live: true }, 'POST', '/checkout/sessions', {}),
      /STRIPE_SECRET_KEY is unset/
    )
  })

  test('with the switch on and a key, the request carries an idempotency key', async () => {
    let seen = null
    await callStripe({
      secretKey: 'sk_test_x',
      live: true,
      fetchImpl: async (_u, init) => { seen = init; return { ok: true, json: async () => ({ id: 'cs_1' }) } }
    }, 'POST', '/checkout/sessions', { mode: 'payment' }, { idempotencyKey: 'order:hopelink' })
    assert.equal(seen.headers['idempotency-key'], 'order:hopelink')
    assert.equal(seen.body, 'mode=payment')
  })

  test('a subscription with no subscription id cannot be billed', async () => {
    await assert.rejects(() => billNow(OFF, { mode: 'subscription' }, 'k'), /cannot be billed/)
  })
})
