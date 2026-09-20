/**
 * Turnstile verification.
 *
 * The rule from §6D and docs/CONFIGURATOR.md is one sentence and it has no exceptions in it:
 *
 *     No token, no POST.
 *
 * There is deliberately no `SKIP_TURNSTILE`, no `DEV_MODE`, no "allow if the secret is unset". Those
 * flags exist in every codebase that has one and they are all in production. `/order-submit` writes to
 * a public repository under our name; the only thing standing between that and a script is this check,
 * so the check does not have an off switch. If the secret is missing the endpoint refuses — being
 * unavailable is a bad morning, and being an open PR-creation endpoint on a public repo is a bad year.
 *
 * The one local affordance — Cloudflare's always-passes test secret — is keyed on the ABSENCE OF
 * PRODUCTION INFRASTRUCTURE rather than on a string. See `testSecretIsPermissible` below.
 */

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/**
 * Cloudflare's documented always-passes secret. Useful locally; catastrophic anywhere else, because it
 * makes the paragraph above a lie while every log line still says "turnstile ok".
 * DECISION-SHEET.md pins it so nobody has to guess which of the test keys is which.
 */
export const ALWAYS_PASSES_TEST_SECRET = '1x0000000000000000000000000000000AA'

/**
 * The hostnames on which the test secret is allowed. A loopback host is not a policy decision that
 * somebody can get wrong in a dashboard; it is a fact about where the request arrived.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0'])

/**
 * Is this deployment allowed to use the always-passes secret?
 *
 * This used to be keyed on `env.ENVIRONMENT !== 'production'`, which is one plain, non-secret variable
 * away from an open pull-request-creation endpoint on a public repository — and a preview or staging
 * deployment is precisely where somebody sets a variable like that. The key is now two facts that a
 * deployment cannot have by accident:
 *
 *   1. the request arrived on a loopback host, so nobody on the internet is talking to it, AND
 *   2. it has no GitHub App private key, so even if they were, there is nothing it could create.
 *
 * Both, not either. A wrangler dev session satisfies both and keeps working. A deployed preview
 * satisfies neither — it has a real hostname — and refuses, which is the entire point: the escape
 * hatch is now shaped like the absence of production infrastructure rather than like a string.
 *
 * @param {string|undefined} requestHost
 * @param {boolean} canReachGitHub
 */
export function testSecretIsPermissible (requestHost, canReachGitHub) {
  if (canReachGitHub) return false
  if (typeof requestHost !== 'string' || requestHost.length === 0) return false
  const host = requestHost.toLowerCase().replace(/^\[|\]$/g, '')
  return LOCAL_HOSTS.has(host) || LOCAL_HOSTS.has(`[${host}]`)
}

/** @typedef {{ ok: true, hostname: string|null, action: string|null } | { ok: false, reason: string, status: number, codes?: string[] }} TurnstileResult */

/**
 * @param {object} args
 * @param {string|undefined} args.secret
 * @param {unknown} args.token           whatever the client sent; treated as untrusted
 * @param {string} args.remoteIp
 * @param {string} args.idempotencyKey   so a retried order does not burn the token twice
 * @param {string} [args.requestHost]     the host this request actually arrived on
 * @param {boolean} [args.canReachGitHub] whether this deployment holds a GitHub App key
 * @param {typeof fetch} [args.fetchImpl]
 * @returns {Promise<TurnstileResult>}
 */
export async function verifyTurnstile ({ secret, token, remoteIp, idempotencyKey, requestHost, canReachGitHub = true, fetchImpl = fetch }) {
  if (!secret) {
    return { ok: false, status: 503, reason: 'this deployment has no Turnstile secret, so it cannot tell a person from a script and will not create anything' }
  }
  if (secret === ALWAYS_PASSES_TEST_SECRET && !testSecretIsPermissible(requestHost, canReachGitHub)) {
    // The test secret accepts every token. Shipping it would leave the endpoint open while every
    // check in the logs still reads as a pass — the worst shape a failure can have.
    return { ok: false, status: 503, reason: 'this deployment is configured with the Turnstile TEST secret, which accepts everything, and it is reachable on a real hostname or holds a GitHub App key. Refusing rather than pretending to be protected.' }
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
