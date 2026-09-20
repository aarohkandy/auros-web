---
question: What happens if an update breaks a machine?
shortAnswer: The previous image stays on the disk, and a machine that cannot reach a login prompt twice goes back to it by itself.
group: operations
order: 3
---

An update does not overwrite the running system. The new image is staged alongside the old one,
and the machine switches to it on the next restart. The old one is still on the disk.

If the new image fails to reach a login prompt twice, the machine rolls back to the old one on
its own, without anybody being called. If you decide the problem yourself, the old image is
available from the boot menu.

Before an image reaches you at all, it has been booted in a virtual machine and put through a
fixed matrix of checks, and the publish step reads the results ledger and refuses any image
without a recorded pass for that exact build. There is no flag to skip it.

Now the limit, because the sentence above is about a specific failure and you should know what
it does not cover. Automatic rollback catches an image that will not boot. It does not catch an
image that boots perfectly and breaks the printer in the art block. Nothing automatic can,
because the machine has no way to know that was wrong.

The answer to that is a pilot group: a handful of machines that take the new image a week before
the rest. Staged rollout by group is a design requirement we have written down. It is not
something you should assume is already built, and if you are running a fleet, ask us where it
has got to before you rely on it.
