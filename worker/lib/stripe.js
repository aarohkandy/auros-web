/**
 * Stripe. Built completely; wired to nothing.
 *
 * Spec §9 reserves "anything touching… a real card" for the human, and prohibition §4.6 says the same
 * thing again with "without explicit human approval in that session". So this module is written as if
 * it were live and then held behind one switch, `STRIPE_LIVE_ENABLED`, which is `"false"` in
 * `wrangler.jsonc` and which nothing in this codebase sets to anything else.
 *
 * The guard is not a comment or a convention. `callStripe()` is the only function that reaches the
 * network, and when the switch is off it returns `{ live: false, planned: {...} }` describing the call
 * it would have made — the method, the path, the parameters. Every caller handles that shape. The
 * result is that the whole order flow runs end to end, the PR opens, the build runs, `/build-result`
 * decides correctly whether to bill or cancel, and a reviewer can read the exact request that would
 * have been sent to Stripe without a card existing anywhere.
 *
 * ── The mechanism, and why it is not the obvious one (PLAN.md §3.8, DECISION-SHEET B15) ──
 *
 * §6D requires the card be charged only after the test build passes. The obvious mechanism is Checkout
 * with `capture_method: manual`, authorise now and capture later. That does not work for us:
 * `capture_method` lives under `payment_intent_data`, which exists in **payment mode only**, so it
 * cannot hold a per-device annual subscription. It also expires — an authorisation lives 4d18h to 7
 * days, and a build that needs a hardware decision can outlast that.
 *
 * So subscriptions use `subscription_data.trial_period_days` covering the build window. The card is
 * collected and SCA-authenticated at checkout and **$0 is charged**. On a passing build we end the
 * trial early and it bills. On a failing build we cancel, and because nothing was ever captured there
 * is nothing to refund.
 *
 * The $79 one-time tier stays in payment mode with manual capture, which is precisely what that mode is
 * for — with the authorisation window as a real deadline, not a footnote.
 *
 * That ordering — collect, verify, only then take — is the same ordering as the installer's: the
 * archive is verified before the disk is touched. The company's two riskiest operations share a shape.
 */

const STRIPE_API = 'https://api.stripe.com/v1'

/**
 * Prices are §9-reserved and fixed by spec §6D. They are here as integer cents so nothing rounds, and
 * this object is asserted against the spec in the tests. Changing a number here is a change to the
 * spec, which is a decision for the human, not an edit.
 *
 * @typedef {object} Tier
 * @property {string} id
 * @property {'payment'|'subscription'} mode
 * @property {number} unitAmount        cents
 * @property {'one_time'|'year'|'month'} interval
 * @property {number} minimumQuantity
 * @property {string} label
 */

/** @type {Record<string, Tier>} */
export const TIERS = {
  'one-machine': { id: 'one-machine', mode: 'payment', unitAmount: 7900, interval: 'one_time', minimumQuantity: 1, label: 'One machine, one payment' },
  school: { id: 'school', mode: 'subscription', unitAmount: 1500, interval: 'year', minimumQuantity: 25, label: 'School or nonprofit, per device per year' },
  business: { id: 'business', mode: 'subscription', unitAmount: 1200, interval: 'month', minimumQuantity: 10, label: 'Business fleet, per device per month' },
  'single-purpose': { id: 'single-purpose', mode: 'subscription', unitAmount: 1900, interval: 'month', minimumQuantity: 5, label: 'Single-purpose machines, per device per month' },
  'self-serve': { id: 'self-serve', mode: 'payment', unitAmount: 0, interval: 'one_time', minimumQuantity: 1, label: 'Self-serve — the recipes are public and you build it yourself' }
}

/**
 * How long the trial has to cover. It has to outlast a build, a hardware surprise, and a weekend.
 * The build itself is minutes; the thing that takes days is a human looking at a check that failed.
 */
export const TRIAL_PERIOD_DAYS = 14

export class StripeError extends Error {
  constructor (message, status, body) { super(message); this.name = 'StripeError'; this.status = status; this.body = body }
}

