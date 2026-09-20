# CLAIMS

Every factual assertion the Auros website makes, and the evidence for it.

Adding a claim to any file in `src/content/` without adding its row here is a defect. A claim
whose evidence column says **UNEVIDENCED** must not be published until a human has decided it
(spec §9).

Maintained by the agent that owns content.

**Reviewed against DECISIONS.md: D33** — 2026-09-20.

Of those, `D30` and `D31` rewrote what this file says about trust and replaceability (section 7),
and `D33` was read and changes nothing published: it exempts one named script endpoint on the
configurator page from SPEC §4.5, and no content file makes a claim about what the site loads.
Recording the ones that turned out not to matter is the point — the date is worthless if it only
moves when somebody feels like it does.

That line is not bookkeeping. On 2026-09-20 two decisions landed (`D30`, then `D31`), the site
did not change, and about twenty-five sentences across thirteen files went from true to false in
an afternoon. Nothing caught it, because every gate we had reads the *wording* of a claim and
none of them read whether reality had moved underneath it. `tools/honesty-gate.mjs` now fails the
build when the number above is behind the newest decision in `DECISIONS.md`, which is the cheapest
possible version of somebody re-reading this file.

Every row carries a **`verified_on`** date for the same reason. A row with no date is a row
nobody has checked.

**What the date means, exactly:** the last time a person or an agent re-read that row against
this repository, the sibling repositories and `DECISIONS.md`. It is **not** a re-confirmation of
a third party's behaviour — an **UPSTREAM** row dated today still needs its vendor documentation
checked before publish, and says so in its own evidence column.

---

## 0. The blanket condition, which governs every row below

**The product is at Gate 1.** As of this review, `auros-base` has not yet produced a published
image, no recipe has been compiled, and the migration installer does not exist. Almost every
row in this file is present-tense copy describing behaviour that is specified, designed and
under construction, not behaviour that has been observed.

That is not a problem with the copy. It is a problem with **when the copy goes live.**

> **BLOCKING CONDITION — needs a human decision per §9.**
> This site must not be published to a public address before Gates 1, 2 and 3 are true
> (`/Users/aaroh/auros/docs/SPEC.md` §10). Until then, every present-tense sentence about image
> signing, rollback, prune assertions, the check matrix and the verified-copy installer is a
> description of a design rather than a report of a measurement. Publishing them early would be
> the same category of untruth as a fabricated testimonial, and §4.4 exists to stop exactly
> that. <!-- auros-allow: states the prohibition, does not make the claim -->
> Two acceptable resolutions, both human decisions:
> (a) hold the site until Gates 1 to 3, or
> (b) publish sooner with a visible, unignorable state banner on every page saying which parts
> have been built and which have not. If (b), the banner text is a §9 decision, not an agent's.

Rows below marked **DESIGN** are the ones this condition bites hardest.

Evidence keys used in the tables:

| Key | Meaning |
|---|---|
| **SPEC** | Fixed by `/Users/aaroh/auros/docs/SPEC.md`. The contract. |
| **MATRIX** | Defined mechanically in `/Users/aaroh/auros/auros-base/matrix/checks.yaml` or `profiles.yaml`. |
| **DECISION** | Recorded in `/Users/aaroh/auros/DECISIONS.md`. |
| **UPSTREAM** | Depends on a third party's documented behaviour. Must be verified against current vendor documentation before publish, and re-verified annually. |
| **DESIGN** | True of the design; the code does not exist yet. Copy must not imply it has been observed. |
| **BUILD-REQ** | The copy places a requirement on another workstream. Listed so it cannot be silently dropped. |
| **UNEVIDENCED** | No evidence. **Needs human approval per §9.** |

---

## 1. Prices and commercial terms

Prices are §9-reserved (SPEC §6D, §9). They are reproduced exactly and must never be adjusted,
rounded or "clarified" by an agent.

