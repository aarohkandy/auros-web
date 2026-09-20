---
id: bedrock
marginLabel: "── bedrock ──"
name: Fedora · Universal Blue
ownedBy: upstream
refMono: "ghcr.io/ublue-os/aurora:stable"
depth: 5
---

Not ours. Fedora, packaged by the Universal Blue project as an operating system that ships as a
container image.

Thousands of people maintain this, none of them are us, and that is the point. We do not build a
kernel, a boot loader, an init system or a package manager, and we are not clever enough to and
neither is anybody selling you a custom Linux who says otherwise.

We pin it by digest rather than by name, so a build today and a build next Tuesday stand on
exactly the same rock. Moving that pin is a deliberate act with a rebuild and a full check matrix
behind it, not something that happens to us overnight.

This is also the floor under the promise that you can rebuild without us. If we vanish and the
registry we publish to vanishes with us, the thing at the bottom is still there and still
maintained by people who never heard of us.
