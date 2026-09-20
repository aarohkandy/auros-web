---
title: Active Directory
verdict: does-not
oneLine: Domain join, Group Policy and roaming profiles do not come across, and this is the one that decides whether a migration is a good idea at all.
examples:
  - "Domain-joined machines where staff sign in with their AD account"
  - "Group Policy: drive mappings, desktop lockdown, proxy settings, software deployment"
  - "Roaming profiles and folder redirection"
  - "Print and file shares that authenticate against the domain"
onLanding: true
order: 4
---

If your machines are domain-joined and your logins come from Active Directory, everything built
on top of that goes away with it. The Group Policy that maps the H: drive, the lockdown that
keeps Year 8 out of the control panel, the software you push at half past three, the printer
that knows who is printing.

Some of this has an equivalent on our side. Lockdown does, and it is harder to undo on the
machine, because it is compiled into the image rather than applied to it — an image with no
control panel in it has no control panel to re-enable. That is a narrower claim than it sounds:
it does not replace what Group Policy did for drive mappings, software deployment, proxy
settings or printer identity, and those are four of the things listed above as going away. Some
of the rest would need us to change the base image, which is the one thing our architecture does
not allow for any customer at any price.

So this is a conversation before a purchase, not a surprise afterwards. Ask us. If the answer is
that your requirement needs a fork of the base, we will tell you that we decline, and you will
have lost a phone call rather than a term.

A school that already lives in Google Workspace or Microsoft 365 on the web, with local accounts
on the laptops, is the case where none of this bites. That is our first customer profile for a
reason, and it is why we say it out loud instead of letting you discover the boundary yourself.
