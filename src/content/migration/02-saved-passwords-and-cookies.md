---
title: Saved passwords, cookies and card details in Chrome and Edge
verdict: does-not
oneLine: Chrome and Edge lock these to the Windows account on that machine. Copying the file gets you a file nobody can open.
examples:
  - "Saved passwords in Chrome"
  - "Saved passwords in Edge"
  - "Cookies, which is to say every site somebody is currently signed into"
  - "Saved card and payment details"
onLanding: true
order: 2
---

Here is what is actually happening, without the acronyms.

When Chrome saves a password, it does not keep the password. It keeps a scrambled version, and
it asks Windows to hold the key. Windows hands that key back only to Chrome, running as you,
signed in on that machine. That is the whole point of the design. It is why somebody who steals
the laptop and pulls the drive out cannot read your staff's passwords off it.

Recent versions of Chrome and Edge tighten it further, binding the key to the browser program
itself as well as to the Windows account, so that other software running as you still cannot get
at it. Microsoft's own documentation says the policy that relaxes this exists for cases where
the data is expected to be portable between computers, which is a plain admission that by
default it is not.

Since that change, the same lock covers saved passwords, cookies and saved card details
together. The effect for you is the same in every case: once that Windows installation is gone,
the key is gone, and the scrambled file is noise.

**We do not build a decryptor, and you should be suspicious of anyone who says they have.**
Every published method for getting at this data works by injecting into or impersonating the
signed browser. That is what malware does, Windows Defender treats it as exactly that, and
software that behaves that way cannot hold the reputation it needs to run on your machines at
all. We are not going to ask you to turn the protection off either.

**What to do instead, before the migration, not after.**

1. Sign into the browser and let it sync. Saved passwords and bookmarks come back when somebody
   signs in on the new machine. For a school already in Google Workspace this is usually the
   whole answer and it takes no work.
2. Or, on each machine, export the passwords to a file from Chrome's own password manager, keep
   that file somewhere safe, and import it into the browser on the new machine. That file is
   plain readable text while it exists. Treat it accordingly and delete it afterwards.

The migration tool walks somebody through one of those before anything is wiped, rather than
mentioning it afterwards.

Cookies do not transfer either, which in practice means everyone signs in again once. Say that
to staff before the day rather than on it.

Bookmarks and history do come across. Firefox is a different case entirely and a better one.
