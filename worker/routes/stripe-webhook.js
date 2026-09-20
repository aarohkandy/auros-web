/**
 * POST /stripe-webhook — verify the signature before doing anything at all.
 *
 * "Before anything at all" is meant literally, and the ordering in this file is the whole point:
 *
 *   read raw bytes  →  verify HMAC over those exact bytes  →  only then JSON.parse
 *
 * Parsing first and verifying second is the standard way this goes wrong. The signature covers the
 * bytes Stripe sent; the moment you parse and re-serialise, you are checking a signature against a
 * document Stripe never signed, and whitespace, key order and number formatting are all places the two
 * can differ. So nothing here touches `parsed.value` until `verified.ok` is true.
 *
 * What this endpoint is for: Checkout happens in the customer's browser, so the Worker never sees the
 * subscription or payment intent that resulted. The webhook is how the order record learns which
 * Stripe object to end the trial on later. It moves no money itself.
 */

import { refuse, json, readBounded, parseJson } from '../lib/http.js'
import { verifySignedPayload } from '../lib/signature.js'
import { patchOrder, claimOnce } from '../lib/orders.js'

const MAX_BODY = 256 * 1024 // Stripe events are generous; this is well above the largest we handle

/**
 * @param {Request} request
 * @param {Record<string, any>} env
 */
export async function handleStripeWebhook (request, env) {
  if (request.method !== 'POST') return refuse(405, 'anything but a POST', 'webhooks are delivered, not fetched')

  const body = await readBounded(request, MAX_BODY)
  if (!body.ok) return refuse(413, 'this event', body.reason)

  const verified = await verifySignedPayload({
    secret: env.STRIPE_WEBHOOK_SECRET,
    header: request.headers.get('stripe-signature'),
    body: body.text
  })
  if (!verified.ok) {
    // Nothing above this line parsed the body, and nothing below runs.
    return refuse(verified.status, 'this event', verified.reason)
  }

  const parsed = parseJson(body.text)
  if (!parsed.ok) return refuse(400, 'this event', parsed.reason)
  const event = parsed.value
  if (!event || typeof event.type !== 'string' || typeof event.id !== 'string') {
    return refuse(400, 'this event', 'a Stripe event has an id and a type')
  }

  if (!env.AUROS_KV) return refuse(503, 'this event', 'no KV binding, so there is nowhere to record it')

  // Stripe redelivers. Claiming by event id means a redelivery is acknowledged and not re-applied.
  const claim = await claimOnce(env.AUROS_KV, `stripe-event:${event.id}`, { type: event.type })
  if (!claim.first) return json({ ok: true, repeated: true, id: event.id, type: event.type })

  const object = event.data?.object ?? {}
  const recipe = object.metadata?.recipe ?? object.subscription_details?.metadata?.recipe ?? null

  switch (event.type) {
    case 'checkout.session.completed': {
      if (!recipe) break
      // The card is now collected and SCA-authenticated. $0 has moved. This records which object to
      // act on when the build finishes, and nothing else.
      await patchOrder(env.AUROS_KV, recipe, {
        checkoutSessionId: object.id ?? null,
        subscriptionId: typeof object.subscription === 'string' ? object.subscription : null,
        paymentIntentId: typeof object.payment_intent === 'string' ? object.payment_intent : null,
        state: 'card-authenticated'
      })
      break
    }
    case 'checkout.session.expired': {
      if (!recipe) break
      await patchOrder(env.AUROS_KV, recipe, { state: 'awaiting-checkout', settledBecause: 'the checkout session expired before it was completed' })
      break
    }
    case 'customer.subscription.deleted': {
      if (!recipe) break
      await patchOrder(env.AUROS_KV, recipe, { state: 'released', settledAt: new Date().toISOString(), settledBecause: 'the subscription was cancelled' })
      break
    }
    default:
      // Everything else is acknowledged and ignored. A 2xx on an event we do not handle is correct —
      // a non-2xx makes Stripe retry an event forever that we were never going to act on.
      break
  }

  return json({ ok: true, id: event.id, type: event.type, recipe, note: 'Recorded. This endpoint moves no money; /build-result does that, and only after a build passes.' })
}
