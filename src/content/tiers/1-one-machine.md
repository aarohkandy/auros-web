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
  - "Nightly rebuilds of the base it stands on, for as long as we are here"
excludes:
  - "On-site work"
  - "Hardware"
showReplacementComparison: false
order: 1
---

One payment. There is no subscription attached to it and no account to cancel.

The nightly rebuilds continue because the base image is one image, shared by everybody, and
rebuilding it for one more machine costs us nothing. If we stop existing, the recipe is still in
a public repository and you can rebuild it yourself. That is the point of the whole design and
it is not a consolation prize.