/**
 * @typedef {object} StripeConfig
 * @property {string|undefined} secretKey
 * @property {boolean} live               STRIPE_LIVE_ENABLED === 'true'
 * @property {typeof fetch} [fetchImpl]
 */

/**
 * @typedef {{ live: true, body: any } | { live: false, planned: { method: string, path: string, params: Record<string,string> }, note: string }} StripeCall
 */

/**
 * The single point at which this module would touch money. There is exactly one, so there is exactly
 * one place to audit.
 *
 * @param {StripeConfig} cfg
 * @param {string} method
 * @param {string} path
 * @param {Record<string, string>} params
 * @param {{ idempotencyKey?: string }} [opts]
 * @returns {Promise<StripeCall>}
 */
export async function callStripe (cfg, method, path, params, opts = {}) {
  if (!cfg.live) {
    return {
      live: false,
      planned: { method, path, params },
      note: 'STRIPE_LIVE_ENABLED is not "true". Nothing was sent to Stripe and no card was touched. ' +
            'Spec §9 reserves anything touching a real card for the human; this is that reservation, ' +
            'enforced in code rather than remembered.'
    }
  }
  if (!cfg.secretKey) throw new StripeError('STRIPE_LIVE_ENABLED is "true" but STRIPE_SECRET_KEY is unset', 503)
  const fetchImpl = cfg.fetchImpl ?? fetch
  const res = await fetchImpl(`${STRIPE_API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${cfg.secretKey}`,
      'content-type': 'application/x-www-form-urlencoded',
      'stripe-version': '2026-08-27.basil',
      ...(opts.idempotencyKey ? { 'idempotency-key': opts.idempotencyKey } : {})
    },
    body: method === 'GET' ? undefined : new URLSearchParams(params).toString()
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new StripeError(body?.error?.message ?? `Stripe returned HTTP ${res.status}`, res.status, body)
  return { live: true, body }
}

/**
 * Build the Checkout Session parameters for a tier.
 *
 * Exported separately from the call that sends them so the tests can assert the *shape* — that a
 * subscription carries a trial and never `capture_method`, that a one-time payment carries manual
 * capture, that the per-device floor is expressed twice (as the starting `quantity` and as
 * `adjustable_quantity.minimum`) so a customer cannot edit it below the minimum on the Stripe page.
 *
 * @param {object} args
 * @param {Tier} args.tier
 * @param {number} args.devices
 * @param {string} args.recipeName
 * @param {string} args.successUrl
 * @param {string} args.cancelUrl
 * @param {string} [args.customerEmail]
 * @param {string} [args.priceId]   a Stripe Price id if one exists; otherwise price_data inline
 */
export function checkoutParams ({ tier, devices, recipeName, successUrl, cancelUrl, customerEmail, priceId }) {
  const quantity = Math.max(tier.minimumQuantity, Math.floor(devices) || tier.minimumQuantity)
  /** @type {Record<string,string>} */
  const p = {
    mode: tier.mode,
    success_url: successUrl,
    cancel_url: cancelUrl,
    'line_items[0][quantity]': String(quantity),
    'metadata[recipe]': recipeName,
    'metadata[tier]': tier.id,
    'metadata[devices]': String(quantity)
  }
  if (customerEmail) p.customer_email = customerEmail

  if (priceId) {
    p['line_items[0][price]'] = priceId
  } else {
    p['line_items[0][price_data][currency]'] = 'usd'
    p['line_items[0][price_data][unit_amount]'] = String(tier.unitAmount)
    p['line_items[0][price_data][product_data][name]'] = tier.label
    if (tier.mode === 'subscription') {
      p['line_items[0][price_data][recurring][interval]'] = tier.interval === 'year' ? 'year' : 'month'
    }
  }

  if (tier.minimumQuantity > 1) {
    // The floor, said twice. `quantity` is where it starts; `adjustable_quantity.minimum` is what stops
    // the customer editing it to 1 on Stripe's own page, which they can otherwise do.
    p['line_items[0][adjustable_quantity][enabled]'] = 'true'
    p['line_items[0][adjustable_quantity][minimum]'] = String(tier.minimumQuantity)
    p['line_items[0][adjustable_quantity][maximum]'] = '5000'
  }

  if (tier.mode === 'subscription') {
    // The mechanism. The card is collected and SCA-authenticated here, and $0 moves.
    p['subscription_data[trial_period_days]'] = String(TRIAL_PERIOD_DAYS)
    p['subscription_data[metadata][recipe]'] = recipeName
    // If the customer never finishes, the trial must not silently turn into a subscription.
    p['subscription_data[trial_settings][end_behavior][missing_payment_method]'] = 'cancel'
    p.payment_method_collection = 'always'
  } else {
    // Payment mode is the only mode where manual capture exists at all. The authorisation window is
    // 4d18h (Visa MIT) to 7 days — capture inside it or the PaymentIntent cancels itself.
    p['payment_intent_data[capture_method]'] = 'manual'
    p['payment_intent_data[metadata][recipe]'] = recipeName
  }
  return p
}

