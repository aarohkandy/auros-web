---
question: How do updates work on a 180-machine site with one uplink?
shortAnswer: This is the hardest operational question about the product and we do not have a finished answer yet. Ask us before you buy at that scale.
group: operations
order: 7
---

The honest version, because the reassuring version would be found out inside a month.

The base rebuilds every night, but a rebuild only produces new bytes when upstream actually
changed something. Most nights that is small. Some nights it is a kernel.

We measured the bad case on `2026-09-20`. The upstream base is `3.5 GB` compressed —
`3,758,096,384` bytes, recorded in `auros-base/base.lock` — and it pulled in `58 s` on a CI
runner sitting on a datacentre uplink. A night that changes a low layer is `3.5 GB` per machine.
On `180` machines that is a `630 GB` morning on your line, and your line is not a datacentre
uplink. That is not a theoretical concern. It is a Tuesday.

Four things make it less bad, and they are real today.

- Images are flattened when published, so the packages your recipe removed are bytes your
  machines never download. A smaller image is a smaller pull, every night, forever.
- Machines pull and stage in the background. The update applies on the next restart. Nobody
  waits at a login screen for a download.
- Machines are not synchronised. They pull on their own schedule rather than all at nine.
- An image only ships after it has passed the check matrix, so you are not pulling nightly
  churn. You are pulling changes that were tested.

The thing that actually solves it for 180 machines is a caching mirror inside your building: one
pull over the uplink, then 179 pulls over your own switch. We have not built it. It is a design
requirement rather than a feature, and we would rather write that sentence here than let you
find it out in October.

So if you have 180 machines and one uplink, make that the first thing you ask us about, and hold
us to the answer. A pilot of `25` machines tells you what a real night looks like on your line
before you commit the rest.
