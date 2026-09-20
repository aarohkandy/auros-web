/**
 * The refusals that protect money and the repository: Turnstile, and the two signed endpoints.
 *
 * These are written the way the abort path in the installer is tested (§6C: "the abort path is tested
 * more than the happy path"). Every test here is a way the system should say no, because the happy
 * path failing is an outage and these failing is a breach.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { verifyTurnstile, ALWAYS_PASSES_TEST_SECRET } from '../lib/turnstile.js'
import { verifySignedPayload, signPayload, hmacSha256Hex, timingSafeEqual, parseSignatureHeader } from '../lib/signature.js'

const SECRET = 'whsec_test_not_a_real_secret'

/** A fetch that fails the test if it is ever called. */
const neverCalled = () => { throw new Error('the network was reached on a path that must refuse before reaching it') }

describe('Turnstile — no token, no POST', () => {
  test('a missing token is refused without ever calling siteverify', async () => {
    const r = await verifyTurnstile({ secret: 'real-secret', token: undefined, remoteIp: '1.2.3.4', idempotencyKey: 'k', fetchImpl: neverCalled })
    assert.equal(r.ok, false)
    assert.equal(r.status, 400)
    assert.match(r.reason, /no Turnstile token/)
  })

  test('an empty token is refused', async () => {
    const r = await verifyTurnstile({ secret: 'real-secret', token: '', remoteIp: '1.2.3.4', idempotencyKey: 'k', fetchImpl: neverCalled })
    assert.equal(r.ok, false)
  })

  test('a non-string token is refused — a JSON object is not a challenge', async () => {
    for (const token of [{}, [], 42, true, null]) {
      const r = await verifyTurnstile({ secret: 'real-secret', token, remoteIp: '1.2.3.4', idempotencyKey: 'k', fetchImpl: neverCalled })
      assert.equal(r.ok, false, `${JSON.stringify(token)} should not be accepted as a token`)
    }
  })

  test('an absent secret refuses; it does not mean "skip the check"', async () => {
    const r = await verifyTurnstile({ secret: undefined, token: 'looks-fine', remoteIp: '1.2.3.4', idempotencyKey: 'k', fetchImpl: neverCalled })
    assert.equal(r.ok, false)
    assert.equal(r.status, 503)
  })

  test('the always-passes TEST secret is refused in production', async () => {
    const r = await verifyTurnstile({
      secret: ALWAYS_PASSES_TEST_SECRET,
      token: 'anything',
      remoteIp: '1.2.3.4',
      idempotencyKey: 'k',
      environment: 'production',
      fetchImpl: neverCalled
    })
    assert.equal(r.ok, false)
    assert.match(r.reason, /TEST secret/)
  })

  test('the test secret is allowed to work in development, where that is the point', async () => {
    const r = await verifyTurnstile({
      secret: ALWAYS_PASSES_TEST_SECRET,
      token: 'anything',
      remoteIp: '1.2.3.4',
      idempotencyKey: 'k',
      environment: 'development',
      fetchImpl: async () => ({ json: async () => ({ success: true, hostname: 'localhost' }) })
    })
    assert.equal(r.ok, true)
  })

  test('siteverify saying no is a no', async () => {
    const r = await verifyTurnstile({
      secret: 'real-secret',
      token: 'stale',
      remoteIp: '1.2.3.4',
      idempotencyKey: 'k',
      fetchImpl: async () => ({ json: async () => ({ success: false, 'error-codes': ['timeout-or-duplicate'] }) })
    })
    assert.equal(r.ok, false)
    assert.equal(r.status, 403)
    assert.match(r.reason, /already used or has expired/)
  })

  test('Turnstile being unreachable is a refusal, not permission to proceed', async () => {
    const r = await verifyTurnstile({
      secret: 'real-secret',
      token: 'fine',
      remoteIp: '1.2.3.4',
      idempotencyKey: 'k',
      fetchImpl: async () => { throw new Error('network down') }
    })
    assert.equal(r.ok, false)
    assert.equal(r.status, 503)
  })

  test('the token is sent to siteverify along with the idempotency key', async () => {
    let captured = null
    await verifyTurnstile({
      secret: 'real-secret',
      token: 'the-token',
      remoteIp: '9.9.9.9',
      idempotencyKey: 'idem-123',
      fetchImpl: async (_url, init) => { captured = init.body; return { json: async () => ({ success: true }) } }
    })
    assert.equal(captured.get('response'), 'the-token')
    assert.equal(captured.get('secret'), 'real-secret')
    assert.equal(captured.get('remoteip'), '9.9.9.9')
    assert.equal(captured.get('idempotency_key'), 'idem-123')
  })
})

