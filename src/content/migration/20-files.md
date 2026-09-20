---
title: Your files
verdict: comes
oneLine: Everything the machine can read, copied to a second disk, counted and hashed before the first byte of the old system is touched. Files that are open, or stored only in the cloud, are listed rather than copied.
examples:
  - "Documents, Desktop, Pictures, Downloads, Videos, Music"
  - "Anything else you point it at, including a second internal drive"
  - "OneDrive files kept only in the cloud: counted and listed, and you choose whether to download them first"
onLanding: false
order: 20
---

The program that runs on the Windows machine inventories your files, copies them to a disk that
is not the system disk, and then verifies the copy twice over: the number of files has to match,
and every file's hash has to match. A file whose hash disagrees is copied again, once. If it
still disagrees it goes on a list, by name, and **nothing is written to your old disk until that
list is empty.** If you would rather stop there, the migration stops and changes nothing.
Windows still boots. You try again tomorrow or you walk away.

We say this precisely rather than simply, because the simpler promise — *any single mismatch
aborts everything* — sounds safer and is not. Files legitimately change while they are being
read: something syncs, antivirus touches a file, a document is open. A tool that gives up on the
whole run because of one of those gets worked around, and a tool that gets worked around is more
dangerous than one that hands you the names of the four files it could not read.

There is a moment, by design, where your data exists in two places and the original disk has not
been touched. That ordering is not a preference. It is the rule the whole tool is built around,
because ignoring it is how other people have destroyed other people's data.

**Files that are open get quarantined, not skipped quietly.** A file that Windows has locked
while the machine is running cannot always be read cleanly. Where that happens, the run produces
a list saying these files were in use and were not copied, and you see that list before you
decide anything. A gap you can see is a problem. A gap nobody mentioned is a disaster.

**Files that are not really on the machine get counted, not silently missed.** OneDrive can be
set up so a file appears in Explorer while its contents live in the cloud. Reading those files
naively either pulls hundreds of gigabytes down a school's connection or fails outright, so the
tool finds them first, counts them, and asks you before it starts. Leaving them in the cloud is
a legitimate answer — they are already in two places, which is the whole point of the ordering
below — but it is your answer to give, not ours to assume.

**The Windows program does not write your USB stick.** That is deliberate, and it is the single
most destructive thing this software could otherwise do: writing boot media means raw writes to
a disk on a machine we do not own, with no undo, while somebody watches a progress bar. So it
does not. The installation media is made once, elsewhere, and the same stick does every machine.
At most the program sets the machine to boot from the stick you have already plugged in.

**Who makes that stick is not settled, and we are not going to pretend it is.** The two honest
answers are that we publish a downloadable image with every build, or that you produce one from
the published image yourself. Today only the second is written down, on the replaceable page,
and it needs a command line — which by our own rule means it is not yet something we are
entitled to call part of the product. Ask us where this has landed before you order; if it has
not landed, the answer you will get is that it has not landed.

On the new machine, the restore runs on first boot, verifies the count and the hashes again
against the manifest, and puts the file count on the desktop. Any discrepancy is shown rather
than swallowed. The number you end with is a number you can see, not a number you are asked to
trust.