| Claim | Where | Evidence | verified_on |
|---|---|---|---|
| One machine, `$79`, one-time | `tiers/1-one-machine.md`, `copy.ts` hero | **SPEC** §6D | `2026-09-20` |
| School and nonprofit, `$15` per device per year, `25` device minimum | `tiers/2-school-nonprofit.md` | **SPEC** §6D | `2026-09-20` |
| Business fleet, `$12` per device per month, `10` device minimum | `tiers/3-business-fleet.md` | **SPEC** §6D | `2026-09-20` |
| Single-purpose, `$19` per device per month, `5` device minimum | `tiers/4-single-purpose.md` | **SPEC** §6D | `2026-09-20` |
| Self-serve, `$0` | `tiers/5-self-serve.md` | **SPEC** §6D fixes the tier. What it *bought* was the recipes being forkable, and **DECISION D30** removed that, so the price now has nothing behind it. **HELD BACK, NOT REPRICED:** the file carries `blocked: true`, `tiers()` in `src/components/content.ts` filters blocked tiers out of every page, and `pages/3-pricing.mdx` says in words that a fifth tier exists and is not being shown. What replaces it is **BLOCKED.md B9** — three options, all of them pricing, all of them §9. **An agent may not pick one, and may not delete a tier the spec fixes.** | `2026-09-20` |
| Payment is taken only after the test build passes | `pages/3-pricing.mdx`, `copy.ts` pricing.chargeNote | **SPEC** §6D ("Stripe Checkout, charged only after the test build passes") | `2026-09-20` |
| An order opens a pull request in the public recipes repository | `pages/3-pricing.mdx`, `copy.ts` configurator | **SPEC** §6D. **DESIGN** — the Worker does not exist yet. | `2026-09-20` |
| The one-machine tier keeps receiving nightly base rebuilds after a single payment | `tiers/1-one-machine.md` | **UNEVIDENCED, AND NO LONGER CLAIMED.** This is a commercial term, not an architectural fact. It is *consistent* with the architecture (one shared base, marginal cost of one more machine is zero) but nobody has decided it. **Needs human approval per §9.** <!-- auros-allow: records the forbidden wording in order to forbid it --> The open-ended wording this row forbade was published in the tier's `includes` list and in its body until 2026-09-20; both are now removed, and the page states in words that the term is undecided. `tools/honesty-gate.mjs` rule `perpetual-commitment` fails the build if any open-ended service commitment returns, and `tools/honesty-regressions.test.mjs` asserts it against this exact file. | `2026-09-20` |
| Tier inclusion lists (recipe, signed image, check matrix, removal report, installer, compatibility table row) | all `tiers/*.md` | Each individual item is **SPEC**/**MATRIX** evidenced elsewhere in this file. Their *bundling into these specific tiers* is **UNEVIDENCED** — no human has defined what each tier includes. **Needs human approval per §9.** | `2026-09-20` |
| Exclusions: no on-site work, no hardware, nothing requiring a base fork | all `tiers/*.md` | Base-fork refusal is **SPEC** §3. On-site work and hardware exclusions are **UNEVIDENCED** commercial terms. **Needs human approval per §9.** | `2026-09-20` |
| "Below `25` devices the one-machine price is usually the better answer" | `tiers/2-school-nonprofit.md` | Arithmetic only: `25 × $15 = $375/yr` against `$79` once. True as stated. No approval needed, but it is a sales statement and a human may want to remove it. | `2026-09-20` |
| No response-time, uptime or support-hours commitment appears anywhere on the site | all | Deliberate. Such a commitment would be **UNEVIDENCED** and §9-reserved, so none is written. | `2026-09-20` |

## 2. The replacement-cost comparison

| Claim | Where | Evidence | verified_on |
|---|---|---|---|
| No savings figure appears anywhere on the site | `copy.ts` replacementComparison, `pages/3-pricing.mdx` | **SPEC** §4.4. Verified by inspection: the only numbers in the comparison are the fixed `$15` price and placeholders the reader fills in. | `2026-09-20` |
| "Our real competitor is doing nothing, and doing nothing is free" | `copy.ts` replacementComparison, `pages/3-pricing.mdx` | **SPEC** §6D states this in the same words. Not a market claim; a framing the spec fixes. | `2026-09-20` |
| `C = max(A, 25) × $15 per year`, and the hero price line names the `25` minimum | `copy.ts` replacementComparison.formulaMono, `copy.ts` hero.priceNoteMono | Arithmetic from the §9-fixed price and the §9-fixed minimum, both **SPEC** §6D. Until 2026-09-20 the formula read `C = A × $15 per year` and the hero line omitted the minimum entirely, so a reader with 12 machines computed `$180` against a real floor of `$375` and found out at order time. Not a price change — the prices are untouched — a presentation defect in how a §9-fixed price was rendered. | `2026-09-20` |
| The site supplies no default, average or example value for A or B | `copy.ts` replacementComparison.inputs | Verified by inspection. Supplying one would manufacture a savings figure by the back door. | `2026-09-20` |
| "An unpatched machine on a network with children on it is a risk decision, not a saving" | `copy.ts` replacementComparison.body | Framing, not a factual claim. No security-outcome statistic is cited, deliberately. | `2026-09-20` |

## 3. What does not come across

The core claim of this whole page is the one SPEC §4.2 makes mandatory.

| Claim | Where | Evidence | verified_on |
|---|---|---|---|
| Windows programs do not migrate. None of them. | `migration/01-windows-programs.md`, landing column, `copy.ts` | **SPEC** §4.2, and it is true by construction: a PE executable built for the Win32 API does not run on a Linux kernel without a translation layer, which is treated separately below. | `2026-09-20` |
| The test is "installed program" versus "website in a browser" | `migration/01-windows-programs.md` | True by construction. A web application's runtime is the browser, which exists on both systems. | `2026-09-20` |
| Named examples (Office desktop, Adobe, SolidWorks, Inventor, 2D Design, Sibelius, Cubase, Sage, laser and vinyl cutter drivers, MIS desktop clients) | `migration/01-windows-programs.md` | The claim attached to each name is only ever "this is a Windows program, and Windows programs do not come across", which holds for any Windows build of any product. **No claim is made that any named vendor does or does not ship a Linux or web version.** Copy instructs the reader to check. Verified by inspection of the file. | `2026-09-20` |
| Chrome and Edge saved passwords, cookies and saved card details do not come across | `migration/02-saved-passwords-and-cookies.md`, landing column | **DECISION D15**, which corrects an earlier understatement: since Chrome and Edge 127 the same wrapping covers passwords, cookies and payment data together. Explained in plain words with no acronym and no mechanism name. | `2026-09-20` |
| "Microsoft's own documentation says the policy that relaxes this exists for cases where the data is expected to be portable between computers" | same | **DECISION D15** quotes that documentation. **UPSTREAM.** Record the exact Microsoft URL in this row before publish. | `2026-09-20` |
| We do not build a decryptor, and published methods are malware behaviour | same | **DECISION D15**, in those terms. Statement against interest and the strongest trust sentence on the page. | `2026-09-20` |
| We will not ask you to disable the protection | same | **DECISION D15**. Consistent with **SPEC** §4. | `2026-09-20` |
| Mitigation: browser sync, or export from Chrome's own password manager and import afterwards | same | **DECISION D15** names this as the path the tool walks the user through before the wipe. **UPSTREAM** for the export path continuing to exist. Verify before publish; it has moved between versions. | `2026-09-20` |
| The exported password file is plain readable text | same | **UPSTREAM.** Chromium exports CSV in the clear. Verify. The warning is safety-relevant, so if the mechanism cannot be verified, keep the warning and drop the detail. | `2026-09-20` |
| Firefox profiles come across whole, including saved passwords | `migration/21-firefox-profiles.md` | **UPSTREAM.** Firefox keeps credentials inside the profile directory under its own key material, not under a Windows account key, so the directory is portable. **This is the strongest single asymmetry on the page and it must be tested by the installer test matrix before publish, not merely cited.** **BUILD-REQ** on workstream C: add a check that a migrated Firefox profile opens with saved logins intact. | `2026-09-20` |
| Chrome and Edge bookmarks and history do come across | `migration/22-chrome-edge-bookmarks.md` | **UPSTREAM.** Those stores are not bound to the account key. Same verification requirement, same **BUILD-REQ**. | `2026-09-20` |
| Hardware dongles do not come across | `migration/03-dongles-and-licence-keys.md` | True by construction: a dongle is reached through a vendor kernel driver written for Windows. | `2026-09-20` |
| Node-locked licences may see a reinstalled machine as a different machine | same | **UPSTREAM**, vendor-specific, and the copy says explicitly that this is between the reader and their vendor rather than something we promise. Acceptable as written. | `2026-09-20` |
| Active Directory: domain join, Group Policy, roaming profiles, folder redirection do not come across | `migration/04-active-directory.md` | True by construction. Also **SPEC** §3: a requirement that needs the base changed is a customer we decline, which is what the copy says. | `2026-09-20` |
| Lockdown "is harder to undo on the machine, because it is compiled into the image rather than applied to it", and does **not** replace Group Policy's drive mappings, software deployment, proxy settings or printer identity | `migration/04-active-directory.md` | **DESIGN**, narrowed on 2026-09-20. Rests on **MATRIX** check `S9` (kiosk implies no shell binaries in the image) and **DECISION** D3 (KDE Kiosk chosen because it makes lockdown provable). <!-- auros-allow: describes a superseded comparative claim in order to record that it was withdrawn --> The earlier wording asserted the lockdown was *stronger than* Group Policy, which is an unevidenced comparative claim against a product we have not measured, and false in scope: the same file lists four Group Policy capabilities that go away entirely. Tamper-resistance is the one property the design actually supports, so that is the only one claimed. `honesty-gate` rule `comparative-superiority` now fails the build on the pattern. Re-read once `S9` has recorded a pass. | `2026-09-20` |
| Monitoring and classroom-management agents: the Windows version does not come across; a Linux version is a vendor question | `migration/05-monitoring-and-classroom-agents.md` | True by construction for the first half. The second half makes **no claim about any vendor** and supplies the exact question to ask. Verified by inspection: no vendor is named. | `2026-09-20` |
| "In most schools this is a safeguarding obligation, not a preference" | same | General statement about schools' duties. Not a claim about a specific jurisdiction's law, and no statute is cited. If a human wants a jurisdiction named, that is a §9 decision. | `2026-09-20` |
| Exam and lockdown software is designed to detect and refuse environments like a compatibility layer | `migration/06-exam-and-lockdown-software.md` | True by construction: environment and integrity checking is the stated function of that category. No specific product is named. | `2026-09-20` |
| Print management and follow-me clients may not come across; the printer itself does | `migration/09-print-management-clients.md`, `migration/24-printers.md` | Printer migration is **SPEC** §6C.1. The client software caveat is stated conditionally with a test attached and names no vendor. | `2026-09-20` |
| Specialist and assistive software: installed versions do not come across, many have web versions | `migration/08-specialist-and-assistive-software.md` | No product is named anywhere in the file, deliberately, and the copy instructs the reader to get the answer in writing from their supplier. Verified by inspection. | `2026-09-20` |

## 4. The .exe compatibility story

SPEC §4.2 and §11.3 bound this absolutely: never imply blanket compatibility.

| Claim | Where | Evidence | verified_on |
|---|---|---|---|
| A compatibility layer exists and we can install it | `migration/07-exe-compatibility-layer.md` | **DECISION** D4.3 (`compat_layer` recipe field installs Bottles or WINE from Flathub). **DESIGN** — the recipe field does not exist yet. **BUILD-REQ** on workstream B. | `2026-09-20` |
| It is a translation layer, not an emulator or a virtual machine | same | **UPSTREAM**, and it is the project's own documented description of itself. Verify wording before publish. | `2026-09-20` |
| Anything with a kernel driver, a dongle, copy protection or anti-tamper does not run | same | True by construction: a translation layer implements user-space APIs, not the Windows kernel driver model. | `2026-09-20` |
| Printing, file dialogs and hardware access break first | same | **UPSTREAM**, widely documented, and stated as a tendency rather than a rule. Acceptable. <!-- auros-allow: names the phrase in order to forbid it until it is earned --> Do not re-word it to claim our own testing until we have some; `honesty-gate` rule `implied-track-record` fails the build on that phrasing. | `2026-09-20` |
| The WineHQ Application Database is the place to look up a specific version | same | **UPSTREAM.** Public database. Verify the address `appdb.winehq.org` resolves before publish. | `2026-09-20` |
| "Send us your list and we read it with you, line by line" — a lookup in the public database, with no test and no turnaround | `migration/07-exe-compatibility-layer.md`, `pages/2-what-doesnt-come-across.mdx`, `migration/08-specialist-and-assistive-software.md`, `copy.ts` | **DECISION D16**, which decided a hand lookup and nothing more. Acceptable as now written. It becomes **UNEVIDENCED** again the moment anybody adds a turnaround time, a test, or a result of ours. | `2026-09-20` |
<!-- auros-allow: the rows below quote withdrawn claims in order to record that they were withdrawn -->
| We have **not** tested any customer's program, and say so | `migration/07-exe-compatibility-layer.md`, `pages/2-what-doesnt-come-across.mdx`, `migration/08-specialist-and-assistive-software.md` | Statement against interest, and true: `hardware/compat.tsv` contains its header row and nothing else, and no image has booted on a physical machine. Three published sentences claimed otherwise until 2026-09-20 — "our own notes from machines we have built", "we will say which of yours we tested and what happened", and an offer to check assistive software "against the compatibility layer first". The first was implied social proof under **SPEC** §4.4 with no row in this file; the other two committed us to per-customer testing, which §11 item 4 records as undecided. All three are removed. `honesty-gate` rule `implied-track-record` and the regression test hold the line. | `2026-09-20` |
| Microsoft Office rates `Garbage` and Adobe Photoshop rates `Silver` in the public compatibility database, read on `2026-09-20` | `migration/07-exe-compatibility-layer.md`, `pages/2-what-doesnt-come-across.mdx` | **DECISION D16**, read directly from WineHQ AppDB on that date: Office 365 Business, Office 2021 Pro Plus and Office 365 ProPlus all Garbage; every Photoshop CC 2019 to 2024 Silver, on small samples and stale versions, with no 2025 or 2026 entry. The copy attributes the ratings to that database, gives the date, and calls them somebody else's measurements. **Re-read and re-date annually, or remove.** | `2026-09-20` |
| Office and Adobe are on the explicit does-not list rather than in a caveat | `migration/01-windows-programs.md`, `migration/07-exe-compatibility-layer.md` | **DECISION D16**, **SPEC** §4.2. | `2026-09-20` |
| There is no paste-your-list compatibility checker and there will not be one | `migration/07-exe-compatibility-layer.md` | **DECISION D16**: the database has no machine-readable interface and sits behind a deliberate anti-automation control. Building one would mean circumventing it. Statement against our own convenience. | `2026-09-20` |
| We do not offer a Windows virtual machine alongside the image | `migration/07-exe-compatibility-layer.md` | **DECISION D16**: it needs a Windows licence per device on top, and its own floor is `4 GB` of memory for the virtual machine on laptops with `4 GB` in total. The copy states both numbers. | `2026-09-20` |
| The site never states that .exe files work | everywhere | **SPEC** §4.2, §11.3. Verified by inspection: every statement is conditional, and `copy.ts` doesNotComeAcrossColumn.footnote states the negative explicitly. | `2026-09-20` |

## 5. The migration installer and data safety

| Claim | Where | Evidence | verified_on |
|---|---|---|---|
| Files are copied to a disk that is not the system disk, then verified by file count and per-file hash, and only then is anything written | `migration/20-files.md`, `pages/1-landing.mdx`, `copy.ts` migrationSafety | **SPEC** §4.1 and §6C. **DESIGN** — the installer does not exist. Gate 3 is the evidence, and it requires 100 clean runs and 20 clean aborts. | `2026-09-20` |
| A hash mismatch is retried once, then listed by name, and nothing is written until that list is empty; Windows still boots | `migration/20-files.md`, `pages/1-landing.mdx`, `copy.ts` migrationSafety | **`auros-installer/SAFETY.md` phase 5**, and a deliberate, recorded deviation from **SPEC** §6C.4's literal *"any mismatch aborts and changes nothing"*. <!-- auros-allow: quotes the spec wording the site deliberately does not use --> SAFETY.md's reasoning, which the landing page reproduces for the reader: files legitimately change while they are being read (a sync client hydrates, antivirus touches a file, a document is open), a tool that aborts the whole run on one of those gets worked around, and a tool that gets worked around is more dangerous than one that reports precisely. **The safety invariant is untouched** — it is about what is true before the first system-disk write, not about how many reads it took to get there, and the unresolved count must be zero to cross. **This row exists because the site does not use the spec's words.** Until 2026-09-20 `migration/20-files.md` and `copy.ts` promised the stronger guarantee while the landing page and SAFETY.md described the real one, so a reader could quote whichever surface they happened to read on the most dangerous operation this company performs. All three surfaces now match SAFETY.md. A human should confirm the §6C.4 deviation alongside D13's, in §12 item 6. **DESIGN** — the installer does not exist; Gate 3 is the evidence. | `2026-09-20` |
| The installer reads the machine's actual installed-programs list and requires acknowledgement | `migration/01-windows-programs.md`, `copy.ts` migrationSafety | **SPEC** §6C.2. **DESIGN.** | `2026-09-20` |
| Wi-Fi network names and keys, printers, default printer and account name are carried over | `migration/23-wifi-credentials.md`, `24-printers.md`, `25-account-name.md` | **SPEC** §4.2 and §6C.1 name exactly these. **DESIGN.** | `2026-09-20` |
| The restore re-verifies on first boot and reports the file count on the desktop, and shows any discrepancy rather than swallowing it | `migration/20-files.md` | **SPEC** §6C, Linux side. **MATRIX** check `R1`, which fails on any discrepancy that is swallowed rather than shown. **DESIGN.** | `2026-09-20` |
| The one-line verdict on "Your files" is *everything the machine can read*, with open files and cloud-only files listed rather than copied | `migration/20-files.md` frontmatter | **`auros-installer/SAFETY.md`** phases 1 and 4. The verdict read "All of them" until 2026-09-20, which the same file contradicted twelve lines down and which SAFETY.md phase 1 contradicts outright by making *leave them in the cloud* an honest, offered choice. The one-line verdict is what a skimmer takes away, so it was the one sentence on the page that mattered most and the one that was false. | `2026-09-20` |
| OneDrive Files On-Demand placeholders are detected, counted, and put to the user as a choice before the copy starts | `migration/20-files.md` | **`auros-installer/SAFETY.md`** phase 1, which makes this a first-class case and gives both honest options: hydrate (slow, may not fit) or leave them in the cloud (fine — they are already in two places, which is the invariant). **DESIGN.** Before 2026-09-20 OneDrive appeared nowhere on the site except as an aside about files changing during a copy. | `2026-09-20` |
| Files locked by Windows are listed as "in use and not copied" rather than dropped quietly | `migration/20-files.md`, `copy.ts` migrationSafety | **DECISION D14**: shadow-copy tooling is unavailable on current Windows client editions, so backup semantics are the default path and the residue is quarantined and reported. **DESIGN.** | `2026-09-20` |
| BitLocker is suspended for exactly one boot before anything about how the machine starts is changed | `migration/10-firmware-and-disk-encryption.md` | **`auros-installer/SAFETY.md`** phase 6 step 1, which makes it unconditional and gives the reason: on TPM 1.2, common across the 2012–2015 cohort we target, changing firmware boot order triggers a recovery-key prompt, and stranding a user there **on the abort path** is the worst outcome the tool can produce. **DESIGN.** | `2026-09-20` |
| Three things break "one restart" — BitLocker on TPM 1.2, Secure Boot's third-party CA, and firmware that ignores `BootNext` — and the tool detects all three before it copies anything | `migration/10-firmware-and-disk-encryption.md`, `faq/6-machine-wont-boot.md` | **`auros-installer/SAFETY.md`**, closing section, which names exactly these three and supplies the honest wording the entry uses. Until 2026-09-20 the site disclosed only Secure Boot, in the FAQ, framed as a post-install boot failure rather than a pre-flight requirement; `grep -rni 'bitlocker\|TPM'` over `src/content/` returned nothing. That is precisely the month-two discovery this site exists to prevent, so the entry is `onLanding: true` rather than an FAQ answer. **DESIGN** — the detection is specified, not built. **BUILD-REQ on workstream C:** phase 1 must detect and report all three, and D27 already records that the firmware half is only honestly testable at Gate 5 on physical machines. | `2026-09-20` |
| A firmware change is a per-machine physical visit, budgeted across the fleet rather than per machine | `migration/10-firmware-and-disk-encryption.md`, `faq/6-machine-wont-boot.md` | True by construction — a firmware setting is not reachable from software, which is the point of it. Deliberately carries **no duration**: the earlier "a thirty-second job" was unmeasured, and at fleet scale the cost is the walking, not the toggling. | `2026-09-20` |
| How a paying customer gets bootable installation media is **not decided** | `pages/3-pricing.mdx`, `migration/20-files.md` | **UNEVIDENCED, and published as an open question rather than as an answer.** **DECISION D13** removed boot-media writing from the Windows tool, correctly, and left a hole: every tier excludes hardware and USB sticks, so by elimination the customer produces the ISO, and the only documented route is on `pages/5` behind `podman` — which **D4**'s zero-terminal directive says may not back anything the product promises. It has a cost, so it is **§9-reserved**; see §11 item 7. The pages state the gap in words instead of leaving the reader to infer it from an exclusions list. | `2026-09-20` |
| The Windows program does not write boot media; media is made elsewhere and the same stick does every machine | `migration/20-files.md`, `copy.ts` migrationSafety.noBootMediaNote | **DECISION D13**, which drops SPEC §6C step 5's literal wording and records the deviation as flagged for the human. The copy gives D13's own reason: raw writes to a disk we do not own, with no undo. **This row exists because the site now describes something SPEC §6C words differently. A human should confirm the deviation is settled before publish.** | `2026-09-20` |
| The archive stays on the customer's premises and is never uploaded | `faq/5-do-you-see-my-data.md`, `pages/1-landing.mdx` | **SPEC** §6C (destination is a local disk). Architectural: there is no upload path in the design. **DESIGN** until the installer exists. | `2026-09-20` |
| "If your network was unplugged for the whole migration it would work the same" | `faq/5-do-you-see-my-data.md` | Follows from the row above. **BUILD-REQ** on workstream C: add an offline run to the installer test matrix so this sentence is measured rather than reasoned. | `2026-09-20` |
| Enterprise wireless that authenticates a user rather than a shared key is a separate conversation | `migration/23-wifi-credentials.md` | True by construction. Stated as a caveat, not a capability. | `2026-09-20` |
| Dual boot is offered only after the archive is verified, and is more dangerous than a clean install | `faq/4-can-i-get-windows-back.md` | **SPEC** §6C optional clause as amended by PLAN §3.7a, which uses the same framing. | `2026-09-20` |
| Windows 10 and 11 licences are usually recorded against the hardware, so a reinstall reactivates | `faq/4-can-i-get-windows-back.md` | **UPSTREAM.** Microsoft's documented digital licence behaviour. Copy already tells the reader to test one machine before relying on it across a fleet. **Verify against Microsoft documentation before publish.** | `2026-09-20` |

## 6. Images, updates, signing and rollback

| Claim | Where | Evidence | verified_on |
|---|---|---|---|
| There is exactly one base image | `layers/4-stratum-2.md`, `pages/6-how-it-works.mdx` | **SPEC** §3. | `2026-09-20` |
| A recipe may add and remove, and may never change the base, the kernel or a package version | `layers/3-stratum-1.md`, `pages/6-how-it-works.mdx` | **SPEC** §3, enforced by the schema validator (PLAN B1). **DESIGN** — the validator does not exist yet. **BUILD-REQ** on workstream B. | `2026-09-20` |
| A customer whose requirement needs a base fork is declined | `layers/3-stratum-1.md`, `migration/04-active-directory.md` | **SPEC** §3 and §9. | `2026-09-20` |
| A security fix is one rebuild, and downstream follows without human action | `layers/4-stratum-2.md`, `pages/6-how-it-works.mdx` | **SPEC** §3. **DESIGN** — Gate 2 is the evidence, and **BLOCKED.md B2** and **DECISION D18** record that instant cross-repo propagation needs a credential the project does not yet have. The copy says "automatically", which a 15-minute poll satisfies. Acceptable. Do not upgrade the wording to "immediately". | `2026-09-20` |
| Images are signed, and a machine will not install an unsigned image | `faq/2-who-has-root.md`, `layers/4-stratum-2.md`, console sample | **SPEC** §6A. **MATRIX** checks `S8` (signature valid and discoverable) and `U4` (offered an unsigned or wrongly-signed image, the upgrade exits non-zero and the booted digest is unchanged). **DECISION D8** records that this does not come for free by deriving from upstream and that we ship the policy ourselves, which is why `U4` is the check that matters. **DECISION D17** records that the signature format is a pinned, time-boxed upstream risk. **DESIGN.** | `2026-09-20` |
| There is no private key to lose; signing is keyless against a public transparency log | `pages/5-replaceable-on-purpose.mdx` | **SPEC** §6A ("cosign, keyless"). **UPSTREAM** for the transparency-log description. Verify wording before publish. | `2026-09-20` |
| The previous image stays on disk, and a machine that fails to reach a login prompt twice rolls back by itself | `faq/3-update-breaks-a-machine.md`, `layers/1-surface.md` | **SPEC** §6A, in those words. **MATRIX** checks `U2` (two deployments retained) and `U3` (repeated failed boots return to the previous deployment). **DECISION D9**: the rollback mechanism is absent from upstream and we install it deliberately, and the storage backend is constrained because of it. **DESIGN.** | `2026-09-20` |
| The site always says "the previous image", singular, and never implies a history of images to choose from | `faq/3-update-breaks-a-machine.md`, `layers/1-surface.md` | **DECISION D10**: exactly one rollback deployment is retained and anything implying otherwise is false. Verified by inspection; `tools/honesty-gate.mjs` also has a rule for it. | `2026-09-20` |
| A machine with no reachable registry keeps working | `faq/5-do-you-see-my-data.md` | **MATRIX** check `U5`. Supports the "unplug the network and it still works" sentence. | `2026-09-20` |
| An image is published only after booting in a VM and passing the full matrix, and the publish step reads the ledger with no override flag | `faq/3-update-breaks-a-machine.md`, `pages/6-how-it-works.mdx`, console legend | **SPEC** §4.3, §8. **MATRIX** header states the gate cannot be overridden. PLAN §3.2 notes the real gate is four layers, of which the CI publish step reading the ledger is the first. **DESIGN.** | `2026-09-20` |
| Removed packages are bytes the customer never downloads | `pages/1-landing.mdx`, `faq/7-updates-one-uplink.md`, `layers/3-stratum-1.md` | **DECISION** D2 (flatten at publish via rechunk). **DESIGN.** | `2026-09-20` |
| The removal report names every removed package with a measured size | `pages/1-landing.mdx`, `layers/3-stratum-1.md`, tier includes | **MATRIX** check `S5` requires a real measured byte count and forbids counting recipe lines. Strong evidence for the shape of the claim. **DESIGN** for its existence. | `2026-09-20` |
| The prune list is asserted every night, and a single survivor fails the build | `pages/3-pricing.mdx`, `pages/6-how-it-works.mdx`, `tiers/4-single-purpose.md` | **MATRIX** check `S3`, including the note that a red morning is correct behaviour rather than flakiness. This is the single best-evidenced claim on the site. | `2026-09-20` |
| Kiosk means the desktop shell and the login manager are absent from the image, not hidden | `tiers/4-single-purpose.md`, `copy.ts` configurator policy options | **SPEC** §6A. **MATRIX** check `S9`, which asserts those specific binaries are absent. **DECISION D12** resolves the wording: the shell and display manager go, shared libraries the closure will not release stay. **The copy must never say "the whole desktop is removed", which would be false.** Verified by inspection. | `2026-09-20` |
| A kiosk image is larger than one purpose-built from a minimal base, and we report the measured size | `tiers/4-single-purpose.md` | **DECISION D12**, including that the trade is made deliberately to keep one base, and that changing it is a §9 decision. Statement against interest. | `2026-09-20` |
| Applications come from Flathub and update themselves, separately from the OS | `layers/2-topsoil.md` | **SPEC** §3. | `2026-09-20` |
| The base is pinned by digest, so two builds stand on the same base | `layers/5-bedrock.md`, console sample | **SPEC** §6A. **MATRIX** check `S1`, which fails on a single character's mismatch. | `2026-09-20` |
| Machines pull and stage in the background, apply on restart, and are not synchronised | `faq/7-updates-one-uplink.md`, `layers/1-surface.md` | **SPEC** §6A for pull-on-boot and staging. **DESIGN.** The "not synchronised" half is **UNEVIDENCED as written** until the agent's schedule is implemented. **BUILD-REQ** on workstream A: either implement jitter or remove that bullet. | `2026-09-20` |
| `bootc status` tells a machine's operator what it is running | `layers/1-surface.md` | **UPSTREAM.** Standard bootc command. Verify before publish. | `2026-09-20` |
| Fedora and Universal Blue are maintained by others and do not depend on us | `layers/5-bedrock.md` | **SPEC** §2, **DECISION** D3. | `2026-09-20` |

## 7. The wind-down term, and the commands under it

**Rewritten in full on 2026-09-20 for DECISION D31.** Until that morning this section evidenced a
licence grant: every recipe public and forkable, rebuild it yourself today, no permission needed.
D30 made everything all rights reserved and D31 replaced the claim with a narrower one that we can
actually keep:

> The customer always had the image. What dies with us is the maintenance. So if Auros ceases
> operating, each customer receives the build files for their own image — the recipe, the base
> Containerfile and the build scripts — and that is a written term, not a licence to our tooling
> and not permission to redistribute.

**The commands below still have to work**, for a reason that is unchanged by the licence: the term
hands over files, and files that do not build are not a handover. A broken command here is worse
than no page at all.
worse than no page at all.**

| Claim | Where | Evidence | verified_on |
|---|---|---|---|
| **The wind-down term itself:** if Auros ceases operating, each customer receives the recipe, the base Containerfile and the build scripts for their own image | `pages/5-replaceable-on-purpose.mdx`, `faq/1-if-you-disappear.md`, `pages/1-landing.mdx`, `tiers/1-one-machine.md`, `copy.ts` replaceable and footer | **DECISION D31**, in those words. **UNEVIDENCED AS A LEGAL TERM, AND BLOCKING:** D31 says it "must be written as a real published term rather than a sentiment", and no terms document exists. The site currently states a commitment that nothing contractual backs. **Needs a human to publish the term before this copy goes live (§9).** | `2026-09-20` |
| The term is **not** a licence to our tooling and **not** redistribution rights | same, plus `tiers/5-self-serve.md` | **DECISION D31** and `LICENSING.md`. The negative half is the part that keeps the positive half honest, and every page that states the term states the limit in the same breath. Verified by inspection of each file on this date. | `2026-09-20` |
| The machines keep booting if we stop: no licence check, no call home, no expiry | `faq/1-if-you-disappear.md`, `pages/5-replaceable-on-purpose.mdx`, `pages/1-landing.mdx`, `tiers/1-one-machine.md` | True by construction — a bootc image is self-contained and nothing in the base contacts us to authorise a boot. **BUILD-REQ on workstream A:** the same check-matrix item that asserts no vendor account and no inbound service is what would prove it. Until that check exists this is a design property, not a measurement. | `2026-09-20` |
| The repositories are readable, and readable is not licensed | `pages/5-replaceable-on-purpose.mdx`, `faq/1-if-you-disappear.md`, `faq/2-who-has-root.md`, `layers/3-stratum-1.md`, `tiers/5-self-serve.md` | **DECISION D31** (public for free CI, all rights reserved). Verified against the root `LICENSE` file, which grants nothing. `honesty-gate` rule `public-recipes` fails the build on wording that invites the copy inference, and rule `licence-grant` on an outright grant. | `2026-09-20` |
| The image contains GPL and LGPL components whose licences give the recipient rights we cannot withhold | `pages/5-replaceable-on-purpose.mdx`, `copy.ts` footer.licenceNote | `LICENSING.md`, and **DECISION D30**, which records it as the part that is not ours to decide. Stated on the site in the customer's favour rather than buried. | `2026-09-20` |
| **No `git clone` appears on the site any more** | `faq/1-if-you-disappear.md`, `pages/5-replaceable-on-purpose.mdx` | Deliberate, and a D31 consequence rather than a tidy-up. Both pages opened with a clone of a public repository, which is an instruction to acquire a copy — the exact inference an all-rights-reserved licence does not support, printed as a command. The handover is files we hand over, so the published commands now start from the files rather than from a clone. The repositories are still public and still readable in a browser; that is a different act and the copy says which one it means. | `2026-09-20` | <!-- auros-allow: this row records the removal of the clone-and-build path; it has to be able to name what was removed -->
| `cd auros-recipes` then `podman build -t myschool:local -f customers/myschool/Containerfile .` rebuilds the image | same | **BUILD-REQ on workstream B, and it is a hard one.** The command is only true if `auros-recipes` **commits the compiled Containerfile next to each `recipe.yaml`**, at that path — **DECISION D28**. Three things were wrong until 2026-09-20 and any one of them made it fail: the published path omitted the `customers/` component; no customer had a committed Containerfile; and `replaceable.yml` asserted it ran the command "verbatim" while running a different string. All three are fixed, and `tools/content-commands.mjs` now resolves every published path against the real sibling repositories on every run, which is what caught the `cd` going missing when these pages were rewritten for D31. **Still blocking:** the job has not gone green on a real run, because it needs `ghcr.io/aarohkandy/auros-base:hardened` to exist (Gate 1). **Do not publish this page until it has.** | `2026-09-20` |
| `podman build -t auros-base:hardened auros-base` rebuilds the base | same | **BUILD-REQ on workstream A:** the base Containerfile must build from a clean clone with no secrets and no private registry access. Verify. | `2026-09-20` |
| The `--build-arg BASE=localhost/auros-base:hardened` override works | `pages/5-replaceable-on-purpose.mdx` | **BUILD-REQ on workstream B:** the compiled Containerfile must take the base as a build argument defaulting to the published image. Without that, the offline rebuild path is broken. Verify. | `2026-09-20` |
| `bootc-image-builder` turns the image into a bootable ISO with the invocation shown | `pages/5-replaceable-on-purpose.mdx` | **UPSTREAM** and **SPEC** §2. The exact flags and the image reference `quay.io/centos-bootc/bootc-image-builder:latest` must be verified against current upstream documentation and by running it once. **Do not publish untested.** | `2026-09-20` |
| Requirements: one `x86_64` Linux machine, `podman`, "a few tens of gigabytes" of free disk, no account with us | `copy.ts` replaceable.requirements, `pages/5-replaceable-on-purpose.mdx`, `faq/1-if-you-disappear.md` | `x86_64` is **SPEC**/`auros.config.json`. `podman` is **SPEC** §2. The disk requirement is deliberately **not a number**: the `40 GB` published until 2026-09-20 was invented, and **DECISION D26** measured the image at `8.4 GB` across 257 layers and found `bootc-image-builder` needed an explicit `20 GiB` root, so the true working set of a full build is unknown and plausibly larger. A reader who sized a disk from an invented figure and ran out mid-build would be right to conclude the instructions were written from imagination — on the replaceability page, the worst possible place to be caught. Replace the words with a measured number once one build has been measured on the runner. | `2026-09-20` |
| Existing machines can be pointed at a registry the customer controls and keep updating | `pages/5-replaceable-on-purpose.mdx` | **UPSTREAM** (bootc supports switching image source). **DESIGN.** Narrowed for D31: this is what a customer does *after* the wind-down handover, with files they were given, not something the site offers anybody who finds the repository. The paragraph now sits inside the handover section for that reason. **BUILD-REQ:** document the exact command or remove the paragraph — a promise with no command under it is the thing this page exists to avoid. | `2026-09-20` |
<!-- auros-allow: 90 days is upstream's own configured retention value, read from their workflow and recorded in DECISIONS.md D21. Not an estimate of ours. -->
| The pinned upstream image is deleted by its maintainers after roughly 90 days, so an old recipe may need its pin moved forward before it will build | `pages/5-replaceable-on-purpose.mdx`, `layers/5-bedrock.md` | **DECISION D21**, which measured upstream's retention policy: `ublue-os/aurora` runs a GHCR cleanup weekly with `older-than: 90 days` and `keep-n-tagged: 7`. Pinning by digest protects us from upstream *moving* a tag; it does not protect us from upstream *deleting the blob*. `auros-base/Containerfile` still resolves `FROM` against upstream rather than against D21's mirror — `auros-base/.github/workflows/build.yml` emits a warning saying exactly that — so the four-year rebuild promise currently has a shelf life measured in months, and until 2026-09-20 the site disclosed none of it. Both pages now state it plainly, including the part that is against our interest: the mirror lives in our namespace, so it helps right up until our registry is the one that has gone. **BUILD-REQ on workstream A:** implement D21 by flipping `FROM` to the mirror, which the mirroring tooling already supports, and then narrow this row. | `2026-09-20` |
| The nightly rebuild workflow is in the repository, and CI is free for us because the repositories are public | `pages/5-replaceable-on-purpose.mdx` | **SPEC** §2 and **DECISION D31**, which records free unlimited Actions minutes on public repositories as the actual reason the repositories are public. **DESIGN** for the workflow's own behaviour. Until 2026-09-20 this row backed a sentence inviting the reader to fork that workflow and run it themselves; that sentence is gone, because the licence does not permit it. Verify GitHub's current free-tier terms before publish. | `2026-09-20` | <!-- auros-allow: repository VISIBILITY as a CI cost fact, recorded here and deliberately not published; no licence is offered by this row -->
| There is no Auros account on the image and nothing listening for us | `faq/2-who-has-root.md` | **DESIGN.** **BUILD-REQ on workstream A:** add a check-matrix item asserting no vendor account, no authorised key of ours, and no inbound service. Until that check exists this is an intention, not a fact. **This is the most load-bearing trust claim on the site and it should be mechanically proved, not written.** | `2026-09-20` |
| We control the base image, so a machine updating from it trusts us like any OS vendor | `faq/2-who-has-root.md` | Statement against interest. No evidence needed; removing it would be the defect. | `2026-09-20` |
| A fleet console does not exist yet | `faq/2-who-has-root.md` | **SPEC** §6E ("Do not build this speculatively"). Accurate. | `2026-09-20` |
| Compatibility table records failures publicly, including honest crosses | `faq/6-machine-wont-boot.md`, `tiers/2-school-nonprofit.md` | **SPEC** §8, §10 Gate 5. `hardware/compat.tsv` exists with its header. **DESIGN** for the rows. | `2026-09-20` |
| VM rows leave physical-only columns empty, and empty means untested | `faq/6-machine-wont-boot.md` | **MATRIX** `profiles.yaml` honesty rule, in those words. Well evidenced. | `2026-09-20` |
| Secure Boot: Fedora's boot loader is signed by a Microsoft certificate authority that some business firmware of that era ships disabled | `faq/6-machine-wont-boot.md` | **MATRIX** `profiles.yaml` `uefi-secureboot`, which records this and names it as the reason for the profile. **UPSTREAM** for the underlying fact. Verify before publish. Note the profile also warns about MOK enrolment for custom kernel modules, which the copy does not mention because we ship none. Re-check if that changes. | `2026-09-20` |
| The check matrix includes a legacy BIOS profile and a Secure Boot profile | `faq/6-machine-wont-boot.md` | **MATRIX** `profiles.yaml` (`bios-legacy`, `uefi-secureboot`). | `2026-09-20` |

