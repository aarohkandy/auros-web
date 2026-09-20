/**
 * The routes, end to end, through the real `fetch` handler.
 *
 * Everything outside the Worker is stubbed — Turnstile, the GitHub API, Stripe, KV — and everything
 * inside it is the code that deploys. The GitHub App key is a real RSA key generated for the test, so
 * the RS256-via-WebCrypto path is genuinely exercised rather than mocked: that path has no `node:crypto`
 * available to it in production and it is the part most likely to be subtly wrong.
 *
 * The order of the assertions in the happy-path test mirrors the order of operations the flow depends
 * on — Turnstile before validation, validation before GitHub, GitHub before Stripe — because that
 * ordering *is* the safety property. A refused order must leave nothing behind.
 */

import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { readFileSync } from 'node:fs'
import worker from '../index.js'
import { signPayload } from '../lib/signature.js'

const REAL = JSON.parse(readFileSync(new URL('./fixtures-real-recipes.json', import.meta.url), 'utf8'))

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
})

/** An in-memory KV good enough for get/put with 'json'. */
function fakeKv () {
  const store = new Map()
  return {
    store,
    async get (key, type) {
      const v = store.get(key)
      if (v === undefined) return null
      return type === 'json' ? JSON.parse(v) : v
    },
    async put (key, value) { store.set(key, value) }
  }
}

function baseEnv (over = {}) {
  return {
    AUROS_KV: fakeKv(),
    ENVIRONMENT: 'production',
    SITE_ORIGIN: 'https://auros.dev',
    TURNSTILE_SECRET_KEY: 'a-real-looking-secret',
    GITHUB_APP_ID: '1234',
    GITHUB_APP_INSTALLATION_ID: '99',
    GITHUB_APP_PRIVATE_KEY: privateKey,
    RECIPES_OWNER: 'aarohkandy',
    RECIPES_REPO: 'auros-recipes',
    STRIPE_LIVE_ENABLED: 'false',
    OPERATOR_EMAIL_ENABLED: 'false',
    BUILD_RESULT_SECRET: 'build-secret',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    ...over
  }
}

const ctx = { waitUntil (p) { if (p && typeof p.catch === 'function') p.catch(() => {}) } }

/** Records every outbound request, and answers the ones the happy path needs. */
function stubNetwork ({ turnstile = { success: true }, githubOverrides = {} } = {}) {
  const calls = []
  const real = globalThis.fetch
  globalThis.fetch = async (url, init = {}) => {
    const href = typeof url === 'string' ? url : url.url
    calls.push({ url: href, method: init.method ?? 'GET', body: init.body })
    const reply = (status, body) => ({
      ok: status < 400,
      status,
      headers: new Headers({ 'x-ratelimit-remaining': '4999' }),
      async json () { return body },
      async text () { return JSON.stringify(body) }
    })
    if (href.includes('challenges.cloudflare.com')) return reply(200, turnstile)
    if (href.includes('/app/installations/')) return reply(201, { token: 'ghs_fake', expires_at: new Date(Date.now() + 3600_000).toISOString() })
    for (const [match, handler] of Object.entries(githubOverrides)) {
      if (href.includes(match)) return handler(reply, href, init)
    }
    if (href.includes('/contents/customers/')) {
      return init.method === 'PUT' ? reply(201, { commit: { sha: 'deadbeef' } }) : reply(404, { message: 'Not Found' })
    }
    if (href.includes('/git/ref/heads/')) return reply(200, { object: { sha: 'basesha' } })
    if (href.includes('/git/refs')) return reply(201, { ref: 'refs/heads/x' })
    if (href.includes('/pulls')) return reply(201, { number: 7, html_url: 'https://github.com/aarohkandy/auros-recipes/pull/7' })
    throw new Error(`the test made an unexpected request to ${href}`)
  }
  return { calls, restore () { globalThis.fetch = real } }
}

