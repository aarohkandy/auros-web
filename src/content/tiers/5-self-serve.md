---
name: Self-serve
priceMono: "$0"
unitMono: "the recipes are public"
minimumMono: null
forWhom: Anyone who would rather read the file and build it themselves.
includes:
  - "Every recipe, including every customer recipe, in a public repository"
  - "The base image Containerfile, the hardening, and the policy modules"
  - "The check matrix, which is the literal definition of what passing means"
  - "The build workflows, which run on free CI for public repositories"
excludes:
  - "Us. There is nobody to call."
showReplacementComparison: false
order: 5
---

Zero, and not as a trial. The recipes are public because a customer who cannot leave is not a
customer, they are a hostage, and because an operating system you cannot rebuild is one
bankruptcy away from being an operating system you no longer have.

If you have somebody who is comfortable with `git` and `podman`, you can have the same image we
would build for you and pay us nothing. The instructions are on the replaceable page and they
are the same instructions we use.

What you are buying in the paid tiers is not access. It is that somebody else watches the
nightly build go red at six in the morning.