## 8. The honest gaps, stated on the site as gaps

These rows exist because the copy admits something is missing. Each is evidenced by the same
internal document that records the gap, and **none of them may be quietly upgraded to a promise
later without a human deciding it.**

| Claim | Where | Evidence | verified_on |
|---|---|---|---|
| Staged rollout by machine group is a design requirement, not something already built | `faq/3-update-breaks-a-machine.md` | Honest. Nothing in SPEC §6A provides it. Correct as written. Revisit when built. | `2026-09-20` |
| Automatic rollback catches a machine that will not boot, not an update that boots and breaks a printer | `faq/3-update-breaks-a-machine.md` | True by construction from the SPEC §6A rollback trigger, which is failure to reach a login prompt. Statement against interest. | `2026-09-20` |
<!-- auros-allow: the row below quotes the three withdrawn figures in order to record that they were withdrawn -->
| No duration estimate appears anywhere on the site | `faq/4-can-i-get-windows-back.md`, `faq/6-machine-wont-boot.md`, `copy.ts` replaceable.verifyNote | Deliberate, and a correction. Three figures were published until 2026-09-20 with no measurement behind any of them and no row in this file: an afternoon per machine to reinstall Windows, a thirty-second job per machine for the firmware setting, and ten minutes to verify the rebuild. The second is the dangerous one — it is per-machine physical work across a fleet the tiers exclude from the price, so at fleet scale it is a day of walking rather than thirty seconds. All three are now stated as the **shape** of the work rather than its duration. `honesty-gate` rule `time-estimate` fails the build on a bare duration in content. | `2026-09-20` |
| The cause we expect most often behind a machine that will not boot is Secure Boot, **and we say we have not measured that** | `faq/6-machine-wont-boot.md` | The Secure Boot mechanism itself is **MATRIX** `profiles.yaml` `uefi-secureboot`, evidenced below. The *ranking* was not: "the most common cause" is a frequency claim, and `hardware/compat.tsv` has one line, its header. The sentence now names itself as an expectation and says it is unmeasured. `honesty-gate` rule `worded-frequency` fails the build on a ranked frequency claim without that qualification. Revisit once `compat.tsv` has rows. | `2026-09-20` |
| There is no on-site caching mirror, and that is what actually solves 180 machines on one uplink | `faq/7-updates-one-uplink.md` | Honest. Nothing in SPEC or PLAN provides it. Correct as written. | `2026-09-20` |
| A nightly base change can be a large pull, and some nights it is a kernel | `faq/7-updates-one-uplink.md` | True by construction. No size figure is given, deliberately, because we have not measured one. | `2026-09-20` |
| `180` and `25` in that answer | `faq/7-updates-one-uplink.md` | Both come from the reader's own question and from SPEC §3's diagram, which uses 180 as the illustrative fleet. Neither is a device count we claim to have in the field. Checked against §4.4. | `2026-09-20` |
| Recipe names are public, so do not put anything private in one | `faq/5-do-you-see-my-data.md`, `copy.ts` configurator.privacyWarning | Follows from SPEC §1.3 and §6D. A warning against our own convenience. | `2026-09-20` |
| Pulling from a public registry tells the registry an address pulled an image | `faq/5-do-you-see-my-data.md` | True by construction. Statement against interest. | `2026-09-20` |

