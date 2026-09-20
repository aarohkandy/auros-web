---
question: What about a machine that will not boot afterwards?
shortAnswer: Your files are still in the verified archive, untouched. The cause we expect most often is a firmware setting, and we can tell you which one.
group: hardware
order: 6
---

First, the part that is not at risk. The archive was written to a separate disk and verified by
count and hash before anything was written to the machine. A machine that fails to boot is a
machine that has gone back to being a dead laptop. It is not a machine that has taken your files
with it.

The cause we expect most often on this generation of hardware is Secure Boot, though we have
not yet measured that across real machines and will say so until we have. Fedora's boot loader
is signed by a Microsoft certificate authority that some business firmware from that era ships
switched off. Where that is the case the machine refuses the image until the setting is changed
in firmware. That is a per-machine visit: quick on any one laptop, and worth budgeting across
the fleet rather than per machine, because somebody is walking to each one that needs it.

None of this should be the first you hear of it. The inventory entry on firmware settings and
BitLocker covers all three of the things that break *one restart*, and the tool checks for them
before it copies a single file.

We test against that case on purpose. The check matrix includes a profile with Secure Boot on
and the standard keys enrolled, and a profile with legacy BIOS only, because a 2012 machine is
not a 2018 machine and pretending otherwise is how you end up with a trolley of bricks.

What a virtual machine cannot prove is whether your specific model's firmware behaves. It has no
real wireless chipset, no trackpad, no backlight and no vendor firmware. So the compatibility
table records those columns only from physical machines, and leaves them empty rather than
guessing when we have not tested one. Empty means we have not tested it. It does not mean it is
fine.

Send us the model number before you order. If it has a row, you get the row, failures included.
If it does not, we will say so.
