/**
 * REGRESSION — the client's payload is a payload the Worker accepts.
 *
 * ══ THE FATAL THIS FILE EXISTS FOR ═════════════════════════════════════════════════════════════
 *
 * `configurator.client.ts` POSTed `{name, recipeYaml, turnstileToken}` to `/api/order`, and every
 * one of those four things was wrong:
 *
 *   1. `/api/order` is not a route this Worker has. `ROUTES` is ['/order-submit', '/build-result',
 *      '/stripe-webhook', '/build-console'] and `run_worker_first` names the same four. A POST to
 *      /api/order fell through to the ASSETS binding and was answered by the static 404 page, so
 *      `response.ok` was false and the visitor was told "The order did not go through. Nothing was
 *      charged and nothing was created." NO ORDER COULD EVER BE PLACED.
 *   2. `handleOrder` requires `recipe` as an OBJECT and 422s on anything else. The client sent
 *      `recipeYaml`, a string, and no `recipe` at all.
 *   3. `tier` is required. The client never sent one.
 *   4. The client read `body.pullRequestUrl`; the Worker answers `pullRequest.url`. So even a
 *      successful order would have reported the wrong thing.
 *
 * Four mismatches in one thirty-line function is not four mistakes, it is a path that had never
 * been run end to end — and 205 Worker tests passed throughout, because every one of them built its
 * own request body. A test that writes the request it wants to receive cannot catch this.
 *
 * So this file imports `orderBody` and `ORDER_ENDPOINT` from `src/components/configurator/
 * order-request.ts` — the actual module the browser bundle ships — and runs what they produce
 * through the real `worker.fetch`. It cannot pass unless the two sides agree.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */

import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import worker, { ROUTES } from '../index.js'
import { ORDER_ENDPOINT, orderBody } from '../../src/components/configurator/order-request.ts'

const REAL = JSON.parse(readFileSync(new URL('./fixtures-real-recipes.json', import.meta.url), 'utf8'))

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
})

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
    SITE_ORIGIN: 'https://auros.dev',
    TURNSTILE_SECRET_KEY: 'a-real-looking-secret',
    GITHUB_APP_ID: '1234',
    GITHUB_APP_INSTALLATION_ID: '99',
    GITHUB_APP_PRIVATE_KEY: privateKey,
    RECIPES_OWNER: 'aarohkandy',
    RECIPES_REPO: 'auros-recipes',
    STRIPE_LIVE_ENABLED: 'false',
    OPERATOR_EMAIL_ENABLED: 'false',
    // The static site, so a request that misses every route is answered the way production answers
    // it: by the 404 page, which is exactly what the broken client used to receive.
    ASSETS: { async fetch () { return new Response('<!doctype html><title>Not found</title>', { status: 404, headers: { 'content-type': 'text/html' } }) } },
    ...over
  }
}

const ctx = { waitUntil (p) { if (p && typeof p.catch === 'function') p.catch(() => {}) } }

function stubNetwork () {
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
    if (href.includes('challenges.cloudflare.com')) return reply(200, { success: true })
    if (href.includes('/app/installations/')) return reply(201, { token: 'ghs_fake', expires_at: new Date(Date.now() + 3600_000).toISOString() })
    if (href.includes('/contents/customers/')) return init.method === 'PUT' ? reply(201, { commit: { sha: 'deadbeef' } }) : reply(404, { message: 'Not Found' })
    if (href.includes('/git/ref/heads/')) return reply(200, { object: { sha: 'basesha' } })
    if (href.includes('/git/refs')) return reply(201, { ref: 'refs/heads/x' })
    if (href.includes('/pulls')) return reply(201, { number: 7, html_url: 'https://github.com/aarohkandy/auros-recipes/pull/7' })
    throw new Error(`the test made an unexpected request to ${href}`)
  }
  return { calls, restore () { globalThis.fetch = real } }
}

/** Exactly what `submit()` builds: the panel's recipe object, the tier id, the optional contact. */
function bodyTheBrowserSends (over = {}) {
  return orderBody(
    {
      recipe: REAL['example-school'],
      tier: 'school',
      contactEmail: 'it@example.org',
      ...over
    },
    'a-token'
  )
}