## 9. Social proof, and the absence of it

| Claim | Where | Evidence | verified_on |
|---|---|---|---|
<!-- auros-allow: states the prohibition, does not make the claim -->
| The site contains no customer count, no testimonial, no logo, no device count in the field and no savings figure | all content files | **SPEC** §4.4. Verified by inspection of every file in `src/content/` on 2026-09-20. **Re-verify on every content change.** | `2026-09-20` |
| The build console sample is labelled as an illustration | `copy.ts` buildConsole.sampleLinesMono with `ILLUSTRATION_LABEL` | **SPEC** §4.4 ("the site says what a build looks like, framed as illustration, labelled as such"). **BUILD-REQ on the scaffold owner:** `ILLUSTRATION_LABEL` must be rendered visibly next to the sample, not placed in a title attribute or a tooltip. If the component cannot show it, the sample does not ship. | `2026-09-20` |
| Numbers inside the illustration (`11 packages`, `214 packages`, `3.9 GB`) | `copy.ts` buildConsole.sampleLinesMono | **ILLUSTRATION.** `214` is the figure SPEC §7 itself uses as an example of console output. None of these are measurements. They must never appear outside the labelled sample, and must never be quoted in prose. | `2026-09-20` |
| The landing page makes **no comparative claim about other vendors** | `pages/1-landing.mdx` | **SPEC** §4.4 by extension, and honesty rather than modesty: we have surveyed no competitor. <!-- auros-allow: quotes the withdrawn claim in order to record that it was withdrawn --> Until 2026-09-20 the page asserted that *nobody else selling you a computer shows you what they took out* — an absolute, unevidenced claim about every vendor in the market, on the landing page, with no row in this file, which by this file's own opening rule is itself a defect. SPEC §7 uses that sentence as internal motivation for the configurator panel; on a public page it is comparative advertising. It is replaced by a statement about us and an explicit refusal to rank ourselves. `honesty-gate` rule `competitor-absolute` fails the build on the pattern. | `2026-09-20` |
| "Eleven applications instead of three hundred" | `pages/1-landing.mdx`, `layers/3-stratum-1.md` | **SPEC** §1.2 uses this exact comparison as the statement of the value proposition. It is a description of a shape, not a count of any real fleet. Acceptable, and it must not acquire a customer next to it. | `2026-09-20` |
| The names in the configurator and rebuild examples (`myschool`) are generic | `copy.ts`, `pages/5-replaceable-on-purpose.mdx`, `faq/1-if-you-disappear.md` | Deliberate. The SPEC §3 diagram names `lincoln`, `hopelink` and `westside`, which read as real organisations. **They are not used anywhere in site copy** to avoid implying customers. Verified by inspection. | `2026-09-20` |

