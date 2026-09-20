# `auros-web/worker` — the one function behind the order flow

Spec §6D: *"Static site, one serverless function."* This is that function. One Cloudflare Worker, four
routes, in front of the static Astro build.

> **Four routes is not four functions.** A Worker is a single deployed unit with a single `fetch`
> handler; the paths are a `switch` inside it, the way a single CGI script with a switch is one program.
> They share the schema, the GitHub App token cache, the KV namespace and the order record — splitting
> them would mean four copies of the validator and four places for the schema to drift out of step with
> `auros-recipes`. This is written down so the route count is never read as a violation of §6D's count.

| Route | Method | What it does |
|---|---|---|
| `/order` | POST | A validated recipe becomes a branch, a file and a pull request in `aarohkandy/auros-recipes`. |
| `/build-result` | POST | CI reports a pass or a fail. **This is the endpoint that charges a card.** |
| `/stripe-webhook` | POST | Records which Stripe object an order belongs to. Moves no money. |
| `/build-console` | GET | Server-Sent Events carrying real GitHub Actions job and step state. |

Everything else falls through to the `ASSETS` binding — the static site.

---

## Status: built, wired to nothing

Two things this Worker can do are reserved by the spec for a human, and both are off in configuration
rather than in a comment:

- **§9 reserves anything touching a real card.** `STRIPE_LIVE_ENABLED` is `"false"`. `callStripe()` is
  the only function in `lib/stripe.js` that reaches the network, and with the switch off it returns
  `{ live: false, planned: { method, path, params } }` instead of sending. The whole flow still runs end
  to end — the PR opens, the build runs, `/build-result` decides correctly whether to bill or cancel —
  and a reviewer can read the exact request that would have gone to Stripe without a card existing.
- **§4.6 reserves sending mail to a real person.** `OPERATOR_EMAIL_ENABLED` is `"false"`. The message is
  composed and not sent, and `/order` answers `operatorNotified: false` rather than implying otherwise.
  The pull request is the durable notification; the email is a convenience on top of it.

Turning either on is a deliberate act by a person, recorded in a deploy.

---

## Every secret, and what happens when it is absent

Set with `wrangler secret put <NAME>`. Nothing in this table appears anywhere in this repository.

### `/order`

| Secret | What it is | Absent ⇒ |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | Turnstile server-side secret | **`/order` refuses every request, 503.** There is no bypass flag anywhere in this codebase. An absent secret never means "skip the check" — the endpoint writes to a public repository under our name, and being unavailable is a bad morning while being an open PR-creation endpoint is a bad year. |
| `GITHUB_APP_ID` | The App's numeric id | `/order` refuses, 503, and says so. Nothing is created, no card is touched. |
| `GITHUB_APP_INSTALLATION_ID` | The installation on `aarohkandy` | as above |
| `GITHUB_APP_PRIVATE_KEY` | **PKCS#8** PEM — see the warning below | as above |
| `RESEND_API_KEY` | Operator email delivery | The order still succeeds. `operatorNotified: false` with the reason attached. |
| `OPERATOR_EMAIL_FROM` / `OPERATOR_EMAIL_TO` | Addresses | as above |
| `STRIPE_SECRET_KEY` | Live Stripe key | With `STRIPE_LIVE_ENABLED` off: irrelevant, nothing is sent. With it **on**: `callStripe` throws rather than silently proceeding. |

> ### ⚠ The private key must be PKCS#8
>
> GitHub hands you a PKCS#1 file beginning `-----BEGIN RSA PRIVATE KEY-----`. WebCrypto cannot import
> that, and the error is an unhelpful `DataError`. Convert it once:
>
> ```
> openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in app.private-key.pem -out app.pkcs8.pem
> ```
>
> The converted file begins `-----BEGIN PRIVATE KEY-----`. `lib/github.js` detects the wrong format and
> says this in the error rather than letting you debug WebCrypto — it is the single most likely reason
> an otherwise correct deployment does not work.
>
> There is no `node:crypto` in a Worker, which is why the JWT is signed with WebCrypto's
> `RSASSA-PKCS1-v1_5` + SHA-256 (which is exactly what RS256 means) in about fifteen lines.

