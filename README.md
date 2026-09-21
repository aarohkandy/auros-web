# auros-web

The Auros site: landing, the live configurator, pricing, FAQ, and one Cloudflare Worker that turns an
order into a pull request.

**Not open source.** Proprietary, all rights reserved. This repository is *readable*; no licence is
granted to copy, modify or redistribute any of it. See `LICENSE` and `../LICENSING.md`.

## What is unusual about it

**The configurator shows you what gets deleted.** Its output panel renders the customer's answers as the
actual `recipe.yaml` that will build their machines, live as they choose — including the `prune:` block
naming what comes out. The deletion list is longer than the install list and is laid out so it looks it.
Nobody else selling a computer shows you what they took out.

**It validates against the same schema CI does.** Not a second implementation that can drift — the
schema is vendored with a drift check, and an unknown schema keyword throws at load rather than being
ignored. If the site can render YAML that CI would reject, the site is lying at the moment it is trying
hardest to be trusted.

**The background is the architecture diagram.** A pixel-art cross-section of the earth, generated from a
fixed seed at 4px blocks — sky, soil, then strata that are the layers of the image stack, labelled in
the margin as you descend past them. Decorative pixel art is slop; pixel art that *is* the explanation
is not.

**The build console streams real pipeline output**, and nothing else on the site moves. It shows real
failures as well as successes, because a console that has only ever been green reads as staged.

## Honesty is enforced, not intended

`node ../tools/honesty-gate.mjs src` runs in CI and fails the build on an unevidenced claim: invented
customers, savings figures, blanket `.exe` compatibility, an unqualified "one restart", a licence grant
we withdrew, or **a claim of hands-on experience while `hardware/compat.tsv` has no physical rows.** That
last rule lifts itself automatically when real hardware has been tested — the evidence file decides, not
the gate.

It exists because the site once said "the machines are in a room". There was no room.

## Running it

```
pnpm install
pnpm build          # lint, astro check, tests, build, then verify the built output
pnpm dev
```

`worker/` deploys separately with wrangler and needs a Cloudflare account, which does not yet exist
(`../BLOCKED.md` B14).

## Before this goes live

`../BLOCKED.md` **B12**: the site states a wind-down commitment in four places and no terms document
exists behind it. That is a promise we have not actually made, and it must not ship first.