## 10. Contact and legal

| Claim | Where | Evidence | verified_on |
|---|---|---|---|
| `hello@auros.example` | `copy.ts` site.contactEmail | **UNEVIDENCED PLACEHOLDER, deliberately un-routable.** SPEC §9 reserves anything touching a real person's inbox. The no-JS mailto fallback required by SPEC §6D depends on this, so **a human must set a real address before launch.** `site.contactEmailIsPlaceholder` is exported so the scaffold can refuse to render a mailto until it is false. | `2026-09-20` |
<!-- auros-allow: the row below names the withdrawn licence in order to record that it was withdrawn. A claims register that may not name a false claim cannot record one. -->
| "All rights reserved. The image includes GPL and LGPL components, whose own licences travel with it to whoever receives it." | `copy.ts` footer.licenceNote | **DECISION D30**, taken mid-session by the human: Apache-2.0 removed from all five repositories and replaced with an all-rights-reserved notice. Verified against `auros-web/LICENSE` and `LICENSING.md`. The previous row asserted the permissive licence and was true until D30 landed, after which it was the most checkable false statement a website can make — the `LICENSE` file is one click from the repository link in the same footer. The GPL/LGPL half is not positioning: the image contains Fedora components whose licences grant rights directly to whoever receives the image, and D30 records that the site must not imply otherwise. `tools/honesty-regressions.test.mjs` now reads `LICENSE` and fails if this string and that file disagree. | `2026-09-20` |

