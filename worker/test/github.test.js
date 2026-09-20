/**
 * GitHub App authentication.
 *
 * The RS256 JWT is the part of this Worker with the least margin for a plausible-looking mistake: it
 * runs with no `node:crypto` available, it fails with an error message that names nothing useful, and
 * when it is wrong the symptom is a 401 from GitHub that looks like a permissions problem. So it gets
 * its own tests, against a real key, checking the claims GitHub actually validates.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, createVerify } from 'node:crypto'
import { mintAppJwt, pemToPkcs8, installationToken, base64Utf8, rateLimitState, GitHubError } from '../lib/github.js'

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
})

const fromB64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

describe('the app JWT', () => {
  test('is RS256 and verifies against the key that signed it', async () => {
    const jwt = await mintAppJwt({ appId: '1234', privateKeyPem: privateKey, now: () => 1_800_000_000 })
    const [h, p, s] = jwt.split('.')
    assert.deepEqual(JSON.parse(fromB64url(h).toString()), { alg: 'RS256', typ: 'JWT' })

    const verifier = createVerify('RSA-SHA256')
    verifier.update(`${h}.${p}`)
    assert.equal(verifier.verify(publicKey, fromB64url(s)), true, 'the signature must verify as RSASSA-PKCS1-v1_5 over SHA-256, which is what RS256 means')
  })

  test('backdates iat and stays inside GitHub\'s ten-minute ceiling', async () => {
    const now = 1_800_000_000
    const jwt = await mintAppJwt({ appId: '1234', privateKeyPem: privateKey, now: () => now })
    const claims = JSON.parse(fromB64url(jwt.split('.')[1]).toString())
    assert.equal(claims.iss, '1234')
    assert.equal(claims.iat, now - 60, 'GitHub\'s own advice, for their clock being behind ours')
    assert.ok(claims.exp - claims.iat < 600, 'GitHub rejects a JWT more than ten minutes out')
    assert.ok(claims.exp > now, 'and it has to still be valid when it arrives')
  })
})

describe('the private key format, which is the usual reason a correct deployment fails', () => {
  test('a PKCS#1 key is rejected with the openssl command that fixes it', () => {
    const { privateKey: pkcs1 } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' }
    })
    assert.throws(
      () => pemToPkcs8(pkcs1),
      (e) => e instanceof GitHubError && /openssl pkcs8 -topk8/.test(e.message),
      'WebCrypto cannot import PKCS#1 and says only "DataError" — the error has to name the fix'
    )
  })

  test('a key pasted with literal backslash-n survives', async () => {
    const mangled = privateKey.replace(/\n/g, '\\n')
    const jwt = await mintAppJwt({ appId: '1', privateKeyPem: mangled, now: () => 1_800_000_000 })
    assert.equal(jwt.split('.').length, 3)
  })

  test('an empty key is refused clearly', () => {
    assert.throws(() => pemToPkcs8('   '), /empty or not a PEM/)
  })
})

describe('the installation token cache', () => {
  function kv () {
    const store = new Map()
    return { store, async get (k, t) { const v = store.get(k); return v === undefined ? null : (t === 'json' ? JSON.parse(v) : v) }, async put (k, v) { store.set(k, v) } }
  }

  const cfg = (over = {}) => ({ appId: '1', privateKeyPem: privateKey, installationId: '99', owner: 'o', repo: 'r', ...over })

  test('a token is minted once and reused', async () => {
    let mints = 0
    const store = kv()
    const fetchImpl = async () => { mints++; return { ok: true, status: 201, async json () { return { token: 'ghs_1', expires_at: new Date(Date.now() + 3600_000).toISOString() } } } }
    const c = cfg({ kv: store, fetchImpl })
    assert.equal(await installationToken(c), 'ghs_1')
    assert.equal(await installationToken(c), 'ghs_1')
    assert.equal(mints, 1, 'every SSE viewer reconnecting would otherwise mint a new token and burn the rate limit')
  })

  test('a token about to expire is not handed out', async () => {
    const store = kv()
    store.store.set('gh:inst:99', JSON.stringify({ token: 'ghs_stale', expiresAt: Math.floor(Date.now() / 1000) + 30 }))
    const fetchImpl = async () => ({ ok: true, status: 201, async json () { return { token: 'ghs_fresh', expires_at: new Date(Date.now() + 3600_000).toISOString() } } })
    assert.equal(await installationToken(cfg({ kv: store, fetchImpl })), 'ghs_fresh', 'a token with 30 seconds left can die mid-request')
  })

  test('a refused mint throws rather than returning undefined', async () => {
    const fetchImpl = async () => ({ ok: false, status: 401, async json () { return { message: 'Bad credentials' } } })
    await assert.rejects(() => installationToken(cfg({ fetchImpl })), /could not mint a GitHub installation token/)
  })
})

describe('small things that are wrong by default', () => {
  test('base64 of non-Latin-1 text is not mangled', () => {
    const marathi = 'सुरू करण्यासाठी स्क्रीनला स्पर्श करा'
    assert.equal(Buffer.from(base64Utf8(marathi), 'base64').toString('utf8'), marathi, 'btoa() is Latin-1; a Marathi first_boot_message would be destroyed by it')
  })

  test('rate-limit headers are read, not guessed', () => {
    const s = rateLimitState(new Headers({ 'x-ratelimit-remaining': '12', 'x-ratelimit-reset': '1800000000' }))
    assert.equal(s.remaining, 12)
    assert.equal(s.resetAt, 1_800_000_000)
    assert.deepEqual(rateLimitState(new Headers()), { remaining: null, resetAt: null, retryAfter: null })
  })
})
