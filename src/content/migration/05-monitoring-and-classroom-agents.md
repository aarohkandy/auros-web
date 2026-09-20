---
title: Safeguarding monitoring and classroom management agents
verdict: conditional
oneLine: These are Windows programs, so the Windows version does not come across. Whether a supported version exists for Linux is a question only your vendor can answer.
examples:
  - "Safeguarding and web monitoring agents"
  - "Classroom management: screen viewing, screen locking, handing out files"
  - "Device management agents and antivirus"
howToCheck: >
  Email your vendor one sentence: "Do you ship a supported agent for Fedora-based Linux, and
  is it packaged as an RPM or a Flatpak?" Get the answer in writing before you commit a single
  machine. If the answer is no, treat it as a blocker rather than an inconvenience, because in
  most schools this is a safeguarding obligation and not a preference.
onLanding: true
order: 5
---

We are singling this out from the rest of the Windows programs because it is the one that stops
migrations dead, and because it is easy to discover late, by somebody who assumed it would be
fine.

Monitoring is frequently a condition of your policies and sometimes of your funding. A machine
without the agent on it is not a machine you can hand to a child, regardless of how good the
rest of the migration was.

Some vendors do ship a Linux agent. Some ship one for a distribution that is not the one we
build on. Some do not ship one at all and will tell you so plainly if you ask. We cannot answer
this for you, we will not guess in public, and we are not going to sell you an image and let you
find out.

If your vendor does ship one, tell us which, and it goes in your recipe as a named package like
anything else.