> **RESOLVED 2026-09-20 by DECISION D31.** Kept rather than deleted, because the shape of this
> failure is the most useful thing in the file.
>
> What stood here was the site's largest unresolved claim: D30 made everything all rights
> reserved, which falsified the replaceability promise the whole trust argument rested on —
> `faq/1-if-you-disappear.md` answered the trust question with a clone-and-build command,
> `pages/5-replaceable-on-purpose.mdx` was an entire page built on it, `tiers/5-self-serve.md`
> priced `$0` on the recipes being forkable, and SPEC §1.3 made it the central argument for
> winning a first pilot.
>
> D31 answered it. The claim is now the wind-down handover: the customer always had the image,
> what dies with us is the maintenance, and the written term is that a customer receives the build
> files for their own image if we cease operating. Section 7 is rewritten around that. The one
> piece still outstanding is that the term is **published as copy and does not yet exist as a
> terms document** — that row is the first in section 7 and it blocks publication on its own.
>
> The lesson worth keeping: nothing in CI noticed. Every sentence here stayed grammatical, sober
> and well evidenced against a decision that had been superseded four hours earlier. That is why <!-- auros-allow: the elapsed time between a decision and a stale review is the finding itself, not an estimate of work -->
> this file now carries a **Reviewed against DECISIONS.md** marker that `honesty-gate` fails the
> build on, and a **`verified_on`** date per row. A claims ledger is only as good as the last time
> somebody re-read it against reality.

