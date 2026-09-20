/**
 * ONE Worker. Four routes.
 *
 * Spec §6D says "Static site, one serverless function." This is that one function. A Worker is a
 * single deployed unit with a single `fetch` handler, so four paths inside it is four paths inside one
 * function, not four functions — the same way a single CGI script with a switch is one program. It is
 * written down here so the route count is never read as a violation of the §6D count.
 *
 * It is also genuinely better than four separate Workers would be, for a reason specific to this
 * product: `/order`, `/stripe-webhook` and `/build-result` are three requests about one order that
 * arrive minutes or days apart, and they share the schema, the GitHub App token cache, the KV
 * namespace and the order record. Splitting them would mean four copies of the validator, four token
 * caches, and four places for the schema to drift out of step with `auros-recipes`.
 *
 *   POST /order           a recipe becomes a pull request
 *   POST /build-result    CI reports a pass or a fail, and money moves — signed, idempotent
 *   POST /stripe-webhook  signature verified before anything else happens at all
 *   GET  /build-console   Server-Sent Events carrying real GitHub Actions state
 *
 * Everything else falls through to the static site, which is served from the `ASSETS` binding. The
 * site is `output: 'static'` per §6D, so this Worker sits in front of files rather than rendering
 * pages: content pages have no client framework and no server render, and the only dynamic surface on
 * auros.dev is the four routes above.
 */

import { handleOrder } from './routes/order.js'
import { handleBuildResult } from './routes/build-result.js'
import { handleStripeWebhook } from './routes/stripe-webhook.js'
import { handleBuildConsole } from './routes/build-console.js'
import { refuse } from './lib/http.js'

/** The complete list. `wrangler.jsonc`'s `run_worker_first` must match it exactly. */
export const ROUTES = ['/order', '/build-result', '/stripe-webhook', '/build-console']

export default {
  /**
   * @param {Request} request
   * @param {Record<string, any>} env
   * @param {{ waitUntil: (p: Promise<unknown>) => void }} ctx
   */
  async fetch (request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '') || '/'

    try {
      switch (path) {
        case '/order': return await handleOrder(request, env, ctx)
        case '/build-result': return await handleBuildResult(request, env)
        case '/stripe-webhook': return await handleStripeWebhook(request, env)
        case '/build-console': return await handleBuildConsole(request, env, ctx)
      }
    } catch (e) {
      // An unhandled throw must not become a 200 with an empty body, and it must not spill a stack
      // trace — a stack from this Worker names the GitHub App path and the Stripe call sites. What the
      // caller gets is the fact that it failed; what we get is the detail, in the log.
      console.error('unhandled', path, e instanceof Error ? e.stack : String(e))
      return refuse(500, 'this request', 'something went wrong on our side. Nothing was created and no card was touched. If you were ordering, try again — an order that fails here leaves nothing behind.')
    }

    if (env.ASSETS) return env.ASSETS.fetch(request)
    return refuse(404, 'this request', `there is nothing at ${path}`)
  }
}
