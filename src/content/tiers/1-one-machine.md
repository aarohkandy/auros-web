---
name: One machine
priceMono: "$79"
unitMono: "one-time"
minimumMono: null
forWhom: One laptop, one person, one recipe written for it.
includes:
  - "A recipe written for that machine, committed to the public recipes repository"
  - "The image built, signed, and checked against the full matrix on the exact digest you receive"
  - "The migration installer, and the verified archive of your files it produces"
  - "The removal report: every package taken out, by name, with its measured size"
  - "The base it stands on is rebuilt nightly for everybody; we have not set a term for this tier"
excludes:
  - "On-site work"
  - "Hardware"
showReplacementComparison: false
order: 1
---

One payment. There is no subscription attached to it and no account to cancel.

The base image is one image, shared by everybody, and rebuilding it for one more machine costs
us nothing. That is an architectural fact and it is why this tier can exist at all.

What we have not done is turn it into a term. Nobody here has decided how long a single `$79`
payment keeps a machine on the nightly rebuild, and putting an open-ended commitment on this
page would be deciding it by publishing it. So the honest version is this: the base is rebuilt
nightly for everyone, and the length of the commitment attached to this tier is a question we
have not answered yet.

If we stop existing, the machine keeps booting — the image is on it and nothing about it phones
home. Whether you can keep it *patched* is the term on the replaceable page: you receive the
recipe, the base Containerfile and the build scripts, which is what a rebuild actually needs.
Unlike the paragraph above, that one is written down.
