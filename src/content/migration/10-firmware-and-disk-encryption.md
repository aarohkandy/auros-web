---
title: Firmware settings and BitLocker
verdict: conditional
oneLine: One restart on most machines. Some need one firmware setting changed by hand, and the tool tells you which before you begin.
examples:
  - "BitLocker with TPM 1.2, common on 2012 to 2015 business laptops: suspended for exactly one boot"
  - "Secure Boot where the firmware ships the third-party certificate authority switched off: a per-machine visit to the firmware menu"
  - "Firmware that quietly ignores a one-time boot instruction: the tool sends you to the boot menu instead"
howToCheck: >
  On one machine, open the BitLocker control panel and note whether the system drive is
  encrypted, then look in the firmware setup for Secure Boot and whether the third-party or
  Microsoft UEFI certificate authority is enabled. Do it on one machine of each model you own,
  not one machine in total, because this is a property of the model and the firmware version
  rather than of the laptop in front of you. The migration tool checks all three of these during
  its first read-only pass and shows you the answer before anything is copied, so the worst case
  of getting this wrong is that you find out at the start rather than the end.
onLanding: true
order: 10
---

This is the entry that decides whether *one restart* is true for your fleet, and it is the one a
vendor is most tempted to leave out.

**BitLocker.** If the system drive is encrypted, changing the boot order is exactly the kind of
change BitLocker is designed to notice. On TPM 1.2 — which is what a 2012 to 2015 business
laptop has — that can land the machine at a recovery-key prompt, and a machine sitting at a
recovery prompt with nobody who knows the key is the worst thing this tool could do to you. So
the tool suspends BitLocker for exactly one boot before it changes anything about how the
machine starts, and it does that whether or not it thinks it needs to. It is not an option and
there is no setting for it. Protection resumes on the next boot by itself.

**Secure Boot.** Fedora's boot loader is signed by a Microsoft certificate authority that some
business firmware of that era ships switched off. Where that is the case the machine refuses the
new image until somebody enables it in the firmware menu. That is a physical visit to each
affected machine. We cannot automate it and nobody can, because the whole point of the setting is
that software cannot change it.

**One-time boot is not always honoured.** We ask the firmware to start from the stick once and
then go back to normal. Some vendors' firmware rewrites the boot order at power-on anyway, and
fast-boot settings can skip the USB port entirely. Where that happens the tool stops asking and
walks you into the boot menu instead. That is a normal path, not an error, and it is written
down as one so that the person doing it does not think something has gone wrong.

**What this means for a fleet.** Budget it across the fleet rather than per machine. Changing a
firmware setting on one laptop is quick; the cost is that somebody is walking to every laptop
that needs it, and how many that is depends on which models you own. The tool tells you which
machines need it before you start, which is the whole reason it reads the machine before it
writes anything.

Your files are not at risk from any of this. Every one of these failures happens after the
verified archive exists on a separate disk, and a machine that will not boot is a machine that
has gone back to being a dead laptop rather than one that has taken your files with it.
