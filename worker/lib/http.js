/**
 * Small HTTP helpers. No framework — a router with four routes does not need one, and a dependency
 * here is a dependency inside the thing that opens pull requests and ends Stripe trials.
 */

/**
 * @param {unknown} body
 * @param {number} [status]
 * @param {Record<string,string>} [headers]
 */
export function json (body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body, null, 2) + '\n', {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // This is an API for one first-party form. A browser on another origin has no business reading
      // these responses, so there is no CORS header here at all — the absence is the policy.
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      ...headers
    }
  })
}

/**
 * The refusal shape. Every "no" from this Worker says what was refused and why in the same words a
 * person would use, because the configurator renders it directly to the visitor.
 * @param {number} status
 * @param {string} refused   what we would not do
 * @param {string} because   why, in a sentence
 * @param {Record<string, unknown>} [extra]
 */
export function refuse (status, refused, because, extra = {}) {
  return json({ ok: false, refused, because, ...extra }, status)
}

/**
 * Read a request body with a hard byte ceiling.
 *
 * `await request.text()` on an unbounded body is a way to be billed for somebody else's afternoon, and
 * a 40 MB string is also the cheapest way to make the JSON parser and every regex in the validator the
 * slowest part of the request. The limit is checked against what actually arrives, not against
 * `content-length`, which the client chooses.
 *
 * @param {Request} request
 * @param {number} maxBytes
 * @returns {Promise<{ ok: true, text: string } | { ok: false, reason: string }>}
 */
export async function readBounded (request, maxBytes) {
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, reason: `the body is ${declared} bytes and the limit is ${maxBytes}` }
  }
  const reader = request.body?.getReader()
  if (!reader) return { ok: true, text: '' }
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      return { ok: false, reason: `the body is larger than the ${maxBytes} byte limit` }
    }
    chunks.push(value)
  }
  const joined = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) { joined.set(c, offset); offset += c.byteLength }
  return { ok: true, text: new TextDecoder('utf-8', { fatal: false }).decode(joined) }
}

/**
 * A KV-backed fixed-window rate limit.
 *
 * Coarse on purpose. It is not trying to be a WAF — Turnstile is what stops a bot, and this is what
 * stops one solved challenge being reused to open two hundred pull requests in a public repository
 * while somebody is asleep.
 *
 * @param {KVNamespace} kv
 * @param {string} key
 * @param {number} limit
 * @param {number} windowSeconds
 * @returns {Promise<{ allowed: boolean, count: number }>}
 */
export async function rateLimit (kv, key, limit, windowSeconds) {
  const window = Math.floor(Date.now() / 1000 / windowSeconds)
  const k = `rl:${key}:${window}`
  const current = Number((await kv.get(k)) ?? '0')
  if (current >= limit) return { allowed: false, count: current }
  // Read-modify-write, so two simultaneous requests can both read the same value and the limit can
  // overshoot by the number of requests in flight. For "five orders an hour" that is not worth a
  // Durable Object; if this ever guards something where an exact count matters, it must become one.
  await kv.put(k, String(current + 1), { expirationTtl: Math.max(60, windowSeconds * 2) })
  return { allowed: true, count: current + 1 }
}

/** @param {Request} request */
export function clientIp (request) {
  return request.headers.get('cf-connecting-ip') ?? 'unknown'
}

/**
 * Parse JSON without letting a malformed body become a 500.
 * @param {string} text
 */
export function parseJson (text) {
  try { return { ok: /** @type {const} */ (true), value: JSON.parse(text) } } catch (e) {
    return { ok: /** @type {const} */ (false), reason: `the body is not valid JSON: ${e instanceof Error ? e.message : String(e)}` }
  }
}