| Repository URLs under `github.com/aarohkandy/` | `copy.ts` site.repos | `auros.config.json`, **DECISION** D1. Verify each resolves publicly before publish. | `2026-09-20` |

---

## 11. Open items requiring a human decision (§9)

Collected from the rows above. None of these may be resolved by an agent.

1. **Whether the site may be published before Gates 1 to 3**, and if so, the wording of the
   state banner. See section 0.
2. **What each pricing tier includes and excludes.** The lists in `tiers/*.md` are drafted from
   the architecture and are not decided.
3. **Whether the one-machine tier continues to receive nightly rebuilds after a single payment.**
4. **Whether we offer to test a customer's .exe on request.** The offer is no longer published —
   `migration/07`, `pages/2` and `migration/08` now promise a hand lookup in the public database
   and explicitly say we have tested nothing — so this is a decision to take *before* publishing,
   not one the site is already committed to.
5. **The real contact address.**
6. Whether to name a jurisdiction in the safeguarding paragraph.
7. **How a paying customer gets bootable installation media**, and what it costs. D13 removed the
   write from the Windows tool and nobody decided what replaces it. The two candidates are a
   downloadable image published with every build, or the customer producing one from the
   published image. The second exists today only as a `podman` command on `pages/5`, which D4's
   zero-terminal directive says cannot back a promise. Until this is decided the pricing page and
   `migration/20-files.md` say so in words rather than implying an answer.
