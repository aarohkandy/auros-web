/**
 * The order request: the one place the browser's payload is built.
 *
 * WHY THIS IS ITS OWN FILE, WITH NO IMPORTS
 * The submit path was wrong three times in thirty lines — wrong URL, wrong body, wrong response
 * field — which is what "never run end to end" looks like from the outside. 205 Worker tests passed
 * and not one of them asserted that the client's payload was a payload the Worker accepts, because
 * the client lives in an Astro/TypeScript module the Worker's `node --test` suite cannot import.
 *
 * So the payload builder moved here: no framework, no extensionless imports, nothing but two
 * constants and a pure function. `worker/test/client-contract.test.js` imports THIS FILE by path and
 * runs the body it produces through the real `worker.fetch`. The test cannot pass unless the code the
 * browser ships and the code the server runs agree.
 */

/**
 * Where the order goes.
 *
 * `/order-submit`, and the extra word is load-bearing. It is not `/api/order` — the Worker has never
 * had that route, so the POST fell through to the static 404 page and every visitor was told the
 * order did not go through. It is not `/order` either: that is a PAGE on this site
 * (`src/pages/order.astro`), and Cloudflare's asset handling redirects `/order.html` to `/order`, so
 * an endpoint on that path would be handed the page's own canonical URL and answer a reader with
 * `{"ok":false,"refused":"anything but a POST to this endpoint"}`.
 *
 * `worker/index.js` ROUTES and `wrangler.jsonc` run_worker_first must contain this exact string;
 * `worker/test/client-contract.test.js` asserts all three agree.
 */
export const ORDER_ENDPOINT = "/order-submit";

/** What the form knows about this order, gathered once so the submit path reads it one way. */
export type OrderAnswers = {
  /** The recipe as an OBJECT. The Worker validates JSON with the schema; it does not parse YAML. */
  recipe: Record<string, unknown>;
  /** The tier id from `lib/pricing`, e.g. "school". The Worker re-derives and cross-checks it. */
  tier: string | null;
  /** Optional. The one answer on the page that does not end up in the public file. */
  contactEmail: string;
};

/**
 * The exact JSON body `POST /order-submit` accepts.
 *
 * `routes/order.js` requires `recipe` (an object), `tier` and `turnstileToken`, and 422s otherwise.
 * `contactEmail` is optional and is used for the Checkout customer and the operator's reply.
 */
export function orderBody(answers: OrderAnswers, token: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    recipe: answers.recipe,
    tier: answers.tier ?? "",
    turnstileToken: token,
  };
  // Only when there is one. The Worker treats a missing contact as "no email"; an empty string would
  // be a different thing — an address it could try to use.
  if (answers.contactEmail) body.contactEmail = answers.contactEmail;
  return body;
}
