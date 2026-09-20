/**
 * POST /order — the order literally becomes the build.
 *
 * The sequence is fixed and it is the same shape as the installer's: **verify everything, then act.**
 * Nothing is created until every check has passed, so a refused order leaves no branch, no file, no
 * Stripe object and no record.
 *
 *   1. Turnstile. No token, no POST. There is no bypass flag anywhere in this file.
 *   2. Re-validate the recipe against the real schema. The client's check was a convenience.
 *   3. Create customers/<name>/recipe.yaml on a branch and open a pull request.
 *   4. The PR body is the explain output, because the repo is public and the customer reads it.
 *   5. Email the operator.
 *
 * Checkout is created *after* the pull request, not before. If Stripe were first, a failed PR would
 * leave a session the customer might complete for a build that does not exist. This way the worst
 * failure is a pull request with no payment attached, which a human can see and close.
 */

import { refuse, json, readBounded, parseJson, rateLimit, clientIp } from '../lib/http.js'
import { MAX_BODY_BYTES, validateRecipe, presentRefusal, schema } from '../lib/recipe.js'
import { verifyTurnstile } from '../lib/turnstile.js'
import { toYaml, keyOrderFromSchema } from '../lib/yaml.js'
import { explain } from '../lib/explain.js'
import { openRecipePr, GitHubError } from '../lib/github.js'
import { tierFor, checkoutParams, createCheckoutSession } from '../lib/stripe.js'
import { composeOperatorEmail, deliver } from '../lib/email.js'
import { putOrder, getOrder } from '../lib/orders.js'

const KEY_ORDER = keyOrderFromSchema(schema)

/** Five orders an hour from one address. A school orders once. */
const ORDERS_PER_HOUR = 5

/**
 * @param {Request} request
 * @param {Record<string, any>} env
 */