8. **Whether the one-machine tier's rebuild term is open-ended**, which is item 3 restated now
   that the open-ended wording has been removed from the page rather than merely flagged here.
9. ~~**What replaces the replaceability claim under D30's proprietary licence.**~~ **ANSWERED** by
   **D31**: the wind-down handover. Section 7 is rewritten around it. Two things it left behind,
   both of them still human decisions, are items 10 and 11.
10. **Publish the wind-down term as an actual term.** D31 says it "must be written as a real
    published term rather than a sentiment", and the site now states it in four places while no
    terms document exists anywhere. This is the largest unevidenced claim on the site and it is
    the first row in section 7. **The site does not publish until the term does.**
11. **What the `$0` self-serve tier becomes** — remove it, redefine it at `$0` as read-but-not-
    build, or licence `auros-recipes` permissively on its own. `BLOCKED.md` **B9** has all three with their
    costs. Until then `tiers/5-self-serve.md` carries `blocked: true` and does not render, which
    is the one option that decides nothing. Note B9's own warning: SPEC §6D requires the school
    tier to carry a replacement-cost comparison because *"our real competitor is doing nothing,
    which is free"*, and the `$0` tier was the other half of that argument.

## 12. Verification required before publish (not §9, but blocking)

1. Take `auros-recipes` and `auros-base` onto a machine with no credentials and nothing of ours
   installed, and run every command on `pages/5-replaceable-on-purpose.mdx` and
   `faq/1-if-you-disappear.md`. Any failure means the page is false. Fix the repository or fix
   the page. This is what the wind-down term promises a customer will be able to do, so a
   command that has never been executed is a term we have never tested.
2. Record the Microsoft and Chromium documentation URLs behind D15 in section 3, and confirm the
   password export path still exists in the current browser versions.
3. Verify a migrated Firefox profile opens with saved logins intact in the installer test matrix.
4. ~~Replace the `40 GB` disk estimate with a measured figure or delete it.~~ **Done** — the
   figure is deleted. Measure one real build on the runner and the words can become a number.
5. Confirm `ILLUSTRATION_LABEL` renders visibly beside the console sample.
6. Confirm with the human that **two** deliberate deviations from SPEC §6C are settled, because
   the site describes the amended behaviour in both cases and the spec still carries the original
   words:
   (a) **D13**, §6C step 5 — the Windows program does not write boot media.
       `auros-installer/SAFETY.md` phase 6 has been amended to match, so the contract the code is
       written against and the sentence the customer is sold now agree; until 2026-09-20 SAFETY.md
       still listed *"Write the boot medium"* as a step while the site promised the opposite.
   (b) **§6C.4** — <!-- auros-allow: quotes the spec wording the site deliberately does not use -->
       "any mismatch aborts and changes nothing" is not what the site says, because it is not what
       `SAFETY.md` phase 5 specifies. See the row in section 5.
7. Re-read the WineHQ ratings for Office and Photoshop and re-date them, or remove them.
8. Run `node tools/honesty-regressions.test.mjs` — one named test per fatal and major finding
   from the 2026-09-20 honesty audit, so each specific defect becomes a permanent assertion rather
   than a paragraph somebody remembers. It is wired into `./verify`.
9. Run `node tools/content-commands.mjs`, which reads every fenced shell command in
   `src/content/` and checks that the repository paths inside it exist in the sibling repos. The
   published rebuild command was wrong by one path component for weeks; ten lines of this would
   have caught it on the day it was written.
10. Re-run the §4.4 inspection with `node tools/honesty-gate.mjs auros-web/src` — the whole of
   `src`, not just `content`, because two of the D31 findings were strings in `src/lib` and
   `src/pages` rather than in a content file. The gate also now checks two things no regex can:
   that a workflow the site cites with a cadence actually has an active schedule, and that the
   **Reviewed against DECISIONS.md** marker at the top of this file is not behind the newest
   decision on disk. It's the second that would have caught D30 the same afternoon. It
   <!-- auros-allow: names the forbidden categories in order to forbid them -->
   mechanises this: no customer count, testimonial, logo, device count or savings figure
   anywhere in `src/content/`.
