/**
 * POST /build-result — CI says the test build passed or failed, and money moves.
 *
 * This is the endpoint that charges a card. An unauthenticated caller here could bill a customer for a
 * build that never ran, so it is authenticated with an HMAC over the exact request body, with the
 * timestamp inside the signed payload, and it is idempotent by run id. The three properties together:
 *
 *   - forged   → the signature does not match, and nothing happens
 *   - replayed → the timestamp is outside tolerance, or the run id was already claimed
 *   - retried  → the run id was already claimed, and the original outcome is returned unchanged
 *
 * The *last* one is not a security property, it is an operational one, and it matters just as much:
 * GitHub Actions retries steps, and a retried "pass" that bills twice is indistinguishable to the
 * customer from us being dishonest.
 *
 * On a pass we end the Stripe trial early so it bills. On a fail we cancel. There is no refund path
 * because there is never anything to refund — that is the entire reason for the ordering.
 */

import { refuse, json, readBounded, parseJson } from '../lib/http.js'
import { verifySignedPayload } from '../lib/signature.js'
import { getOrder, patchOrder, claimOnce } from '../lib/orders.js'
import { billNow, releaseNow, StripeError } from '../lib/stripe.js'

const MAX_BODY = 16 * 1024

/**
 * @param {Request} request
 * @param {Record<string, any>} env
 */
export async function handleBuildResult (request, env) {
  if (request.method !== 'POST') return refuse(405, 'anything but a POST', 'CI reports a result; it does not read one')
  if (!env.AUROS_KV) return refuse(503, 'this call', 'no KV binding, so this endpoint cannot tell a retry from a replay. It refuses rather than risk billing twice.')

  const body = await readBounded(request, MAX_BODY)
  if (!body.ok) return refuse(413, 'this call', body.reason)

  // Verify against the RAW text, before JSON.parse. A signature checked against re-serialised JSON is
  // a signature over a different document than the one that was signed, and the difference is exactly
  // where an attacker lives.
  const verified = await verifySignedPayload({
    secret: env.BUILD_RESULT_SECRET,
    header: request.headers.get('x-auros-signature'),
    body: body.text
  })
  if (!verified.ok) {
    return refuse(verified.status, 'this call', `${verified.reason}. This endpoint can charge a card, so an unauthenticated call does nothing at all.`)
  }

  const parsed = parseJson(body.text)
  if (!parsed.ok) return refuse(400, 'this call', parsed.reason)
  const { recipe, run_id: runId, run_url: runUrl, outcome, checks } = parsed.value ?? {}

  if (typeof recipe !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(recipe)) {
    return refuse(400, 'this call', 'a recipe name is required and must be the same shape the schema allows')
  }
  if (outcome !== 'pass' && outcome !== 'fail') {
    return refuse(400, 'this call', 'outcome must be exactly "pass" or "fail". There is no third value, and in particular there is no value meaning "passed except for".')
  }
  if (runId === undefined || runId === null) return refuse(400, 'this call', 'run_id is required — it is what makes this call idempotent')

  const order = await getOrder(env.AUROS_KV, recipe)
  if (!order) {
    return refuse(404, 'this call', `there is no order recorded for "${recipe}". Nothing was billed. If a build ran for a recipe nobody ordered through the site, that is a merge somebody made by hand and it needs a person, not a charge.`)
  }

  // The claim happens BEFORE the Stripe call, not after. If the Worker dies between claiming and
  // billing, the order is left unbilled and a human notices a missing charge. The other ordering
  // leaves it billed twice, and a human notices that from the customer.
  const claim = await claimOnce(env.AUROS_KV, `build-result:${recipe}:${runId}`, { outcome, at: new Date().toISOString() })
  if (!claim.first) {
    const before = claim.existing?.value?.outcome
    if (before !== outcome) {
      return refuse(409, 'this call', `run ${runId} already reported "${before}" for ${recipe} and is now reporting "${outcome}". A run has one outcome. Nothing was changed and a human should look at this.`, { previously: before })
    }
    return json({ ok: true, repeated: true, recipe, runId, outcome, note: 'Already handled. Nothing happened a second time.' })
  }

  const stripeCfg = { secretKey: env.STRIPE_SECRET_KEY, live: env.STRIPE_LIVE_ENABLED === 'true' }
  const settlement = { mode: order.mode, subscriptionId: order.subscriptionId ?? undefined, paymentIntentId: order.paymentIntentId ?? undefined }
  const idempotencyKey = `build-result:${recipe}:${runId}:${outcome}`

  if (!order.subscriptionId && !order.paymentIntentId) {
    // The customer never completed checkout, so there is nothing to bill or cancel. A build ran for a
    // recipe nobody paid for, which is a fact worth recording and not an error worth a 500.
    await patchOrder(env.AUROS_KV, recipe, { settledAt: new Date().toISOString(), settledBecause: `build ${outcome}, but no card was ever collected` })
    return json({ ok: true, recipe, runId, outcome, billed: false, note: 'No card was collected for this order, so nothing was billed and nothing needed releasing.' })
  }

  let stripeResult
  try {
    stripeResult = outcome === 'pass'
      ? await billNow(stripeCfg, settlement, idempotencyKey)
      : await releaseNow(stripeCfg, settlement, idempotencyKey)
  } catch (e) {
    const message = e instanceof StripeError ? e.message : (e instanceof Error ? e.message : String(e))
    // Fail loudly and leave the claim in place. Retrying automatically is how a transient error
    // becomes two charges; a human reads this and decides.
    return json({
      ok: false,
      recipe,
      runId,
      outcome,
      refused: 'settling this order',
      because: `Stripe would not complete the ${outcome === 'pass' ? 'charge' : 'cancellation'}: ${message}`,
      action: 'a human has to settle this one by hand — nothing will retry on its own'
    }, 502)
  }

  await patchOrder(env.AUROS_KV, recipe, {
    state: outcome === 'pass' ? 'billed' : 'released',
    settledAt: new Date().toISOString(),
    settledBecause: outcome === 'pass'
      ? `test build ${runId} passed${Number.isInteger(checks) ? ` (${checks} checks)` : ''}, so the trial ended and it billed`
      : `test build ${runId} failed, so it was cancelled. Nothing had been captured, so there was nothing to refund.`
  })

  return json({
    ok: true,
    recipe,
    runId,
    runUrl: typeof runUrl === 'string' ? runUrl : null,
    outcome,
    billed: outcome === 'pass',
    stripe: stripeResult.live
      ? { live: true, id: stripeResult.body?.id ?? null, status: stripeResult.body?.status ?? null }
      : { live: false, planned: stripeResult.planned, note: stripeResult.note },
    note: outcome === 'pass'
      ? 'The trial ended and the subscription billed, or the authorisation was captured. This is the first moment money moved.'
      : 'Cancelled. Nothing was ever captured, so there is nothing to refund.'
  })
}
