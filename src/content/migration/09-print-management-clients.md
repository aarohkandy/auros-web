---
title: Print management and follow-me printing
verdict: conditional
oneLine: The printer itself is usually not the problem. The client software that charges pupils for printing and releases jobs at the machine may not.
examples:
  - "Follow-me and secure-release printing clients"
  - "Print quota and charging systems"
  - "Vendor utilities for the copier's finishing options"
howToCheck: >
  Ask whoever supplies your print management whether they ship a Linux client, and separately
  whether release can be done at the device with a card rather than from the workstation. The
  second question often makes the first one stop mattering.
onLanding: false
order: 9
---

Printing itself is not the problem. The installer does not carry your printers over (see the
Printers entry), but a modern copier on the network usually prints from Linux without anything
being installed.

The part that needs checking is the layer on top: the thing that holds a job until somebody taps
a card at the machine, or counts pages against a pupil's allowance. That is vendor software, it
is frequently Windows-only, and it is worth one question to your supplier before you order
rather than a discovery afterwards.