### `/build-result`

| Secret | What it is | Absent ⇒ |
|---|---|---|
| `BUILD_RESULT_SECRET` | HMAC secret shared with CI | **Refuses every request, 503.** This endpoint charges cards; an unset secret is a configuration failure, and the only safe reading of a configuration failure here is "refuse everything". |

CI signs its callback with the same code the Worker verifies with — `signPayload()` in
`lib/signature.js` is exported for exactly that, and `worker/tools/sign-build-result.mjs` is the four
lines of CLI around it that `auros-recipes/.github/workflows/order-check.yml` runs. The two sides
agree by construction rather than by both reading the same paragraph of a README.

That sentence was false for a while and it is worth saying why, because the failure had the shape
this product argues against. The endpoint was correct and could not be forged — 400 on a missing
header, 401 on a forged `v1`, 400 outside the window, 404 for an unknown order, 503 with the secret
unset, idempotent by run id — and **nothing ever called it.** No workflow signed anything and no
workflow POSTed anything, so "your card is authenticated now and billed only when the test build
passes" had a consumer and no producer: every order would have sat at `awaiting-checkout` forever.
The producer is `order-check.yml`, which test-builds an order branch, publishes nothing, and reports
with `if: always()` so a failed build releases the authorisation as reliably as a passing one bills
it.

```
x-auros-signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
```

Three properties, all tested: a **forged** call fails the signature; a **replayed** call is outside the
300-second tolerance or has a run id already claimed; a **retried** call (Actions retries steps) returns
the original outcome and does nothing a second time. The third is not a security property, but a retried
"pass" that bills twice is indistinguishable to the customer from dishonesty.

### `/stripe-webhook`

| Secret | What it is | Absent ⇒ |
|---|---|---|
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the Stripe dashboard | **Refuses every request, 503.** |

The ordering in `routes/stripe-webhook.js` is the whole point and it is worth reading before changing:
**read raw bytes → verify HMAC over those exact bytes → only then `JSON.parse`.** Parsing first is the
standard way this goes wrong; the signature covers the bytes Stripe sent, and re-serialised JSON is a
different document in whitespace, key order and number formatting.

### `/build-console`

Needs the three `GITHUB_APP_*` secrets. Without them the stream opens and immediately says the console
is unavailable, then closes. **It does not fall back to sample output** — see below.

### Bindings and vars (not secrets, in `wrangler.jsonc`)

| Name | Notes |
|---|---|
| `AUROS_KV` | Order records, GitHub token cache, once-only claims, last-known build log. `wrangler kv namespace create AUROS_KV`, then paste the id. The placeholder is deliberately invalid so an unconfigured deploy fails at deploy time, not at the first order. |
| `ASSETS` | The static site. |
| `ENVIRONMENT` | Anything but `development` means production, which is what makes the Turnstile test-secret guard bite. |
| `STRIPE_LIVE_ENABLED` / `OPERATOR_EMAIL_ENABLED` | The two §9/§4.6 switches. `"false"`. |
| `SITE_ORIGIN`, `RECIPES_OWNER`, `RECIPES_REPO`, `RECIPES_BASE_BRANCH` | Plain configuration. |

For local development, `.dev.vars` (gitignored) with the pinned Turnstile **test** keys from
`docs/DECISION-SHEET.md` — sitekey `1x00000000000000000000AA`, secret
`1x0000000000000000000000000000000AA`. The test secret accepts every token, so `lib/turnstile.js`
**refuses to run with it when `ENVIRONMENT` is not `development`**: shipping it would leave the endpoint
open while every log line still read as a pass, which is the worst shape a failure can have.

---

## What is safe to expose before a human has approved live payments