describe('signed endpoints — /stripe-webhook and /build-result', () => {
  const body = '{"outcome":"pass","recipe":"hopelink","run_id":123}'

  test('a correctly signed payload is accepted', async () => {
    const now = 1_800_000_000
    const header = await signPayload(SECRET, body, now)
    const r = await verifySignedPayload({ secret: SECRET, header, body, now })
    assert.equal(r.ok, true)
  })

  test('a missing secret refuses everything — it never means "skip"', async () => {
    const header = await signPayload(SECRET, body, 1_800_000_000)
    const r = await verifySignedPayload({ secret: undefined, header, body, now: 1_800_000_000 })
    assert.equal(r.ok, false)
    assert.equal(r.status, 503)
    assert.match(r.reason, /refuses every request/)
  })

  test('a missing header is refused', async () => {
    const r = await verifySignedPayload({ secret: SECRET, header: null, body })
    assert.equal(r.ok, false)
    assert.equal(r.status, 400)
  })

  test('a malformed header is refused', async () => {
    for (const header of ['', 'garbage', 't=123', 'v1=abc', 't=notanumber,v1=abc']) {
      const r = await verifySignedPayload({ secret: SECRET, header, body })
      assert.equal(r.ok, false, `"${header}" should not parse as a signature`)
    }
  })

  test('a tampered body is refused — one character is enough', async () => {
    const now = 1_800_000_000
    const header = await signPayload(SECRET, body, now)
    const tampered = body.replace('"pass"', '"PASS"')
    const r = await verifySignedPayload({ secret: SECRET, header, body: tampered, now })
    assert.equal(r.ok, false)
    assert.equal(r.status, 401)
  })

  test('changing the outcome from fail to pass is refused', async () => {
    const now = 1_800_000_000
    const honest = '{"outcome":"fail","recipe":"hopelink","run_id":123}'
    const header = await signPayload(SECRET, honest, now)
    const forged = '{"outcome":"pass","recipe":"hopelink","run_id":123}'
    const r = await verifySignedPayload({ secret: SECRET, header, body: forged, now })
    assert.equal(r.ok, false, 'this is the exact attack: a captured failing result, edited to bill the customer')
  })

  test('a signature from the wrong secret is refused', async () => {
    const now = 1_800_000_000
    const header = await signPayload('some-other-secret', body, now)
    const r = await verifySignedPayload({ secret: SECRET, header, body, now })
    assert.equal(r.ok, false)
  })

  test('a replay from yesterday is refused', async () => {
    const signedAt = 1_800_000_000
    const header = await signPayload(SECRET, body, signedAt)
    const r = await verifySignedPayload({ secret: SECRET, header, body, now: signedAt + 86_400 })
    assert.equal(r.ok, false)
    assert.match(r.reason, /tolerance/)
  })

  test('a signature from the future is refused too', async () => {
    const signedAt = 1_800_000_000
    const header = await signPayload(SECRET, body, signedAt + 3600)
    const r = await verifySignedPayload({ secret: SECRET, header, body, now: signedAt })
    assert.equal(r.ok, false)
  })

  test('a signature just inside the tolerance is accepted', async () => {
    const signedAt = 1_800_000_000
    const header = await signPayload(SECRET, body, signedAt)
    assert.equal((await verifySignedPayload({ secret: SECRET, header, body, now: signedAt + 299 })).ok, true)
    assert.equal((await verifySignedPayload({ secret: SECRET, header, body, now: signedAt + 301 })).ok, false)
  })

  test('several v1 values are accepted, as Stripe sends during a secret rotation', async () => {
    const now = 1_800_000_000
    const good = await hmacSha256Hex(SECRET, `${now}.${body}`)
    const header = `t=${now},v1=${'0'.repeat(64)},v1=${good}`
    assert.equal((await verifySignedPayload({ secret: SECRET, header, body, now })).ok, true)
  })

  test('the timestamp is part of what is signed, so it cannot be edited on its own', async () => {
    const signedAt = 1_800_000_000
    const header = await signPayload(SECRET, body, signedAt)
    const moved = header.replace(`t=${signedAt}`, `t=${signedAt + 200}`)
    const r = await verifySignedPayload({ secret: SECRET, header: moved, body, now: signedAt + 200 })
    assert.equal(r.ok, false, 'moving the timestamp to dodge the replay window must invalidate the signature')
  })

  test('parseSignatureHeader keeps every v1 and requires a t', () => {
    assert.equal(parseSignatureHeader('v1=abc'), null)
    assert.deepEqual(parseSignatureHeader('t=5,v1=a,v1=b'), { t: 5, v1: ['a', 'b'] })
  })

  test('the comparison is length-safe and value-correct', () => {
    assert.equal(timingSafeEqual('abc', 'abc'), true)
    assert.equal(timingSafeEqual('abc', 'abd'), false)
    assert.equal(timingSafeEqual('abc', 'abcd'), false)
    assert.equal(timingSafeEqual('abc', undefined), false)
    assert.equal(timingSafeEqual(null, null), false)
  })
})
