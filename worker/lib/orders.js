/**
 * The order record: the small amount of state that has to survive between three requests that arrive
 * minutes or days apart — the order, the Stripe webhook, and CI's build result.
 *
 * It lives in KV and it holds no card data, no token and no personal detail beyond the operator
 * contact email the customer typed. Everything else about the order is already public in the pull
 * request, which is the point of the product.
 */

const TTL_SECONDS = 60 * 60 * 24 * 60 // 60 days: long enough for a build that needed a human

/**
 * @typedef {object} OrderRecord
 * @property {string} recipe
 * @property {string} tier
 * @property {number} devices
 * @property {'payment'|'subscription'} mode
 * @property {string} branch
 * @property {number} prNumber
 * @property {string} prUrl
 * @property {string|null} contactEmail
 * @property {string|null} checkoutSessionId
 * @property {string|null} subscriptionId
 * @property {string|null} paymentIntentId
 * @property {'awaiting-checkout'|'card-authenticated'|'billed'|'released'} state
 * @property {string} createdAt
 * @property {string} [settledAt]
 * @property {string} [settledBecause]
 */

/** @param {KVNamespace} kv @param {string} recipe */
export async function getOrder (kv, recipe) {
  return /** @type {OrderRecord|null} */ (await kv.get(`order:${recipe}`, 'json'))
}

/** @param {KVNamespace} kv @param {OrderRecord} record */
export async function putOrder (kv, record) {
  await kv.put(`order:${record.recipe}`, JSON.stringify(record), { expirationTtl: TTL_SECONDS })
  return record
}

/**
 * Merge an update into an existing record.
 *
 * Read-modify-write on KV, which is eventually consistent and has no compare-and-swap. Two writes in
 * the same second can lose one of them. That is survivable for everything stored here *because the
 * decision that matters is not made from this record* — `/build-result` refuses to act twice using its
 * own idempotency key, so a lost merge costs a stale field in an audit trail, never a double charge.
 * If this record ever becomes the thing that decides whether to bill, it has to move to a Durable
 * Object, and that is a rewrite, not a tweak.
 *
 * @param {KVNamespace} kv @param {string} recipe @param {Partial<OrderRecord>} patch
 */
export async function patchOrder (kv, recipe, patch) {
  const existing = await getOrder(kv, recipe)
  if (!existing) return null
  return putOrder(kv, { ...existing, ...patch })
}

/**
 * A once-only marker. Returns true the first time and false every time after, for this exact key.
 *
 * `/build-result` triggers a charge, so "CI retried the callback" and "somebody replayed a captured
 * request" must both land on the same answer: we already did this, and we are not doing it again.
 *
 * @param {KVNamespace} kv @param {string} key @param {unknown} value
 * @returns {Promise<{ first: boolean, existing: any }>}
 */
export async function claimOnce (kv, key, value) {
  const existing = await kv.get(`once:${key}`, 'json')
  if (existing) return { first: false, existing }
  await kv.put(`once:${key}`, JSON.stringify({ at: new Date().toISOString(), value }), { expirationTtl: TTL_SECONDS })
  return { first: true, existing: null }
}