| Route | Safe to expose now? | Why |
|---|---|---|
| `/build-console` | **Yes.** | Read-only. It streams job state from a public repository's public Actions runs. It takes no body, writes nothing, and rejects any `recipe` that is not the shape the schema allows. |
| `/stripe-webhook` | **Yes.** | Refuses everything without `STRIPE_WEBHOOK_SECRET`; with it, only Stripe can produce a valid signature. It records and moves no money even then. |
| `/order` | **Yes, with Turnstile configured** — and it is the deliberate design that it is safe. | It creates a public pull request, which is the product. With `STRIPE_LIVE_ENABLED` off it collects no card at all. Nothing it creates can be published to a machine: publishing is gated on the CI results ledger. |
| `/build-result` | **Yes, with `BUILD_RESULT_SECRET` set.** | With `STRIPE_LIVE_ENABLED` off it cannot move money whatever it is sent — the worst a correctly-signed forgery achieves is a wrong `settledBecause` string on a KV record. **This is the route to re-read before the human flips that switch**, because on that day it stops being inert. |

The ordering the whole flow is built on, and the reason it is safe in this state:

> Card collected and SCA-authenticated at checkout, **$0 charged**. Billed by ending the trial early
> when the test build passes. On a failing build, nothing was ever captured, so there is nothing to
> refund.

That is the same ordering as the installer's — verify first, act second — and it is not a coincidence
that the company's two riskiest operations share a shape.

---

## The build console never invents a line

Spec §7 says the console "replaces every decorative animation impulse… It is more interesting than any
animation and it is true." The second half is the engineering requirement, so:

- There is **no synthesis anywhere** in `routes/build-console.js`. Every field emitted comes from a
  field GitHub returned; `test/console.test.js` asserts this directly by checking every string in the
  output appears in the payload it came from.
- **No build** ⇒ the stream says there is no build, once, and closes.
- **GitHub unreachable or rate-limited** ⇒ the stream says so, then offers the last **real** log stored
  for that run, labelled `stale` with the timestamp it was stored. If there is no stored log it shows
  nothing and says it would rather show nothing than something invented.
- The illustrative lines in `src/content/copy.ts` are the *page's* empty state, rendered by the page and
  labelled as illustration. They never enter this stream.

Two facts that shaped it:

- **`GET /actions/jobs/{id}/logs` 404s while a job is running** and only returns a 60-second redirect
  once it has finished (DECISION-SHEET B14). There is no line-level live log to tail. What genuinely
  exists is job and step state, so that is what this streams: coarser than a log tail, and entirely true.