export async function handleOrder (request, env) {
  if (request.method !== 'POST') return refuse(405, 'anything but a POST to this endpoint', 'orders are submitted, not fetched')
  if (!env.AUROS_KV) return refuse(503, 'the order', 'this deployment has no KV binding, so it cannot record an order it creates. Refusing rather than creating something it will forget.')

  const ip = clientIp(request)
  const limit = await rateLimit(env.AUROS_KV, `order:${ip}`, ORDERS_PER_HOUR, 3600)
  if (!limit.allowed) {
    return refuse(429, 'this order', `that is ${limit.count} orders from this address in the last hour. The recipes repository is public and we would rather be slow than be a pull request factory. Email us and we will write the recipe by hand.`)
  }

  const body = await readBounded(request, MAX_BODY_BYTES)
  if (!body.ok) return refuse(413, 'the order', `${body.reason}. A recipe is a few kilobytes; anything larger is not one.`)
  const parsed = parseJson(body.text)
  if (!parsed.ok) return refuse(400, 'the order', parsed.reason)
  const payload = parsed.value
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return refuse(400, 'the order', 'the body must be an object with a `recipe`, a `tier` and a `turnstileToken`')
  }

  /* ---- 1. Turnstile. Before anything else, and with no way past it. ------------------------- */

  const turnstile = await verifyTurnstile({
    secret: env.TURNSTILE_SECRET_KEY,
    token: payload.turnstileToken,
    remoteIp: ip,
    // Ties the challenge to this exact submission, so one solved challenge cannot be replayed against
    // a different recipe.
    idempotencyKey: await fingerprint(body.text),
    environment: env.ENVIRONMENT ?? 'production'
  })
  if (!turnstile.ok) {
    return refuse(turnstile.status, 'the order', turnstile.reason, { stage: 'turnstile' })
  }

  /* ---- 2. Re-validate server-side. The client is assumed hostile. --------------------------- */

  const result = validateRecipe(payload.recipe)
  if (!result.ok) {
    const presented = presentRefusal(result.errors)
    // 422, not 400: the request was well-formed and we understood it perfectly. We are refusing it.
    return json({
      ok: false,
      refused: 'this recipe',
      stage: 'validation',
      ...presented,
      note: 'This is the same schema auros-recipes validates with in CI. If the configurator let you ' +
            'build this, the configurator has a bug — the server is the control and it is what just spoke.'
    }, 422)
  }
  const recipe = result.recipe

  const tierId = typeof payload.tier === 'string' ? payload.tier : ''
  const devices = Number(recipe.hardware?.machines ?? 0)
  const chosen = tierFor(tierId, devices)
  if (!chosen.ok) return refuse(422, 'this order', chosen.reason, { stage: 'tier' })
  const tier = chosen.tier

  const contactEmail = typeof payload.contactEmail === 'string' && payload.contactEmail.length <= 254 && payload.contactEmail.includes('@')
    ? payload.contactEmail
    : null

  const existing = await getOrder(env.AUROS_KV, recipe.name)
  if (existing) {
    return refuse(409, 'a second order for this name', `there is already an order for "${recipe.name}" — its pull request is ${existing.prUrl}. Choose a different name rather than have two organisations share one image tag.`, { stage: 'name', prUrl: existing.prUrl })
  }

  /* ---- 3 & 4. The pull request, whose body is the explain output. --------------------------- */

  const orderedAt = new Date().toISOString()
  const yaml = toYaml(recipe, {
    keyOrder: KEY_ORDER,
    header: [
      'Submitted through the Auros configurator. This file is the machine.',
      'It has not been built and no card has been charged. Read it, argue with it, then merge it.',
      `Ordered ${orderedAt}`
    ]
  })
  const prBody = explain(recipe, { orderedAt: orderedAt.slice(0, 10) })
  const branch = `order/${recipe.name}-${orderedAt.slice(0, 10)}-${(await fingerprint(yaml)).slice(0, 8)}`

  const gh = githubConfig(env)
  if (!gh) {
    return refuse(503, 'the order', 'this deployment has no GitHub App configured, so it cannot open the pull request that an order is. Nothing was created and no card was touched.', { stage: 'github' })
  }

  let pr
  try {
    pr = await openRecipePr(gh, {
      name: recipe.name,
      yaml,
      prBody,
      prTitle: `${recipe.name}: ${recipe.hardware.machines} ${recipe.hardware.machines === 1 ? 'machine' : 'machines'}, ${recipe.policy}`,
      branch,
      baseBranch: env.RECIPES_BASE_BRANCH ?? 'main'
    })
  } catch (e) {
    if (e instanceof GitHubError) {
      return refuse(e.status === 409 ? 409 : 502, 'the order', e.message, { stage: 'github' })
    }
    return refuse(502, 'the order', `the pull request could not be opened (${e instanceof Error ? e.message : String(e)}). Nothing was charged.`, { stage: 'github' })
  }

  /* ---- 5. Stripe, then the operator email. Both after the durable thing exists. ------------- */

  const stripeCfg = { secretKey: env.STRIPE_SECRET_KEY, live: env.STRIPE_LIVE_ENABLED === 'true' }
  let checkout = null
  let checkoutError = null
  if (tier.unitAmount > 0) {
    try {
      const params = checkoutParams({
        tier,
        devices,
        recipeName: recipe.name,
        successUrl: `${env.SITE_ORIGIN ?? 'https://auros.dev'}/ordered?recipe=${encodeURIComponent(recipe.name)}`,
        cancelUrl: `${env.SITE_ORIGIN ?? 'https://auros.dev'}/configure?resume=${encodeURIComponent(recipe.name)}`,
        customerEmail: contactEmail ?? undefined,
        priceId: env[`STRIPE_PRICE_${tier.id.toUpperCase().replace(/-/g, '_')}`]
      })
      checkout = await createCheckoutSession(stripeCfg, params, `order:${recipe.name}`)
    } catch (e) {
      // A Stripe failure does not undo a pull request. The customer has a readable recipe either way
      // and a human can send them a payment link; silently rolling back the PR would be worse.
      checkoutError = e instanceof Error ? e.message : String(e)
    }
  }

  await putOrder(env.AUROS_KV, {
    recipe: recipe.name,
    tier: tier.id,
    devices,
    mode: tier.mode,
    branch: pr.branch,
    prNumber: pr.prNumber,
    prUrl: pr.prUrl,
    contactEmail,
    checkoutSessionId: checkout?.live ? checkout.body.id : null,
    subscriptionId: null,
    paymentIntentId: null,
    state: 'awaiting-checkout',
    createdAt: orderedAt
  })

  const message = composeOperatorEmail({
    recipe: recipe.name,
    prUrl: pr.prUrl,
    devices,
    tier: tier.id,
    contactEmail,
    policy: String(recipe.policy),
    stripeLive: stripeCfg.live
  })
  const mail = await deliver({
    enabled: env.OPERATOR_EMAIL_ENABLED === 'true',
    apiKey: env.RESEND_API_KEY,
    from: env.OPERATOR_EMAIL_FROM,
    to: env.OPERATOR_EMAIL_TO
  }, message)

  return json({
    ok: true,
    recipe: recipe.name,
    pullRequest: { number: pr.prNumber, url: pr.prUrl, branch: pr.branch },
    consoleUrl: `/build-console?recipe=${encodeURIComponent(recipe.name)}`,
    payment: checkout === null
      ? { required: false, because: 'the self-serve tier is $0 — the recipes are public and you build it yourself' }
      : checkout.live
        ? { required: true, checkoutUrl: checkout.body.url, charged: 0, when: 'your card is authenticated now and billed only when the test build passes' }
        : { required: true, live: false, planned: checkout.planned, note: checkout.note },
    checkoutError,
    operatorNotified: mail.sent,
    operatorNotificationNote: mail.reason,
    charged: 0
  }, 201)
}

/** @param {Record<string, any>} env */
export function githubConfig (env) {
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY || !env.GITHUB_APP_INSTALLATION_ID) return null
  return {
    appId: String(env.GITHUB_APP_ID),
    privateKeyPem: String(env.GITHUB_APP_PRIVATE_KEY),
    installationId: String(env.GITHUB_APP_INSTALLATION_ID),
    owner: String(env.RECIPES_OWNER ?? 'aarohkandy'),
    repo: String(env.RECIPES_REPO ?? 'auros-recipes'),
    kv: env.AUROS_KV
  }
}

/** A stable short hash, used for idempotency keys and branch suffixes. */
async function fingerprint (text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}
