---
title: Your files
verdict: comes
oneLine: All of them, copied to a second disk, counted and hashed before the first byte of the old system is touched.
examples:
  - "Documents, Desktop, Pictures, Downloads, Videos, Music"
  - "Anything else you point it at, including a second internal drive"
onLanding: false
order: 20
---

The program that runs on the Windows machine inventories your files, copies them to a disk that
is not the system disk, and then verifies the copy twice over: the number of files has to match,
and every file's hash has to match. If a single file disagrees, it stops and changes nothing.
Windows still boots. You try again tomorrow or you walk away.

There is a moment, by design, where your data exists in two places and the original disk has not
been touched. That ordering is not a preference. It is the rule the whole tool is built around,
because ignoring it is how other people have destroyed other people's data.

**Files that are open get quarantined, not skipped quietly.** A file that Windows has locked
while the machine is running cannot always be read cleanly. Where that happens, the run produces
a list saying these files were in use and were not copied, and you see that list before you
decide anything. A gap you can see is a problem. A gap nobody mentioned is a disaster.

**The Windows program does not write your USB stick.** That is deliberate, and it is the single
most destructive thing this software could otherwise do: writing boot media means raw writes to
a disk on a machine we do not own, with no undo, while somebody watches a progress bar. So it
does not. The installation media is made elsewhere, once, and the same stick does every machine.
At most the program sets the machine to boot from the stick you have already plugged in.

On the new machine, the restore runs on first boot, verifies the count and the hashes again
against the manifest, and puts the file count on the desktop. Any discrepancy is shown rather
than swallowed. The number you end with is a number you can see, not a number you are asked to
trust.
