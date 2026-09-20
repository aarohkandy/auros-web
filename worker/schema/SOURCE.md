# `recipe.schema.json` here is a vendored copy. It is not a second schema.

A Worker cannot read a file out of a sibling git repository at runtime, so the schema is copied in at
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

Refresh the copy with:

    cp auros-recipes/schema/recipe.schema.json auros-web/worker/schema/recipe.schema.json
