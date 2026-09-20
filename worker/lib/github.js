/**
 * GitHub App authentication and the three writes that turn an order into a pull request.
 *
 * Why a GitHub App and not a personal access token: DECISIONS.md D18 established that a repository's
 * own `GITHUB_TOKEN` cannot write to another repository, and a long-lived PAT in a Worker secret is a
 * credential with no expiry, no scope below "repo", and no way to tell whose action a commit was. An
 * installation token expires in an hour, is scoped to one repository, and shows up in the audit log as
 * the app. It costs one JWT.
 *
 * Why WebCrypto and not `node:crypto`: there is no `node:crypto` in a Worker. RS256 is
 * `RSASSA-PKCS1-v1_5` with SHA-256, which WebCrypto has natively, so the JWT is about fifteen lines.
 *
 * **The private key must be PKCS#8.** GitHub hands you a PKCS#1 file — it starts
 * `-----BEGIN RSA PRIVATE KEY-----`. WebCrypto's `importKey` cannot read that format and the error it
 * gives is an unhelpful `DataError`. Convert it once:
 *
 *     openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in app.private-key.pem -out app.pkcs8.pem
 *
 * The converted file starts `-----BEGIN PRIVATE KEY-----`. This is written here as well as in the
 * README because it is the single most likely reason a correct deployment does not work.
 */

const API = 'https://api.github.com'
const UA = 'auros-web-order-flow'

/** GitHub rejects a JWT more than 10 minutes out; 9 leaves room for clock skew without arguing. */
const JWT_LIFETIME_SECONDS = 540

export class GitHubError extends Error {
  /** @param {string} message @param {number} status @param {unknown} [body] */
  constructor (message, status, body) { super(message); this.name = 'GitHubError'; this.status = status; this.body = body }
}

/**
 * @typedef {object} GitHubConfig
 * @property {string} appId
 * @property {string} privateKeyPem       PKCS#8 PEM
 * @property {string} installationId
 * @property {string} owner
 * @property {string} repo
 * @property {KVNamespace} [kv]
 * @property {typeof fetch} [fetchImpl]
 * @property {() => number} [now]         seconds; injectable for tests
 */

/* ------------------------------------------------------------------ JWT */

function b64url (bytes) {
  let s = ''
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  for (const b of arr) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlText (text) { return b64url(new TextEncoder().encode(text)) }

/** PEM -> DER. Rejects PKCS#1 loudly instead of letting importKey fail with `DataError`. */
export function pemToPkcs8 (pem) {
  const trimmed = String(pem).trim().replace(/\\n/g, '\n') // survive a secret pasted with literal \n
  if (/-----BEGIN RSA PRIVATE KEY-----/.test(trimmed)) {
    throw new GitHubError(
      'GITHUB_APP_PRIVATE_KEY is in PKCS#1 format (it begins "BEGIN RSA PRIVATE KEY"), which WebCrypto ' +
      'cannot import. Convert it: openssl pkcs8 -topk8 -nocrypt -in key.pem -out key.pkcs8.pem',
      500
    )
  }
  const body = trimmed.replace(/-----BEGIN [A-Z ]+-----/, '').replace(/-----END [A-Z ]+-----/, '').replace(/\s+/g, '')
  if (!body) throw new GitHubError('GITHUB_APP_PRIVATE_KEY is empty or not a PEM file', 500)
  const raw = atob(body)
  const der = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) der[i] = raw.charCodeAt(i)
  return der
}

/**
 * Sign the app JWT. RS256, per GitHub's requirement.
 * @param {{ appId: string, privateKeyPem: string, now?: () => number }} cfg
 */
export async function mintAppJwt ({ appId, privateKeyPem, now = () => Math.floor(Date.now() / 1000) }) {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const iat = now() - 60 // GitHub's own advice, for their clock being behind ours
  const payload = { iat, exp: iat + JWT_LIFETIME_SECONDS, iss: appId }
  const signingInput = `${b64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64urlText(JSON.stringify(payload))}`
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput))
  return `${signingInput}.${b64url(sig)}`
}

/**
 * An installation token, cached in KV until shortly before it expires.
 *
 * GitHub's installation-token endpoint is itself rate limited, and every SSE viewer reconnecting would
 * mint a new one without this. The cache expires 120 seconds early so a token is never handed out with
 * so little life left that it dies mid-request.
 *
 * @param {GitHubConfig} cfg
 * @returns {Promise<string>}
 */
