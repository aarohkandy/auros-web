---
id: stratum-1
marginLabel: "── stratum 1 ──"
name: Your recipe
ownedBy: you
refMono: "recipe.yaml"
depth: 3
---

About ten lines of readable text that describe your fleet: a name, a language, a keyboard, the
packages to install, the packages to remove, a policy mode, a look, and which hardware it is for.

It is yours, it is in a public repository, and a person who is not an engineer can read it and
tell whether it is right. That last property is not decoration. A configuration nobody can check
is a configuration nobody is checking.

The removal list is the part that matters. It is first-class in the format, not a footnote, and
the build reports back exactly what it took out with the size of each thing. A machine with
eleven applications instead of three hundred is the entire product.

A recipe may add and it may remove. It may not change what it stands on: not the base, not the
kernel, not a held-back version of anything. A customer whose requirement needs that is a
customer we decline, and we decline in a phone call rather than in a build that quietly forks.
