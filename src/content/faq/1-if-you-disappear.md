---
question: What happens to my machines when you go out of business?
shortAnswer: They keep booting, because the image is already on them. What you lose is the nightly patching, and the written term is that you receive the build files to carry it on yourself.
group: trust
order: 1
---

This is the right first question and most vendors answer it with a sentence about their
commitment to their customers. Here is the exact answer instead, including the part of it that is
weaker than what this page said a week ago.

**Your machines keep working.** The image is installed on them. It does not check a licence
server, it does not call home to be allowed to boot, and it does not stop on a date. If we shut
the doors this afternoon, every laptop you have imaged comes up tomorrow exactly as it did today.
That was never really the risk, and answering "you have the image" does not answer what you asked.

**What you would lose is the patching.** The nightly rebuild against upstream is the thing you
are paying for; a frozen image is a fine operating system for about a month. So the commitment is
written as a term rather than as a sentiment:

> If Auros ceases operating, each customer receives the build files for their own image — their
> recipe, the base Containerfile, and the build scripts needed to keep patching it.

The files arrive laid out the way `auros-recipes` is laid out, so from the top of that tree, on
one Linux machine with `podman`, the rebuild is one command:

```
cd auros-recipes
podman build -t myschool:local -f customers/myschool/Containerfile .
```

The generated `Containerfile` is committed next to every recipe so that nobody needs our compiler
to build it. That was decided in `DECISIONS.md` D28 for this reason, before the licensing question
came up.

Two things that term is not. It is not a licence to our tooling — the compiler, the check matrix,
the installer and this website stay ours. It is not redistribution rights: you can keep your own
fleet alive, not sell it to anybody else. Our repositories are public and you can read every line
that goes into your image today, but public is not a licence, and a page that let you read those
two facts as one would be doing the thing this answer exists to avoid.

Being exact about what has been tested, because this is the paragraph where a vendor rounds up:
**nothing here has been executed yet.** There is a CI job called `stranger` that runs the command
above from a cold container with nothing of ours in it, and it is paused and has never gone green
— the base image it would build against has not published once. Until it does, what you have is a
written term and a test that exists and has not yet passed, rather than one that is passing. When
it passes, this paragraph will say so with a date on it.
