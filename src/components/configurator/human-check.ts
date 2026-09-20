/**
 * THE HUMAN CHECK, AND WHY IT IS ON.
 *
 * Spec §6D wants a stranger to configure a build, press the button, and get a pull request in
 * `auros-recipes`. The Worker will not accept a POST without a verified Turnstile token
 * (`worker/lib/turnstile.js`), and Turnstile's widget is delivered by
 * `https://challenges.cloudflare.com/turnstile/v0/api.js`.
 *
 * Spec §4.5 permitted **no script host on the public site other than cdnjs**, so for a while this
 * repository shipped half the arrangement: a `<div class="cf-turnstile">` that nothing ever
 * hydrated. It rendered as a permanently empty box, the client read `[name="cf-turnstile-response"]`,
 * found nothing, and told every single visitor that the check "has not completed" — copy describing
 * an exceptional state that was in fact the only state. Then it shipped the honest interim: no
 * widget, and a paragraph saying the check was not deployed.
 *
 * **DECISIONS.md D33 settles it.** §4.5 now names exactly one exempt endpoint — that one URL, on the
 * configurator page only — and the reasoning, plus what the exemption explicitly is not, is there.
 * B11 is closed. So the check is deployed, and the two halves that must never drift apart both ship
 * in the same place:
 *
 *   1. the loader, in `AnswerForm.astro`, with `render=explicit`; and
 *   2. `turnstile.render()` in `configurator.client.ts`, called AFTER the form template is cloned
 *      into the document. The implicit renderer scans for `.cf-turnstile` once, when `api.js` runs,
 *      and our widget does not exist yet at that moment — which is why adding the script alone
 *      would have fixed nothing.
 *
 * `tools/configurator-a11y.test.mjs` asserts all of it: no empty widget without a loader, no loader
 * from a host §4.5 does not name, and no loader without `render=explicit`.
 */

/**
 * Is the human check actually deployed and loading on this site?
 *
 * `true` since D33, set in the same change that added the loader and the explicit render. On its own
 * it changes nothing but the copy, which is the point: the copy is the part that was lying. If it
 * ever goes back to `false`, the widget stops rendering and the page says so — it does not go back
 * to an empty box that the client then reads a token out of.
 */
export const HUMAN_CHECK_DEPLOYED = true;

/**
 * Cloudflare's published TEST sitekey (DECISION-SHEET.md), which always passes and is never a live
 * key. It is the DEFAULT for `AnswerForm`'s `sitekey` prop, not a hardcoded constant in the markup:
 * a live sitekey is not a secret, but it is deployment configuration, and configuration that exists
 * only as a literal inside a component is configuration nobody can change without a code review. A
 * deployment passes the real key down from the page.
 *
 * The Worker is the other half and it does not rely on this: it refuses the always-passes TEST
 * SECRET on any host that is reachable or that holds a GitHub App key, so a real deployment that
 * forgot to change its keys refuses orders rather than accepting everything.
 */
export const TURNSTILE_TEST_SITEKEY = "1x00000000000000000000AA";

/** Shown instead of the widget if the check is ever turned off again. Visitor-facing, and true. */
export const HUMAN_CHECK_NOTICE =
  "The human check this form needs is not deployed, so this form cannot open a pull request and " +
  "is not going to pretend otherwise. The button below stays off, and the email address under it " +
  "is the only path from here today. When the check is in place the button turns on and this " +
  "paragraph goes away.";

/**
 * The submit button's reason line while the check is undeployed.
 *
 * It is not one blocker among several. The other two — a file that does not validate, a
 * disclosure not yet acknowledged — are things the visitor can fix by answering a question.
 * This one is not, so listing it alongside them would read as another item on a to-do list.
 */
export const HUMAN_CHECK_REASON =
  "Not yet: the human check this form needs is not deployed, so nothing can be sent from here. " +
  "Copy the file above and email it instead. That path works today and gets you a person reading " +
  "your recipe.";
