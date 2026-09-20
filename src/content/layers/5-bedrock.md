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

This is also the floor under the wind-down term. If we stop operating you are given the build
files for your image, and they are only worth having because the thing they stand on is still
there — maintained by thousands of people who never heard of us and who do not stop when we do.

One honest caveat about *the pin*, as opposed to the project. The upstream registry deletes old
images on a schedule of its own — roughly three months, or sooner once enough newer releases
have shipped. So a recipe left alone for a year names a foundation that upstream has since
removed, and rebuilding it means moving the pin forward to a current one first. We keep a copy
of the exact pinned image in our own registry so that this does not bite, which helps right up
until our registry is the one that has gone. Neither of those is a reason not to publish the
rebuild instructions. Both are reasons to run them occasionally rather than trusting them.
