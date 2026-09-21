---
title: Wi-Fi networks and passwords
verdict: does-not
oneLine: Saved wireless networks and their keys are not carried over. Somebody types the key on each machine after the move.
examples:
  - "Network names and pre-shared keys"
onLanding: false
order: 23
---

The installer does not read the saved wireless profiles from Windows. There is no code in it that
exports them, so nothing about your networks reaches the new machine. Write the network name and
key down before you start; the first boot will show a network picker.

Enterprise wireless that authenticates a user against a directory rather than a shared key is a
different case, and it lands in the same conversation as Active Directory. Ask first.
