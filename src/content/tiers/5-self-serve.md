---
# ══════════════════════════════════════════════════════════════════════════════════════════════
# DO NOT SHIP THIS TIER. `blocked: true` keeps it out of the rendered price table, and it stays
# out until BLOCKED.md B9 is answered by a person.
#
# The tier existed because the recipes were forkable. DECISIONS.md D30 ended that, which removed
# the product from the price rather than changing the price. B9 records three options — remove
# the tier, redefine it at $0 as read-but-not-build, or licence `auros-recipes` permissively on
# its own — and picking one is a pricing decision, which SPEC §9 reserves for a human. An agent
# may not pick.
#
# The file is kept rather than deleted because the spec fixes five tiers, and because the words
# below are the honest account of what happened, which the person deciding will want.
# ══════════════════════════════════════════════════════════════════════════════════════════════
blocked: true
name: Self-serve
priceMono: "$0"
unitMono: "the repositories are readable"
minimumMono: null
forWhom: Anyone who wants to read exactly what is on the machines before deciding anything.
includes:
  - "Every recipe, including every customer recipe, readable without an account"
  - "The base image Containerfile, the hardening and the policy modules, readable"
  - "The check matrix, which is the literal definition of what passing means, readable"
excludes:
  - "A licence to build it or pass it on. Readable is not permission."
  - "Us. There is nobody to call."
showReplacementComparison: false
order: 5
---

<!-- Not rendered. `blocked: true` in the frontmatter holds this back until BLOCKED.md B9 is
answered by a person. Everything below is what the page would say, kept for whoever decides. -->

This tier is the one unfinished thing on this page, and rather than quietly delete it while
nobody is looking, here is what happened to it.

<!-- auros-allow: names the withdrawn licence in order to record that it was withdrawn. -->
It existed because every recipe was Apache-2.0 and forkable, so somebody with `git` and `podman`
could have the same image we would build and pay us nothing. On `2026-09-20` the licence changed
to all rights reserved — recorded as `DECISIONS.md` D30, a commercial decision made by a person —
and that took the product out of this tier overnight. A price with nothing behind it is not a
price.

What is true at `$0` today is narrower and still worth something: you can read every line that
would go onto your machines, diff last night against tonight, and satisfy yourself about what
gets deleted, before you spend anything or talk to anybody. Reading is not a licence to build.
Both of those are true at once and neither of them is the other.

**What this tier becomes is not ours to decide.** Prices and tiers are reserved for a person
(`SPEC` §9), the question is written up as `BLOCKED.md` B9 with three options and their costs, and
nobody has picked one. Until somebody does, this entry says what it does rather than what it used
to say.
