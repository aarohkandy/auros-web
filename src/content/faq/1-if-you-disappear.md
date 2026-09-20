---
question: What happens to my machines when you go out of business?
shortAnswer: They keep working, and you rebuild the same image yourself from a public repository with three commands.
group: trust
order: 1
---

This is the right first question and most vendors answer it with a sentence about their
commitment to their customers. Here is the command instead.

```
git clone https://github.com/aarohkandy/auros-recipes
cd auros-recipes
podman build -t myschool:local -f myschool/Containerfile .
```

That builds your operating system. The same one, from the same file, with the same packages
removed. It needs one Linux machine with `podman` on it and roughly `40 GB` of free disk. It
does not need an account with us, a licence key, or anything we hold.

If the registry we publish to has gone as well, the base your recipe stands on is a public
repository too, and you build that first:

```
git clone https://github.com/aarohkandy/auros-base
podman build -t auros-base:hardened auros-base
```

Underneath that is Fedora, by way of Universal Blue, which is not ours and does not depend on us
being here.

The full instructions, including turning the result into a bootable USB stick and pointing your
existing machines at your own registry so they keep updating, are on the replaceable page. They
are the same instructions we use, which is the only reason to believe they work.

Nothing about this is generous. A company that can hold your operating system hostage eventually
behaves like one.