const post = (path, body, headers = {}) => new Request(`https://auros.dev${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body)
})

const orderBody = (over = {}) => ({
  turnstileToken: 'a-token',
  tier: 'school',
  contactEmail: 'it@example.org',
  recipe: REAL['example-school'],
  ...over
})

let net
afterEach(() => { net?.restore(); net = null })

describe('POST /order — the happy path', () => {
  beforeEach(() => { net = stubNetwork() })

  test('a valid order becomes a pull request, and no card is touched', async () => {
    const env = baseEnv()
    const res = await worker.fetch(post('/order-submit', orderBody()), env, ctx)
    const body = await res.json()

    assert.equal(res.status, 201, JSON.stringify(body))
    assert.equal(body.pullRequest.number, 7)
    assert.equal(body.charged, 0)
    assert.equal(body.payment.live, false, 'STRIPE_LIVE_ENABLED is off, so no Stripe request may be made')
    assert.match(body.payment.note, /§9/)
    assert.equal(body.operatorNotified, false)
    assert.match(body.operatorNotificationNote, /§4\.6/)

    // The ordering that makes a refusal leave nothing behind.
    const order = net.calls.findIndex(c => c.url.includes('challenges.cloudflare.com'))
    const branch = net.calls.findIndex(c => c.url.includes('/git/refs') && c.method === 'POST')
    const pull = net.calls.findIndex(c => c.url.includes('/pulls'))
    assert.ok(order >= 0 && order < branch, 'Turnstile must be verified before anything is created')
    assert.ok(branch < pull, 'the branch exists before the pull request that points at it')
    assert.ok(!net.calls.some(c => c.url.includes('api.stripe.com')), 'no request may reach Stripe while the live switch is off')
    assert.ok(!net.calls.some(c => c.url.includes('api.resend.com')), 'no email may be sent while the email switch is off')
  })

  test('the committed file is YAML the emitter wrote, and the PR body is the explain output', async () => {
    const env = baseEnv()
    await worker.fetch(post('/order-submit', orderBody()), env, ctx)
    const put = net.calls.find(c => c.url.includes('/contents/customers/') && c.method === 'PUT')
    const committed = Buffer.from(JSON.parse(put.body).content, 'base64').toString('utf8')
    assert.match(committed, /^name: example-school$/m)
    assert.match(committed, /^prune:$/m)
    assert.match(committed, /Submitted through the Auros configurator/)

    const pull = net.calls.find(c => c.url.includes('/pulls'))
    const prBody = JSON.parse(pull.body).body
    assert.match(prBody, /## What gets deleted/)
    assert.match(prBody, /Microsoft Office and the Adobe applications do not come across/)
    assert.ok(!/removed \*\*\d+ packages\*\*/.test(prBody), 'no measured-looking count before a build has measured one')
  })

  test('the order is recorded, so the webhook and the build result can find it', async () => {
    const env = baseEnv()
    await worker.fetch(post('/order-submit', orderBody()), env, ctx)
    const stored = JSON.parse(env.AUROS_KV.store.get('order:example-school'))
    assert.equal(stored.prNumber, 7)
    assert.equal(stored.tier, 'school')
    assert.equal(stored.mode, 'subscription')
    assert.equal(stored.state, 'awaiting-checkout')
  })
})

describe('POST /order — the refusals, which are the point', () => {
  beforeEach(() => { net = stubNetwork() })

  test('no Turnstile token: refused, and nothing is created', async () => {
    const env = baseEnv()
    const res = await worker.fetch(post('/order-submit', orderBody({ turnstileToken: undefined })), env, ctx)
    assert.equal(res.status, 400)
    assert.equal(net.calls.length, 0, 'a request with no token must not reach any network at all')
    assert.equal(env.AUROS_KV.store.size, 2, 'only the two rate-limit counters (per-address and global) should have been written')
  })

  test('a failed Turnstile check: refused before validation even runs', async () => {
    net.restore()
    net = stubNetwork({ turnstile: { success: false, 'error-codes': ['timeout-or-duplicate'] } })
    const res = await worker.fetch(post('/order-submit', orderBody()), baseEnv(), ctx)
    const body = await res.json()
    assert.equal(res.status, 403)
    assert.equal(body.stage, 'turnstile')
    assert.ok(!net.calls.some(c => c.url.includes('api.github.com')), 'nothing may be created for an unverified caller')
  })

  test('a recipe that pins a version: refused with the schema\'s own argument', async () => {
    const res = await worker.fetch(post('/order-submit', orderBody({ recipe: { ...REAL['example-school'], version: '1.2' } })), baseEnv(), ctx)
    const body = await res.json()
    assert.equal(res.status, 422)
    assert.equal(body.stage, 'validation')
    assert.match(body.headline, /Nothing can be held at a version/)
    assert.match(body.why, /unpatched/)
    assert.ok(!net.calls.some(c => c.url.includes('api.github.com')))
  })

  test('a recipe that names a different base: refused', async () => {
    const res = await worker.fetch(post('/order-submit', orderBody({ recipe: { ...REAL['example-school'], from: 'ubuntu:24.04' } })), baseEnv(), ctx)
    assert.equal((await res.json()).stage, 'validation')
    assert.equal(res.status, 422)
  })

  test('a school order below the 25-device floor: refused', async () => {
    const small = structuredClone(REAL['example-school'])
    small.hardware.machines = 10
    const res = await worker.fetch(post('/order-submit', orderBody({ recipe: small })), baseEnv(), ctx)
    const body = await res.json()
    assert.equal(res.status, 422)
    assert.match(body.because, /starts at 25 devices/)
  })

  test('an oversized body is refused before it is parsed', async () => {
    const res = await worker.fetch(post('/order-submit', 'x'.repeat(200_000)), baseEnv(), ctx)
    assert.equal(res.status, 413)
  })

  test('a name that already has an order: refused, and the existing PR is named', async () => {
    const env = baseEnv()
    await worker.fetch(post('/order-submit', orderBody()), env, ctx)
    const res = await worker.fetch(post('/order-submit', orderBody()), env, ctx)
    const body = await res.json()
    assert.equal(res.status, 409)
    assert.match(body.because, /already an order/)
    assert.match(body.prUrl, /pull\/7/)
  })

  test('a name already taken in the repository: refused before a branch exists', async () => {
    net.restore()
    net = stubNetwork({ githubOverrides: { '/contents/customers/': (reply, _href, init) => init.method === 'PUT' ? reply(201, {}) : reply(200, { name: 'recipe.yaml' }) } })
    const res = await worker.fetch(post('/order-submit', orderBody()), baseEnv(), ctx)
    assert.equal(res.status, 409)
    assert.ok(!net.calls.some(c => c.url.includes('/git/refs') && c.method === 'POST'), 'no orphan branch may be left behind by a refused order')
  })

  test('with no Turnstile secret configured, the endpoint refuses rather than opening up', async () => {
    const res = await worker.fetch(post('/order-submit', orderBody()), baseEnv({ TURNSTILE_SECRET_KEY: undefined }), ctx)
    assert.equal(res.status, 503)
    assert.equal(net.calls.length, 0)
  })

  test('the always-passes Turnstile TEST secret is refused in production', async () => {
    const res = await worker.fetch(post('/order-submit', orderBody()), baseEnv({ TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' }), ctx)
    const body = await res.json()
    assert.equal(res.status, 503)
    assert.match(body.because, /TEST secret/)
  })

  test('a GET is refused', async () => {
    const res = await worker.fetch(new Request('https://auros.dev/order-submit'), baseEnv(), ctx)
    assert.equal(res.status, 405)
  })

  // REGRESSION. /order is a PAGE (src/pages/order.astro) and must fall through to the static site,
  // not be answered by the submit endpoint. When the endpoint was called /order, a visitor following
  // that page's own canonical link got {"ok":false,"refused":"anything but a POST to this endpoint"}
  // instead of the page explaining what ordering does.
  test('/order belongs to the static site and this Worker does not answer it', async () => {
    let served = null
    const env = baseEnv({ ASSETS: { async fetch (request) { served = new URL(request.url).pathname; return new Response('the order page', { status: 200 }) } } })
    const res = await worker.fetch(new Request('https://auros.dev/order'), env, ctx)
    assert.equal(served, '/order', 'the Worker handled /order itself instead of handing it to the static site')
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'the order page')
  })

  test('the rate limit stops one solved challenge becoming a PR factory', async () => {
    const env = baseEnv()
    const names = ['aaa-one', 'aaa-two', 'aaa-three', 'aaa-four', 'aaa-five', 'aaa-six']
    const statuses = []
    for (const name of names) {
      const recipe = structuredClone(REAL['example-school'])
      recipe.name = name
      const res = await worker.fetch(post('/order-submit', orderBody({ recipe })), env, ctx)
      statuses.push(res.status)
    }
    assert.equal(statuses[5], 429, `the sixth order in an hour should be refused; got ${statuses.join(',')}`)
  })

  /*
   * REGRESSION. The per-address window worked and bounded nothing: ten orders from one address gave
   * 201,201,201,201,201,429,429,429,429,429, and ten orders from ten addresses gave 201 ten times.
   * `cf-connecting-ip` is set by Cloudflare and a client cannot spoof it, but one IPv6 /64 is 2^64
   * addresses, so "five per address" cost an attacker nothing. With no ceiling above it, Turnstile
   * was the only thing bounding how many pull requests could be opened in a public repository under
   * our name — which made the blast radius of any future Turnstile weakness unbounded rather than
   * bounded. The thing being filled is the repository carrying every customer's operating system.
   */
  test('a ceiling across every address, so one address per order buys nothing', async () => {
    const env = baseEnv()
    const statuses = []
    // Forty-one orders, each from a different address and each with a different recipe name, so
    // neither the per-address window nor the duplicate-name check is what refuses them.
    for (let i = 0; i < 41; i++) {
      const recipe = structuredClone(REAL['example-school'])
      recipe.name = `fleet-${String(i).padStart(3, '0')}`
      const request = post('/order-submit', orderBody({ recipe }))
      // A fresh address every time. Cloudflare sets this header; the test is impersonating
      // Cloudflare, not a client.
      const withIp = new Request(request, { headers: { ...Object.fromEntries(request.headers), 'cf-connecting-ip': `2001:db8::${i}` } })
      const res = await worker.fetch(withIp, env, ctx)
      statuses.push(res.status)
    }
    assert.ok(statuses.slice(0, 40).every(s => s === 201), `the first forty should be accepted; got ${statuses.slice(0, 40).join(',')}`)
    assert.equal(statuses[40], 429, 'the forty-first order in an hour, from a forty-first address, must be refused')

    const refused = await worker.fetch(new Request(post('/order-submit', orderBody()), { headers: { 'content-type': 'application/json', 'cf-connecting-ip': '2001:db8::ffff' } }), env, ctx)
    const body = await refused.json()
    assert.equal(body.scope, 'global', 'a globally rate-limited order should say which ceiling it hit')
    assert.match(body.because, /across every address/)
  })
})

describe('POST /build-result — the endpoint that charges a card', () => {
  beforeEach(() => { net = stubNetwork() })

  /** Place an order first, so there is something to settle. */
  async function withOrder (env) {
    await worker.fetch(post('/order-submit', orderBody()), env, ctx)
    const record = JSON.parse(env.AUROS_KV.store.get('order:example-school'))
    record.subscriptionId = 'sub_fake'
    record.state = 'card-authenticated'
    env.AUROS_KV.store.set('order:example-school', JSON.stringify(record))
    return env
  }

  const result = (over = {}) => JSON.stringify({ recipe: 'example-school', run_id: 5150, run_url: 'https://github.com/x/y/actions/runs/5150', outcome: 'pass', checks: 24, ...over })

  test('unsigned: refused, and nothing is settled', async () => {
    const env = await withOrder(baseEnv())
    const res = await worker.fetch(post('/build-result', result()), env, ctx)
    assert.equal(res.status, 400)
    assert.equal(env.AUROS_KV.store.get('once:build-result:example-school:5150'), undefined)
  })

  test('signed with the wrong secret: refused', async () => {
    const env = await withOrder(baseEnv())
    const raw = result()
    const sig = await signPayload('not-the-secret', raw)
    const res = await worker.fetch(post('/build-result', raw, { 'x-auros-signature': sig }), env, ctx)
    assert.equal(res.status, 401)
  })

  test('a failing result edited into a passing one: refused', async () => {
    const env = await withOrder(baseEnv())
    const honest = result({ outcome: 'fail' })
    const sig = await signPayload('build-secret', honest)
    const forged = result({ outcome: 'pass' })
    const res = await worker.fetch(post('/build-result', forged, { 'x-auros-signature': sig }), env, ctx)
    assert.equal(res.status, 401, 'this is the attack the endpoint exists to stop')
  })

  test('a replay from yesterday: refused', async () => {
    const env = await withOrder(baseEnv())
    const raw = result()
    const sig = await signPayload('build-secret', raw, Math.floor(Date.now() / 1000) - 86_400)
    const res = await worker.fetch(post('/build-result', raw, { 'x-auros-signature': sig }), env, ctx)
    assert.equal(res.status, 400)
  })

  test('with no BUILD_RESULT_SECRET set: refuses everything', async () => {
    const env = await withOrder(baseEnv({ BUILD_RESULT_SECRET: undefined }))
    const raw = result()
    const sig = await signPayload('build-secret', raw)
    const res = await worker.fetch(post('/build-result', raw, { 'x-auros-signature': sig }), env, ctx)
    assert.equal(res.status, 503)
  })

  test('a correctly signed pass ends the trial — and with the live switch off, only plans it', async () => {
    const env = await withOrder(baseEnv())
    const raw = result()
    const res = await worker.fetch(post('/build-result', raw, { 'x-auros-signature': await signPayload('build-secret', raw) }), env, ctx)
    const body = await res.json()
    assert.equal(res.status, 200, JSON.stringify(body))
    assert.equal(body.billed, true)
    assert.equal(body.stripe.live, false)
    assert.equal(body.stripe.planned.path, '/subscriptions/sub_fake')
    assert.deepEqual(body.stripe.planned.params, { trial_end: 'now', proration_behavior: 'none' })
    assert.ok(!net.calls.some(c => c.url.includes('api.stripe.com')))
  })

  test('a correctly signed fail cancels, and nothing is refunded because nothing was captured', async () => {
    const env = await withOrder(baseEnv())
    const raw = result({ outcome: 'fail' })
    const res = await worker.fetch(post('/build-result', raw, { 'x-auros-signature': await signPayload('build-secret', raw) }), env, ctx)
    const body = await res.json()
    assert.equal(body.billed, false)
    assert.equal(body.stripe.planned.method, 'DELETE')
    assert.match(body.note, /nothing to refund/)
  })

  test('a retried callback does nothing a second time', async () => {
    const env = await withOrder(baseEnv())
    const raw = result()
    const sig = await signPayload('build-secret', raw)
    await worker.fetch(post('/build-result', raw, { 'x-auros-signature': sig }), env, ctx)
    const second = await worker.fetch(post('/build-result', raw, { 'x-auros-signature': sig }), env, ctx)
    const body = await second.json()
    assert.equal(body.repeated, true)
    assert.match(body.note, /Already handled/)
  })

  test('the same run reporting a different outcome is refused for a human to look at', async () => {
    const env = await withOrder(baseEnv())
    const pass = result()
    await worker.fetch(post('/build-result', pass, { 'x-auros-signature': await signPayload('build-secret', pass) }), env, ctx)
    const fail = result({ outcome: 'fail' })
    const res = await worker.fetch(post('/build-result', fail, { 'x-auros-signature': await signPayload('build-secret', fail) }), env, ctx)
    assert.equal(res.status, 409)
  })

  test('an outcome that is neither pass nor fail is refused', async () => {
    const env = await withOrder(baseEnv())
    const raw = result({ outcome: 'passed-with-warnings' })
    const res = await worker.fetch(post('/build-result', raw, { 'x-auros-signature': await signPayload('build-secret', raw) }), env, ctx)
    const body = await res.json()
    assert.equal(res.status, 400)
    assert.match(body.because, /no value meaning "passed except for"/)
  })

  test('a result for a recipe nobody ordered bills nothing', async () => {
    const env = baseEnv()
    const raw = result({ recipe: 'never-ordered' })
    const res = await worker.fetch(post('/build-result', raw, { 'x-auros-signature': await signPayload('build-secret', raw) }), env, ctx)
    assert.equal(res.status, 404)
  })
})

describe('POST /stripe-webhook — signature first, always', () => {
  beforeEach(() => { net = stubNetwork() })

  const event = (over = {}) => JSON.stringify({
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_1', subscription: 'sub_real', payment_intent: null, metadata: { recipe: 'example-school' } } },
    ...over
  })

  test('unsigned: refused without the body being parsed', async () => {
    const res = await worker.fetch(post('/stripe-webhook', event()), baseEnv(), ctx)
    assert.equal(res.status, 400)
  })

  test('tampered: refused', async () => {
    const honest = event()
    const sig = await signPayload('whsec_test', honest)
    const tampered = honest.replace('sub_real', 'sub_attacker')
    const res = await worker.fetch(post('/stripe-webhook', tampered, { 'stripe-signature': sig }), baseEnv(), ctx)
    assert.equal(res.status, 401)
  })

  test('with no webhook secret configured: refuses everything', async () => {
    const raw = event()
    const res = await worker.fetch(post('/stripe-webhook', raw, { 'stripe-signature': await signPayload('whsec_test', raw) }), baseEnv({ STRIPE_WEBHOOK_SECRET: undefined }), ctx)
    assert.equal(res.status, 503)
  })

  test('a valid checkout.session.completed records which object to bill later', async () => {
    const env = baseEnv()
    await worker.fetch(post('/order-submit', orderBody()), env, ctx)
    const raw = event()
    const res = await worker.fetch(post('/stripe-webhook', raw, { 'stripe-signature': await signPayload('whsec_test', raw) }), env, ctx)
    assert.equal(res.status, 200)
    const stored = JSON.parse(env.AUROS_KV.store.get('order:example-school'))
    assert.equal(stored.subscriptionId, 'sub_real')
    assert.equal(stored.state, 'card-authenticated')
  })

  test('a redelivered event is acknowledged and not re-applied', async () => {
    const env = baseEnv()
    await worker.fetch(post('/order-submit', orderBody()), env, ctx)
    const raw = event()
    const sig = await signPayload('whsec_test', raw)
    await worker.fetch(post('/stripe-webhook', raw, { 'stripe-signature': sig }), env, ctx)
    const again = await worker.fetch(post('/stripe-webhook', raw, { 'stripe-signature': sig }), env, ctx)
    assert.equal((await again.json()).repeated, true)
  })

  test('an event type we do not handle is acknowledged, so Stripe stops retrying it', async () => {
    const raw = event({ id: 'evt_2', type: 'invoice.upcoming' })
    const res = await worker.fetch(post('/stripe-webhook', raw, { 'stripe-signature': await signPayload('whsec_test', raw) }), baseEnv(), ctx)
    assert.equal(res.status, 200)
  })
})

describe('GET /build-console', () => {
  beforeEach(() => { net = stubNetwork() })

  test('a bad recipe name is refused rather than passed to the API', async () => {
    const res = await worker.fetch(new Request('https://auros.dev/build-console?recipe=../../etc/passwd'), baseEnv(), ctx)
    assert.equal(res.status, 400)
  })

  test('asking for nothing in particular is refused, so the list of customers does not leak', async () => {
    const res = await worker.fetch(new Request('https://auros.dev/build-console'), baseEnv(), ctx)
    const body = await res.json()
    assert.equal(res.status, 400)
    assert.match(body.because, /leak which customers exist/)
  })

  test('the stream carries the headers that stop it being buffered', async () => {
    const res = await worker.fetch(new Request('https://auros.dev/build-console?recipe=example-school'), baseEnv(), ctx)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /text\/event-stream/)
    assert.equal(res.headers.get('content-encoding'), 'identity')
    assert.match(res.headers.get('cache-control'), /no-transform/)
  })

  test('with no GitHub App configured, it says so instead of showing sample output', async () => {
    const res = await worker.fetch(new Request('https://auros.dev/build-console?recipe=example-school'), baseEnv({ GITHUB_APP_ID: undefined }), ctx)
    const text = await res.text()
    assert.match(text, /event: status/)
    assert.match(text, /unavailable/)
    assert.match(text, /Nothing is being shown in place of one/)
  })

  test('with no run for the recipe, it says there is no build', async () => {
    net.restore()
    net = stubNetwork({ githubOverrides: { '/actions/runs?': (reply) => reply(200, { workflow_runs: [] }) } })
    const res = await worker.fetch(new Request('https://auros.dev/build-console?recipe=example-school'), baseEnv(), ctx)
    const text = await res.text()
    assert.match(text, /event: idle/)
    assert.match(text, /No build has run/)
  })

  test('a real run streams real step transitions and then done', async () => {
    net.restore()
    net = stubNetwork({
      githubOverrides: {
        '/actions/runs/424242/jobs': (reply) => reply(200, {
          jobs: [{
            name: 'build',
            status: 'completed',
            conclusion: 'success',
            started_at: '2026-09-20T10:00:00Z',
            completed_at: '2026-09-20T10:04:00Z',
            html_url: 'https://github.com/x/y/runs/1',
            steps: [{ number: 1, name: 'Check matrix — static, then boot, then update', status: 'completed', conclusion: 'success', started_at: '2026-09-20T10:00:05Z', completed_at: '2026-09-20T10:03:00Z' }]
          }]
        })
      }
    })
    const res = await worker.fetch(new Request('https://auros.dev/build-console?run=424242'), baseEnv(), ctx)
    const text = await res.text()
    assert.match(text, /event: hello/)
    assert.match(text, /Check matrix — static, then boot, then update/)
    assert.match(text, /event: done/)
    assert.match(text, /id: 424242#0/)
  })

  test('when GitHub rate-limits us, it says so and shows nothing rather than something invented', async () => {
    net.restore()
    net = stubNetwork({
      githubOverrides: {
        '/actions/runs/424242/jobs': () => ({
          ok: false, status: 429, headers: new Headers({ 'x-ratelimit-remaining': '0' }),
          async json () { return {} }, async text () { return '{}' }
        })
      }
    })
    const res = await worker.fetch(new Request('https://auros.dev/build-console?run=424242'), baseEnv(), ctx)
    const text = await res.text()
    assert.match(text, /degraded/)
    assert.match(text, /rate limit is exhausted/)
    assert.match(text, /rather show you nothing than show you something we invented/)
  })
})

describe('the router', () => {
  test('an unknown path falls through to the static site', async () => {
    let asked = null
    const env = baseEnv({ ASSETS: { fetch: async (req) => { asked = req.url; return new Response('page') } } })
    const res = await worker.fetch(new Request('https://auros.dev/pricing'), env, ctx)
    assert.equal(await res.text(), 'page')
    assert.match(asked, /\/pricing$/)
  })

  test('an unhandled error becomes a refusal, not a stack trace', async () => {
    const env = baseEnv()
    env.AUROS_KV = { get () { throw new Error('kv exploded, and this message names our internals') }, put () {} }
    const res = await worker.fetch(post('/order-submit', orderBody()), env, ctx)
    const body = await res.json()
    assert.equal(res.status, 500)
    assert.ok(!JSON.stringify(body).includes('kv exploded'))
    assert.match(body.because, /Nothing was created and no card was touched/)
  })
})