- **Compressed SSE buffers on Cloudflare** (workerd#7390, B16), hence `Content-Encoding: identity`,
  `Cache-Control: no-transform` and a `: keepalive` comment every 15 seconds. Runtime updates also
  terminate in-flight requests after a 30-second grace period, so event ids are **computed, not
  counted**: `<runId>#<index into a fact list rebuilt deterministically from the API>`. A client
  reconnecting with `Last-Event-ID` resumes at exactly the next fact, with no server-side session and
  nothing to get out of sync. `factsFromJobs()` orders by (job index, step number, phase) and never by
  timestamp, because a timestamp ordering would let a parallel job insert itself mid-list and shift
  every index a client had already consumed.

---

## Validation: the same schema, not a second opinion

`worker/schema/recipe.schema.json` is a **copy** of `auros-recipes/schema/recipe.schema.json` — a Worker
cannot read a sibling repository at runtime. The copy is asserted, not assumed:

```
node --test 'worker/test/*.test.js'
```

fails if the copy's rules differ from the sibling's. The comparison is over the canonical form (stable
stringify, sorted keys) rather than the bytes, because a check that goes red when somebody runs a JSON
formatter is a check people learn to re-baseline without reading. After copying a new schema in, run
`node worker/test/record-schema-hash.mjs` — deliberately a separate command, because a check that
re-baselines itself is not a check.

`lib/jsonschema.js` is a general JSON-Schema-2020-12 evaluator that knows nothing about recipes. The
rules stay in the schema; this is the engine they are fed to. Its one non-negotiable property:

> **An unknown keyword is a hard error, not an ignored annotation.**

`compile()` walks the whole schema at module load and throws on any keyword it does not implement, so a
future schema keyword cannot silently become a rule the Worker does not enforce. That throw happens
while the Worker is starting, which means every route 500s and the deploy is obviously broken — the
correct blast radius, versus one quiet request accepting a recipe because the rule that would have
rejected it was a keyword we skipped.

**The Worker accepts JSON and writes YAML.** It never accepts YAML text and forwards it, so there is no
path by which a visitor's string becomes YAML *structure* — no anchors, no tags, no second document, no
key smuggled through an unquoted newline. `lib/yaml.js` is an emitter and deliberately not a parser.
It also quotes more aggressively than YAML 1.2 requires, because `restart_daily_at: 10:30` is read by
YAML 1.1 parsers as the integer **630**.

---

## The request the configurator sends

```jsonc
POST /order
{
  "turnstileToken": "…",          // required. No token, no POST.
  "tier": "school",               // one of: one-machine · school · business · single-purpose · self-serve
  "contactEmail": "it@…",         // optional
  "recipe": { /* the recipe object, exactly as the panel rendered it */ }
}
```

`201` on success, with the PR number and url, the console url, and either a Stripe checkout url or the
`planned` checkout parameters. `422` on a refusal, carrying `headline` and `why` **in the schema's own
words** — `docs/CONFIGURATOR.md` constraint 4 asks the panel to show the refusal "in the validator's own
words, explaining why refusing is the point", so every refusal returns the `title` and `description`
written next to the rule in `recipe.schema.json`. There is no second copy of the argument to drift.

Other refusals: `429` (five orders an hour per address — Turnstile stops a bot, this stops one solved
challenge opening two hundred PRs overnight), `413`, `409` for a name already taken, `503` for anything
unconfigured.

---

## Running it

```
npx wrangler@4.135.0 dev            # needs .dev.vars
npx wrangler@4.135.0 deploy
node --test 'worker/test/*.test.js' # 154 tests, no build step
node ../../tools/honesty-gate.mjs auros-web/worker
```

The Worker is plain ESM JavaScript with JSDoc types rather than TypeScript, for one reason: `node --test`
then exercises **the code that ships**, with no transpile step in between that could mask a drift
between the tested source and the deployed bundle. `worker/package.json` carries `"type": "module"` so
this is independent of the site's `package.json`, which another workstream owns.

### One known false positive in the honesty gate

`node tools/honesty-gate.mjs auros-web/worker` reports one finding that cannot be annotated away:

```text auros-allow: this block quotes the gate's own output; it is the rule being reported, not a claim
schema/recipe.schema.json:1395  "testimonial"   (social-proof)
```

It is the vendored schema, and the word is there because the schema **refuses** that field — it is the
rule being written down, not a claim being made. JSON carries no comments, so the `auros-allow:` escape hatch cannot be used,
and the file must stay byte-equal in rules to `auros-recipes`, so it must not be edited here. The fix
belongs in `tools/honesty-gate.mjs`, which this workstream does not own: one `SKIP_FILE` entry, or
skipping paths matching `schema/.*\.schema\.json$`. Until then, `auros-web/src` is the scan that gates
CI and the worker scan is run by hand with this finding known and discounted.

---

## Things that are true about this Worker and worth not un-learning

- Nothing is created until every check has passed. A refused order leaves **no** branch, no file, no
  Stripe object and no record — the name collision is checked before a branch exists, so there is never
  an orphan branch for somebody to wonder about later.
- Checkout is created **after** the pull request. If Stripe were first, a failed PR would leave a session
  a customer could complete for a build that does not exist.
- `/build-result` claims its idempotency key **before** calling Stripe. If the Worker dies in between,
  the order is left unbilled and a human notices a missing charge; the other ordering leaves it billed
  twice and the customer notices.
- A Stripe failure does not roll back a pull request. The customer has a readable recipe either way.
- There is no refund path in `lib/stripe.js`, and there is not supposed to be one. A refund would mean
  something had been captured, which would mean the ordering was wrong.