let net
beforeEach(() => { net = stubNetwork() })
afterEach(() => { net?.restore(); net = null })

describe('the client and the Worker agree about the order', () => {
  test('the endpoint the client posts to is a route this Worker has', () => {
    assert.ok(
      ROUTES.includes(ORDER_ENDPOINT),
      `the configurator posts to ${ORDER_ENDPOINT} and the Worker's routes are ${ROUTES.join(', ')}. ` +
      'A POST to a path the Worker does not own falls through to the static site and is answered by ' +
      'the 404 page, which is what "The order did not go through" used to mean.'
    )
  })

  test('wrangler.jsonc run_worker_first names exactly the routes the Worker handles', () => {
    // Read as text with comments stripped: it is JSONC, and the point is to read the file that
    // actually configures the deploy rather than a copy of its contents kept in a test.
    const text = readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8')
    const stripped = text.replace(/^\s*\/\/.*$/gm, '')
    const config = JSON.parse(stripped)
    assert.deepEqual(
      [...config.assets.run_worker_first].sort(),
      [...ROUTES].sort(),
      'run_worker_first and ROUTES have drifted. Whichever path is missing is served by the static ' +
      'site instead of by the Worker, silently.'
    )
  })

  test('no page on the site may share a path with a Worker route', () => {
    // `/order` was a page AND an endpoint. Cloudflare redirects /order.html to /order, so a visitor
    // following the order page's own canonical link was answered by the POST-only endpoint.
    const pages = readdirSync(new URL('../../src/pages/', import.meta.url))
      .filter(f => /\.(astro|md|mdx|html)$/.test(f))
      .map(f => '/' + f.replace(/\.(astro|md|mdx|html)$/, ''))
    for (const route of ROUTES) {
      assert.ok(
        !pages.includes(route),
        `src/pages${route}.astro exists and ${route} is a Worker route. One of them has to be renamed: ` +
        'the page is unreachable and the endpoint answers readers with a refusal.'
      )
    }
  })

  test('the exact body the browser builds is a body the Worker accepts', async () => {
    const env = baseEnv()
    const request = new Request(`https://auros.dev${ORDER_ENDPOINT}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(bodyTheBrowserSends())
    })
    const res = await worker.fetch(request, env, ctx)
    const body = await res.json()

    assert.equal(res.status, 201, `the Worker refused the client's own payload: ${JSON.stringify(body)}`)
    assert.equal(body.ok, true)
    // And the field the client READS is the field the Worker WRITES. This is the fourth mismatch:
    // the client read `pullRequestUrl` and the Worker has always answered `pullRequest.url`.
    assert.equal(typeof body.pullRequest?.url, 'string', 'the Worker no longer answers pullRequest.url, which is what the client reads')
    assert.match(body.pullRequest.url, /^https:\/\/github\.com\//)
    assert.equal(body.charged, 0)
  })

  test('the optional contact email is sent only when there is one', () => {
    assert.equal(bodyTheBrowserSends({ contactEmail: '' }).contactEmail, undefined,
      'an empty contact must be absent, not an empty string: the Worker treats a present address as one it may use')
    assert.equal(bodyTheBrowserSends().contactEmail, 'it@example.org')
  })

  test('the recipe travels as an object, because that is what the Worker validates', async () => {
    const built = bodyTheBrowserSends()
    assert.equal(typeof built.recipe, 'object', 'the client is sending YAML text again; the Worker has no YAML parser on the way in')
    assert.equal(built.recipe.name, 'example-school')
    assert.equal(typeof built.tier, 'string')
    assert.equal(typeof built.turnstileToken, 'string')
    assert.equal(built.recipeYaml, undefined, 'recipeYaml is the field name from the broken contract')
    assert.equal(built.name, undefined, 'name is the field name from the broken contract')
  })

  test('a POST to the OLD endpoint reaches the static 404, which is the symptom this test names', async () => {
    const env = baseEnv()
    const res = await worker.fetch(new Request('https://auros.dev/api/order', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(bodyTheBrowserSends())
    }), env, ctx)
    assert.equal(res.status, 404)
    assert.equal(net.calls.length, 0, 'nothing may be created by a request the Worker never saw')
  })
})
