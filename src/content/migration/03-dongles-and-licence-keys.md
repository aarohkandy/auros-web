---
title: Anything that needs a hardware dongle
verdict: does-not
oneLine: A USB licence dongle talks to a Windows driver. There is no driver on the other side.
examples:
  - "USB licence dongles on older CAD, music and design software"
  - "Node-locked licences that check the machine they were activated on"
  - "Card readers and signing keys supplied by a bank or an exam board"
onLanding: true
order: 3
---

A licence dongle is not storage. It is a small computer that answers a question the program
asks it, through a driver that the vendor wrote for Windows. The dongle keeps working. The
driver does not exist on Linux, so nothing is there to ask the question.

The same applies to licences that are locked to a machine rather than to a dongle. A reinstalled
operating system commonly looks like a different machine to the vendor's activation server, and
whether that is recoverable is between you and them, not something we can promise on their
behalf.

If a dongle is the only thing standing between you and a migration, the honest options are a
newer licence from the vendor that does not use one, keeping that one job on a Windows machine,
or not migrating those machines. We would rather tell you that now.
