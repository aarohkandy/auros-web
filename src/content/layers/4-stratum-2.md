---
id: stratum-2
marginLabel: "── stratum 2 ──"
name: auros-base:hardened
ownedBy: Auros
refMono: "ghcr.io/aarohkandy/auros-base:hardened"
depth: 4
---

The only thing we build. One image, not one per customer and not one per hardware generation.
Hardening, policy, and the update agent, and nothing else.

It is rebuilt every night against upstream. When it moves, every recipe standing on it rebuilds,
and every machine picks the result up on its next restart. That is why a security fix is one
rebuild rather than a project: there is exactly one place to fix it, and everything downstream
follows without anybody being asked.

An image that has not booted in a virtual machine and passed the full check matrix does not get
published. The publish step reads the results ledger before it is allowed to write, so it cannot
be waved through in a hurry at the end of a bad week.
