/**
 * Turnstile verification.
 *
 * The rule from §6D and docs/CONFIGURATOR.md is one sentence and it has no exceptions in it:
 *
 *     No token, no POST.
 *
 * There is deliberately no `SKIP_TURNSTILE`, no `DEV_MODE`, no "allow if the secret is unset". Those
 * flags exist in every codebase that has one and they are all in production. `/order` writes to a
 * public repository under our name; the only thing standing between that and a script is this check,
 * so the check does not have an off switch. If the secret is missing the endpoint refuses — being
 * unavailable is a bad morning, and being an open PR-creation endpoint on a public repo is a bad year.
 */

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/**
 * Cloudflare's documented always-passes secret. Useful locally; catastrophic in production, because it
 * makes the paragraph above a lie while every log line still says "turnstile ok".
 * DECISION-SHEET.md pins it so nobody has to guess which of the test keys is which.
 */
export const ALWAYS_PASSES_TEST_SECRET = '1x0000000000000000000000000000000AA'

/** @typedef {{ ok: true, hostname: string|null, action: string|null } | { ok: false, reason: string, status: number, codes?: string[] }} TurnstileResult */

/**
 * @param {object} args
 * @param {string|undefined} args.secret
 * @param {unknown} args.token           whatever the client sent; treated as untrusted
 * @param {string} args.remoteIp
 * @param {string} args.idempotencyKey   so a retried order does not burn the token twice
 * @param {string} [args.environment]    'production' unless the deploy says otherwise
 * @param {typeof fetch} [args.fetchImpl]
 * @returns {Promise<TurnstileResult>}
 */
export async function verifyTurnstile ({ secret, token, remoteIp, idempotencyKey, environment = 'production', fetchImpl = fetch }) {
  if (!secret) {
    return { ok: false, status: 503, reason: 'this deployment has no Turnstile secret, so it cannot tell a person from a script and will not create anything' }
  }
  if (secret === ALWAYS_PASSES_TEST_SECRET && environment === 'production') {
    // The test secret accepts every token. Shipping it would leave the endpoint open while every
    // check in the logs still reads as a pass — the worst shape a failure can have.
    return { ok: false, status: 503, reason: 'this deployment is configured with the Turnstile TEST secret, which accepts everything. Refusing rather than pretending to be protected.' }
  }
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
    return { ok: false, status: 400, reason: 'no Turnstile token was sent. Every order needs one — there is no path through this endpoint without it.' }
  }

  const form = new FormData()
  form.append('secret', secret)
  form.append('response', token)
  if (remoteIp && remoteIp !== 'unknown') form.append('remoteip', remoteIp)
  form.append('idempotency_key', idempotencyKey)

  let payload
  try {
    const res = await fetchImpl(SITEVERIFY, { method: 'POST', body: form })
    payload = await res.json()
  } catch (e) {
    // Cloudflare being unreachable is not permission to proceed. It is a reason to fail.
    return { ok: false, status: 503, reason: `could not reach Turnstile to check the token (${e instanceof Error ? e.message : String(e)}), so nothing was created` }
  }

  if (payload?.success !== true) {
    const codes = Array.isArray(payload?.['error-codes']) ? payload['error-codes'] : []
    return { ok: false, status: 403, codes, reason: humanCode(codes) }
  }
  return { ok: true, hostname: payload.hostname ?? null, action: payload.action ?? null }
}

/** Turnstile's error codes, said in a way a visitor can act on. @param {string[]} codes */
function humanCode (codes) {
  if (codes.includes('timeout-or-duplicate')) {
    return 'that challenge was already used or has expired. Reload the page and try again — nothing was created.'
  }
  if (codes.includes('invalid-input-response')) {
    return 'the challenge did not check out. Reload the page and try again.'
  }
  if (codes.includes('invalid-input-secret') || codes.includes('missing-input-secret')) {
    return 'this deployment\'s Turnstile configuration is wrong. That is our fault, not yours, and nothing was created.'
  }
  return `the challenge did not check out${codes.length ? ` (${codes.join(', ')})` : ''}. Nothing was created.`
}
