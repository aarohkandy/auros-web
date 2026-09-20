---
name: Single-purpose
priceMono: "$19"
unitMono: "per device per month"
minimumMono: "5 devices"
forWhom: Machines that do exactly one thing. A screen in a foyer, a catalogue terminal, a sign-in desk.
includes:
  - "A kiosk recipe: the desktop shell and the login manager are not in the image"
  - "A runtime check that proves the lockdown is in force, not merely configured"
  - "Signed images and nightly rebuilds"
excludes:
  - "On-site work"
  - "Hardware, mounts, or screens"
showReplacementComparison: false
order: 4
---

Higher per device than the fleet price, and the reason is worth stating.

A single-purpose image is the hardest thing we build. It starts from the same base as everything
else, because there is only ever one base, and then it removes the things a person could reach a
desktop through: the shell and the login manager. The build then asserts, every night, that
neither of them came back. When upstream adds a dependency that drags one in, that build fails
loudly rather than shipping you a kiosk with a start menu on it.

The honest cost of doing it that way: some shared libraries stay, because the package manager
will not release them, so the image is larger than one built from scratch for the purpose. We
report the size we actually measured rather than the size we wanted. We accept that trade
because the alternative is a second base image, and a second base image means a security fix
stops being one rebuild, which is the thing we sell.

You are paying for the assertion, not for the deletion.
