---
title: The account name
verdict: does-not
oneLine: The Windows account name is not carried over. The account is created again during first-boot setup.
examples:
  - "The local account name and display name"
onLanding: false
order: 25
---

The installer does not read the Windows account name, so the new machine does not know it. The
person who will use the machine types their name during first-boot setup.

The password is set there too, because we never see the old one and would not want to.
