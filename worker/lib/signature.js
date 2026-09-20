/**
 * Signature verification, shared by `/stripe-webhook` and `/build-result`.
 *
 * Both endpoints have the same property: a caller who can forge a request can move money. Stripe's
 * scheme is the one we copy for our own endpoint, not because it is clever but because it is boring and
 * already thought through — a timestamp inside the signed payload, so a captured request cannot be
 * replayed tomorrow, and a constant-time comparison, so the signature cannot be discovered a byte at a
 * time by timing the rejection.
 *
 * Everything here returns a REASON on failure rather than a boolean, because "rejected" and "rejected
 * because the secret is not configured" are different operational facts and collapsing them into
 * `false` is how a misconfigured deploy looks identical to an attack.
 */

const encoder = new TextEncoder()

/** @typedef {{ ok: true } | { ok: false, reason: string, status: number }} VerifyResult */

/**
 * Parse a `t=<unix>,v1=<hex>` header. Stripe sends several `v1=` values during a secret rotation, so
 * all of them are returned and any one matching is enough.
 * @param {string|null} header
 */
export function parseSignatureHeader (header) {
  if (!header) return null
  /** @type {{ t: number|null, v1: string[] }} */
  const out = { t: null, v1: [] }
  for (const part of header.split(',')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const k = part.slice(0, i).trim()
    const v = part.slice(i + 1).trim()
    if (k === 't') out.t = Number(v)
    else if (k === 'v1') out.v1.push(v)
  }
  if (out.t === null || !Number.isFinite(out.t) || out.v1.length === 0) return null
  return out
}

/**
 * @param {object} args
 * @param {string|null|undefined} args.secret        the signing secret; absent means refuse, never allow
 * @param {string|null} args.header                  the raw signature header
 * @param {string} args.body                         the EXACT bytes received, before any JSON.parse
 * @param {number} [args.toleranceSeconds]
 * @param {number} [args.now]                        injectable so the replay window is testable
 * @returns {Promise<VerifyResult>}
 */
export async function verifySignedPayload ({ secret, header, body, toleranceSeconds = 300, now = Math.floor(Date.now() / 1000) }) {
  if (!secret) {
    // A missing secret is a configuration failure, and the only safe reading of a configuration
    // failure on an endpoint that can charge a card is "refuse everything". There is no mode where an
    // unset secret means "skip the check" — that mode is how staging flags reach production.
    return { ok: false, reason: 'this endpoint has no signing secret configured, so it cannot authenticate anything and refuses every request', status: 503 }
  }
  const parsed = parseSignatureHeader(header)
  if (!parsed) return { ok: false, reason: 'missing or malformed signature header', status: 400 }
  if (Math.abs(now - parsed.t) > toleranceSeconds) {
    return { ok: false, reason: `signature timestamp is outside the ${toleranceSeconds}s tolerance — a replayed or clock-skewed request`, status: 400 }
  }
  const expected = await hmacSha256Hex(secret, `${parsed.t}.${body}`)
  for (const candidate of parsed.v1) {
    if (timingSafeEqual(candidate, expected)) return { ok: true }
  }
  return { ok: false, reason: 'signature does not match', status: 401 }
}

/**
 * @param {string} secret
 * @param {string} payload
 * @returns {Promise<string>} lowercase hex
 */
export async function hmacSha256Hex (secret, payload) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Build the header a caller should send. Exported so CI can sign its `/build-result` call with the
 * same code the Worker verifies it with — the two sides of a signature agreeing by construction rather
 * than by both reading the same paragraph of a README.
 * @param {string} secret @param {string} body @param {number} [now]
 */
export async function signPayload (secret, body, now = Math.floor(Date.now() / 1000)) {
  const t = Math.floor(now)
  return `t=${t},v1=${await hmacSha256Hex(secret, `${t}.${body}`)}`
}

/**
 * Constant time for equal-length inputs. Length is allowed to leak: the length of a hex SHA-256 is 64
 * and everybody already knows that.
 * @param {string} a @param {string} b
 */
export function timingSafeEqual (a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