/** @param {StripeConfig} cfg @param {ReturnType<typeof checkoutParams>} params @param {string} idempotencyKey */
export function createCheckoutSession (cfg, params, idempotencyKey) {
  return callStripe(cfg, 'POST', '/checkout/sessions', params, { idempotencyKey })
}

/**
 * The build passed. Bill.
 *
 * A subscription bills by ending the trial now, with `proration_behavior=none` so the customer is
 * charged one clean period rather than a prorated fragment. A payment-mode order bills by capturing
 * the authorisation that has been sitting there since checkout.
 *
 * @param {StripeConfig} cfg
 * @param {{ mode: 'payment'|'subscription', subscriptionId?: string, paymentIntentId?: string }} order
 * @param {string} idempotencyKey
 */
export function billNow (cfg, order, idempotencyKey) {
  if (order.mode === 'subscription') {
    if (!order.subscriptionId) throw new StripeError('a subscription order with no subscription id cannot be billed', 400)
    return callStripe(cfg, 'POST', `/subscriptions/${order.subscriptionId}`, { trial_end: 'now', proration_behavior: 'none' }, { idempotencyKey })
  }
  if (!order.paymentIntentId) throw new StripeError('a payment order with no payment intent cannot be captured', 400)
  return callStripe(cfg, 'POST', `/payment_intents/${order.paymentIntentId}/capture`, {}, { idempotencyKey })
}

/**
 * The build failed. Release.
 *
 * There is no refund path in this module and there is not supposed to be one: on a subscription $0 was
 * ever charged, and on a payment-mode order the authorisation was never captured. Cancelling releases
 * the hold. The customer sees a pending authorisation disappear, which is the whole point of doing it
 * in this order.
 *
 * @param {StripeConfig} cfg
 * @param {{ mode: 'payment'|'subscription', subscriptionId?: string, paymentIntentId?: string }} order
 * @param {string} idempotencyKey
 */
export function releaseNow (cfg, order, idempotencyKey) {
  if (order.mode === 'subscription') {
    if (!order.subscriptionId) throw new StripeError('a subscription order with no subscription id cannot be cancelled', 400)
    return callStripe(cfg, 'DELETE', `/subscriptions/${order.subscriptionId}`, {}, { idempotencyKey })
  }
  if (!order.paymentIntentId) throw new StripeError('a payment order with no payment intent cannot be cancelled', 400)
  return callStripe(cfg, 'POST', `/payment_intents/${order.paymentIntentId}/cancel`, { cancellation_reason: 'abandoned' }, { idempotencyKey })
}

/**
 * Which tier a device count falls into, for the tiers whose price is per device.
 * The caller chooses the tier; this only checks the floor is respected.
 * @param {string} tierId @param {number} devices
 */
export function tierFor (tierId, devices) {
  const tier = TIERS[tierId]
  if (!tier) return { ok: /** @type {const} */ (false), reason: `there is no "${tierId}" tier` }
  if (devices < tier.minimumQuantity) {
    return { ok: /** @type {const} */ (false), reason: `the ${tier.label} tier starts at ${tier.minimumQuantity} devices and this order is for ${devices}` }
  }
  return { ok: /** @type {const} */ (true), tier }
}
