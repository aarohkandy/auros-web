---
title: Running .exe files through a compatibility layer
verdict: conditional
oneLine: A compatibility layer exists. Some programs run under it. Many do not, including the two everybody asks about first.
examples:
  - "Small self-contained tools and older utilities: often work"
  - "Microsoft Office: rated Garbage in the public compatibility database"
  - "Adobe Photoshop: rated Silver, which means problems with no workaround"
  - "Anything with a kernel driver, a dongle, or copy protection: does not work"
howToCheck: >
  Write down the exact program name and the exact version you run, not the current one on the
  vendor's site. Look it up yourself in the WineHQ Application Database at appdb.winehq.org, and
  read the rating for your version rather than the newest. Then send us the list and we will read
  it with you, entry by entry, in that same public database. What you get from us is a careful
  reading of somebody else's evidence. We have not put these programs on a machine, we are not
  offering to, and we have no results of our own to add. Do this for every program you cannot live
  without, before you order.
onLanding: false
order: 7
---

There is a compatibility layer for Linux that translates what a Windows program asks for into
what Linux provides. It is real, it is mature, and it is not an emulator or a virtual machine.
We can install it as part of your image, and when a program works under it, it works well enough
that people stop noticing.

We are not going to tell you it works. We are going to tell you what we found and how to check
the rest.

**The two everybody asks about.** On 2026-09-20 we read the public compatibility database
directly. Microsoft Office, across the 365 and 2021 releases listed, rates `Garbage`, which is
that database's lowest rating. Every Adobe Photoshop release from 2019 to 2024 rates `Silver`,
defined there as having problems for which there are no workarounds, on small samples and older
versions of the compatibility layer, with no 2025 or 2026 entry at all. Those are somebody
else's measurements and we are quoting them rather than our own, which is why we are giving you
the date we read them.

So Office and Adobe are on the does-not-come-across list, not in a footnote. When somebody
genuinely needs Office, the honest answers are the web version, keeping one Windows machine for
that person, or not migrating that person.

**What tends to work.** Self-contained programs that draw a window, read and write files, and
ask nothing else of the machine. Older utilities. Single-purpose tools written years ago that
your school never replaced because they still do the job.

**What a real answer looks like.** The worked example recipe in our public repository carries two
Windows programs, tested on `2026-09-11`, with the result written into the file:

- `Vidyalaya School ERP desktop client` — *works with caveats*. Prints report cards. The
  fingerprint attendance module cannot see the reader.
- `Tally.ERP` — *fails*. Crashes during licence activation. The office PC stays on Windows for
  Tally.

One yes with a hole in it and one flat no, in a configuration file, where the next person to ask
can find them. A recipe that only recorded the yeses would be worth nothing to that person.

**What does not work, and will not.** Anything with a kernel driver. Anything with a hardware
dongle. Anything with copy protection or anti-tamper. Anything expecting to install a service
and run before anybody logs in. Lockdown exam software, deliberately.

**What breaks first, when something mostly works.** Printing. The file open and save dialogs.
Anything touching hardware directly: scanners, cameras, cutters, interface boxes. Updates,
because the program's own updater expects a Windows it can write to.

A program running this way is running in a translation. That is a real thing to be able to do
and it is not the same as running on Windows, so we will not price it or promise it as though
it were.

**There is no paste-your-list checker on this site, and there is not going to be one.** The
compatibility database has no interface for software to read, and it has put up a deliberate
barrier against automated readers. Working around that to build a convenience for our sales page
would be rude at best. So the check is done by hand, by a person, with you, before you have
spent anything. That is slower and it is the honest version.

**If the answer for your program is no**, the options are a web version if the vendor has one, a
Linux equivalent if one exists and your staff will accept it, keeping a few Windows machines for
that one job, or leaving those machines alone. All four are legitimate. Pretending the answer
was yes is not.

We are not going to offer you a Windows virtual machine on the side either. That needs a Windows
licence per device on top of what you have paid us, and several gigabytes of memory for the
virtual machine alone, on laptops that have four in total. It is not an honest option for these
machines, so it is not on the list.