export async function installationToken (cfg) {
  const { kv, installationId, fetchImpl = fetch, now = () => Math.floor(Date.now() / 1000) } = cfg
  const cacheKey = `gh:inst:${installationId}`
  if (kv) {
    const cached = await kv.get(cacheKey, 'json')
    if (cached && typeof cached.token === 'string' && cached.expiresAt - 120 > now()) return cached.token
  }
  const jwt = await mintAppJwt(cfg)
  const res = await fetchImpl(`${API}/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
    method: 'POST',
    headers: { authorization: `Bearer ${jwt}`, accept: 'application/vnd.github+json', 'user-agent': UA, 'x-github-api-version': '2022-11-28' }
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.token) {
    throw new GitHubError(`could not mint a GitHub installation token (HTTP ${res.status})`, res.status, body)
  }
  if (kv) {
    const expiresAt = Math.floor(new Date(body.expires_at).getTime() / 1000)
    const ttl = Math.max(60, expiresAt - now() - 120) // KV's floor is 60s
    await kv.put(cacheKey, JSON.stringify({ token: body.token, expiresAt }), { expirationTtl: ttl })
  }
  return body.token
}

/* ------------------------------------------------------------------ REST */

/**
 * @param {GitHubConfig} cfg
 * @param {string} path
 * @param {RequestInit} [init]
 * @returns {Promise<{ status: number, body: any, headers: Headers }>}
 */
export async function api (cfg, path, init = {}) {
  const token = await installationToken(cfg)
  const { fetchImpl = fetch } = cfg
  const res = await fetchImpl(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': UA,
      'x-github-api-version': '2022-11-28',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers
    }
  })
  const text = await res.text()
  let body = null
  if (text) { try { body = JSON.parse(text) } catch { body = text } }
  return { status: res.status, body, headers: res.headers }
}

/**
 * Rate-limit state, read off the response headers rather than guessed.
 * @param {Headers} headers
 */
export function rateLimitState (headers) {
  const remaining = Number(headers.get('x-ratelimit-remaining') ?? 'NaN')
  const reset = Number(headers.get('x-ratelimit-reset') ?? 'NaN')
  return {
    remaining: Number.isFinite(remaining) ? remaining : null,
    resetAt: Number.isFinite(reset) ? reset : null,
    retryAfter: Number(headers.get('retry-after') ?? 'NaN') || null
  }
}

/* --------------------------------------------------- the order -> PR path */

/**
 * Create `customers/<name>/recipe.yaml` on a new branch and open a pull request for it.
 *
 * The order of operations matters and it is the same order the installer uses (§4.1, and
 * docs/CONFIGURATOR.md's closing paragraph): **check first, write second.** The name collision is
 * checked before a branch exists, so a rejected order leaves nothing behind at all — no orphan branch
 * for somebody to wonder about later.
 *
 * @param {GitHubConfig} cfg
 * @param {object} order
 * @param {string} order.name          the recipe/folder name, already schema-validated
 * @param {string} order.yaml          the file body
 * @param {string} order.prBody        the `explain` output
 * @param {string} order.prTitle
 * @param {string} order.branch
 * @param {string} [order.baseBranch]
 * @returns {Promise<{ prNumber: number, prUrl: string, branch: string, commitSha: string }>}
 */
export async function openRecipePr (cfg, order) {
  const { owner, repo } = cfg
  const baseBranch = order.baseBranch ?? 'main'
  const path = `customers/${order.name}/recipe.yaml`

  const existing = await api(cfg, `/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(baseBranch)}`)
  if (existing.status === 200) {
    throw new GitHubError(
      `there is already a recipe called "${order.name}". Two recipes with one name means two organisations ` +
      'sharing one image tag, so the name has to be different rather than merged.',
      409
    )
  }
  if (existing.status !== 404) {
    throw new GitHubError(`could not check whether "${order.name}" is taken (HTTP ${existing.status})`, existing.status, existing.body)
  }

  const ref = await api(cfg, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`)
  if (ref.status !== 200 || !ref.body?.object?.sha) {
    throw new GitHubError(`could not read ${baseBranch} (HTTP ${ref.status})`, ref.status, ref.body)
  }

  const created = await api(cfg, `/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${order.branch}`, sha: ref.body.object.sha })
  })
  if (created.status !== 201) {
    throw new GitHubError(`could not create the branch ${order.branch} (HTTP ${created.status})`, created.status, created.body)
  }

  const put = await api(cfg, `/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `order(${order.name}): the recipe, as submitted\n\nWritten by the order flow from the configurator. Nothing has been built and no card has been charged.`,
      content: base64Utf8(order.yaml),
      branch: order.branch
    })
  })
  if (put.status !== 201) {
    throw new GitHubError(`could not write ${path} (HTTP ${put.status})`, put.status, put.body)
  }

  const pr = await api(cfg, `/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({ title: order.prTitle, head: order.branch, base: baseBranch, body: order.prBody, maintainer_can_modify: true })
  })
  if (pr.status !== 201) {
    throw new GitHubError(`the file was committed to ${order.branch} but the pull request could not be opened (HTTP ${pr.status})`, pr.status, pr.body)
  }

  return { prNumber: pr.body.number, prUrl: pr.body.html_url, branch: order.branch, commitSha: put.body?.commit?.sha ?? '' }
}

/** btoa() is Latin-1. A Marathi `first_boot_message` would be mangled by it. */
export function base64Utf8 (text) {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/**
 * The jobs of a workflow run, which is what the build console streams.
 *
 * DECISION-SHEET.md B14: `GET /actions/jobs/{id}/logs` 404s while a job is running and only returns a
 * 60-second redirect once it is finished, so there is no line-level live log to read. Step transitions
 * are what genuinely exists, so step transitions are what we show. The alternative — inventing plausible
 * lines between transitions — is forbidden outright (§7: the console is interesting *because* it is true).
 *
 * @param {GitHubConfig} cfg @param {string|number} runId
 */
export async function runJobs (cfg, runId) {
  return api(cfg, `/repos/${cfg.owner}/${cfg.repo}/actions/runs/${encodeURIComponent(String(runId))}/jobs?per_page=30`)
}

/**
 * The most recent workflow run for a branch, used to find the build belonging to a recipe.
 * @param {GitHubConfig} cfg @param {string} branch
 */
export async function latestRunForBranch (cfg, branch) {
  return api(cfg, `/repos/${cfg.owner}/${cfg.repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=1`)
}
