# CLAIMS

Every factual assertion the Auros website makes, and the evidence for it.

Adding a claim to any file in `src/content/` without adding its row here is a defect. A claim
whose evidence column says **UNEVIDENCED** must not be published until a human has decided it
(spec §9).

Maintained by the agent that owns content. Last reviewed 2026-09-20.

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

| Claim | Where | Evidence |
|---|---|---|
| One machine, `$79`, one-time | `tiers/1-one-machine.md`, `copy.ts` hero | **SPEC** §6D |
| School and nonprofit, `$15` per device per year, `25` device minimum | `tiers/2-school-nonprofit.md` | **SPEC** §6D |
| Business fleet, `$12` per device per month, `10` device minimum | `tiers/3-business-fleet.md` | **SPEC** §6D |
| Single-purpose, `$19` per device per month, `5` device minimum | `tiers/4-single-purpose.md` | **SPEC** §6D |
| Self-serve, `$0`, because recipes are public | `tiers/5-self-serve.md` | **SPEC** §6D, §1.3 |
| Payment is taken only after the test build passes | `pages/3-pricing.mdx`, `copy.ts` pricing.chargeNote | **SPEC** §6D ("Stripe Checkout, charged only after the test build passes") |
| An order opens a pull request in the public recipes repository | `pages/3-pricing.mdx`, `copy.ts` configurator | **SPEC** §6D. **DESIGN** — the Worker does not exist yet. |
| The one-machine tier keeps receiving nightly base rebuilds after a single payment | `tiers/1-one-machine.md` | **UNEVIDENCED.** This is a commercial term, not an architectural fact. It is *consistent* with the architecture (one shared base, marginal cost of one more machine is zero) but nobody has decided it. **Needs human approval per §9.** Until then, do not publish the sentence "for as long as we are here". |
| Tier inclusion lists (recipe, signed image, check matrix, removal report, installer, compatibility table row) | all `tiers/*.md` | Each individual item is **SPEC**/**MATRIX** evidenced elsewhere in this file. Their *bundling into these specific tiers* is **UNEVIDENCED** — no human has defined what each tier includes. **Needs human approval per §9.** |
| Exclusions: no on-site work, no hardware, nothing requiring a base fork | all `tiers/*.md` | Base-fork refusal is **SPEC** §3. On-site work and hardware exclusions are **UNEVIDENCED** commercial terms. **Needs human approval per §9.** |
| "Below `25` devices the one-machine price is usually the better answer" | `tiers/2-school-nonprofit.md` | Arithmetic only: `25 × $15 = $375/yr` against `$79` once. True as stated. No approval needed, but it is a sales statement and a human may want to remove it. |
| No response-time, uptime or support-hours commitment appears anywhere on the site | all | Deliberate. Such a commitment would be **UNEVIDENCED** and §9-reserved, so none is written. |

## 2. The replacement-cost comparison

| Claim | Where | Evidence |
|---|---|---|
| No savings figure appears anywhere on the site | `copy.ts` replacementComparison, `pages/3-pricing.mdx` | **SPEC** §4.4. Verified by inspection: the only numbers in the comparison are the fixed `$15` price and placeholders the reader fills in. |
| "Our real competitor is doing nothing, and doing nothing is free" | `copy.ts` replacementComparison, `pages/3-pricing.mdx` | **SPEC** §6D states this in the same words. Not a market claim; a framing the spec fixes. |
| `C = A × $15 per year` | `copy.ts` replacementComparison.formulaMono | Arithmetic from the §9-fixed price. |
| The site supplies no default, average or example value for A or B | `copy.ts` replacementComparison.inputs | Verified by inspection. Supplying one would manufacture a savings figure by the back door. |
| "An unpatched machine on a network with children on it is a risk decision, not a saving" | `copy.ts` replacementComparison.body | Framing, not a factual claim. No security-outcome statistic is cited, deliberately. |

## 3. What does not come across

The core claim of this whole page is the one SPEC §4.2 makes mandatory.

| Claim | Where | Evidence |
|---|---|---|
| Windows programs do not migrate. None of them. | `migration/01-windows-programs.md`, landing column, `copy.ts` | **SPEC** §4.2, and it is true by construction: a PE executable built for the Win32 API does not run on a Linux kernel without a translation layer, which is treated separately below. |
| The test is "installed program" versus "website in a browser" | `migration/01-windows-programs.md` | True by construction. A web application's runtime is the browser, which exists on both systems. |
| Named examples (Office desktop, Adobe, SolidWorks, Inventor, 2D Design, Sibelius, Cubase, Sage, laser and vinyl cutter drivers, MIS desktop clients) | `migration/01-windows-programs.md` | The claim attached to each name is only ever "this is a Windows program, and Windows programs do not come across", which holds for any Windows build of any product. **No claim is made that any named vendor does or does not ship a Linux or web version.** Copy instructs the reader to check. Verified by inspection of the file. |
| Chrome and Edge saved passwords, cookies and saved card details do not come across | `migration/02-saved-passwords-and-cookies.md`, landing column | **DECISION D15**, which corrects an earlier understatement: since Chrome and Edge 127 the same wrapping covers passwords, cookies and payment data together. Explained in plain words with no acronym and no mechanism name. |
| "Microsoft's own documentation says the policy that relaxes this exists for cases where the data is expected to be portable between computers" | same | **DECISION D15** quotes that documentation. **UPSTREAM.** Record the exact Microsoft URL in this row before publish. |
| We do not build a decryptor, and published methods are malware behaviour | same | **DECISION D15**, in those terms. Statement against interest and the strongest trust sentence on the page. |
| We will not ask you to disable the protection | same | **DECISION D15**. Consistent with **SPEC** §4. |
| Mitigation: browser sync, or export from Chrome's own password manager and import afterwards | same | **DECISION D15** names this as the path the tool walks the user through before the wipe. **UPSTREAM** for the export path continuing to exist. Verify before publish; it has moved between versions. |
| The exported password file is plain readable text | same | **UPSTREAM.** Chromium exports CSV in the clear. Verify. The warning is safety-relevant, so if the mechanism cannot be verified, keep the warning and drop the detail. |
| Firefox profiles come across whole, including saved passwords | `migration/21-firefox-profiles.md` | **UPSTREAM.** Firefox keeps credentials inside the profile directory under its own key material, not under a Windows account key, so the directory is portable. **This is the strongest single asymmetry on the page and it must be tested by the installer test matrix before publish, not merely cited.** **BUILD-REQ** on workstream C: add a check that a migrated Firefox profile opens with saved logins intact. |
| Chrome and Edge bookmarks and history do come across | `migration/22-chrome-edge-bookmarks.md` | **UPSTREAM.** Those stores are not bound to the account key. Same verification requirement, same **BUILD-REQ**. |
| Hardware dongles do not come across | `migration/03-dongles-and-licence-keys.md` | True by construction: a dongle is reached through a vendor kernel driver written for Windows. |
| Node-locked licences may see a reinstalled machine as a different machine | same | **UPSTREAM**, vendor-specific, and the copy says explicitly that this is between the reader and their vendor rather than something we promise. Acceptable as written. |
| Active Directory: domain join, Group Policy, roaming profiles, folder redirection do not come across | `migration/04-active-directory.md` | True by construction. Also **SPEC** §3: a requirement that needs the base changed is a customer we decline, which is what the copy says. |
| "Our lockdown is stronger than Group Policy because it is compiled into the image rather than applied to it" | `migration/04-active-directory.md` | **DESIGN.** Rests on **MATRIX** check `S9` (kiosk implies no shell binaries in the image) and **DECISION** D3 (KDE Kiosk chosen because it makes lockdown provable). Honest today only as a statement about the design. Re-read once `S9` has recorded a pass. |
| Monitoring and classroom-management agents: the Windows version does not come across; a Linux version is a vendor question | `migration/05-monitoring-and-classroom-agents.md` | True by construction for the first half. The second half makes **no claim about any vendor** and supplies the exact question to ask. Verified by inspection: no vendor is named. |
| "In most schools this is a safeguarding obligation, not a preference" | same | General statement about schools' duties. Not a claim about a specific jurisdiction's law, and no statute is cited. If a human wants a jurisdiction named, that is a §9 decision. |
| Exam and lockdown software is designed to detect and refuse environments like a compatibility layer | `migration/06-exam-and-lockdown-software.md` | True by construction: environment and integrity checking is the stated function of that category. No specific product is named. |
| Print management and follow-me clients may not come across; the printer itself does | `migration/09-print-management-clients.md`, `migration/24-printers.md` | Printer migration is **SPEC** §6C.1. The client software caveat is stated conditionally with a test attached and names no vendor. |
| Specialist and assistive software: installed versions do not come across, many have web versions | `migration/08-specialist-and-assistive-software.md` | No product is named anywhere in the file, deliberately, and the copy instructs the reader to get the answer in writing from their supplier. Verified by inspection. |

## 4. The .exe compatibility story

SPEC §4.2 and §11.3 bound this absolutely: never imply blanket compatibility.

| Claim | Where | Evidence |
|---|---|---|
| A compatibility layer exists and we can install it | `migration/07-exe-compatibility-layer.md` | **DECISION** D4.3 (`compat_layer` recipe field installs Bottles or WINE from Flathub). **DESIGN** — the recipe field does not exist yet. **BUILD-REQ** on workstream B. |
| It is a translation layer, not an emulator or a virtual machine | same | **UPSTREAM**, and it is the project's own documented description of itself. Verify wording before publish. |
| Anything with a kernel driver, a dongle, copy protection or anti-tamper does not run | same | True by construction: a translation layer implements user-space APIs, not the Windows kernel driver model. |
| Printing, file dialogs and hardware access break first | same | **UPSTREAM**, widely documented, and stated as a tendency rather than a rule. Acceptable. Re-word to "in our testing" only once we have testing. |
| The WineHQ Application Database is the place to look up a specific version | same | **UPSTREAM.** Public database. Verify the address `appdb.winehq.org` resolves before publish. |
| "Send us your list and we go through it with you by hand" | `migration/07-exe-compatibility-layer.md`, `pages/2-what-doesnt-come-across.mdx`, `copy.ts` | **DECISION D16**: compatibility scoping is a hand-curated internal table plus manual lookups during the sales conversation. The copy promises exactly that and no turnaround time. Acceptable. It becomes **UNEVIDENCED** again the moment anybody adds a time commitment to it. |
| Microsoft Office rates `Garbage` and Adobe Photoshop rates `Silver` in the public compatibility database, read on `2026-09-20` | `migration/07-exe-compatibility-layer.md`, `pages/2-what-doesnt-come-across.mdx` | **DECISION D16**, read directly from WineHQ AppDB on that date: Office 365 Business, Office 2021 Pro Plus and Office 365 ProPlus all Garbage; every Photoshop CC 2019 to 2024 Silver, on small samples and stale versions, with no 2025 or 2026 entry. The copy attributes the ratings to that database, gives the date, and calls them somebody else's measurements. **Re-read and re-date annually, or remove.** |
| Office and Adobe are on the explicit does-not list rather than in a caveat | `migration/01-windows-programs.md`, `migration/07-exe-compatibility-layer.md` | **DECISION D16**, **SPEC** §4.2. |
| There is no paste-your-list compatibility checker and there will not be one | `migration/07-exe-compatibility-layer.md` | **DECISION D16**: the database has no machine-readable interface and sits behind a deliberate anti-automation control. Building one would mean circumventing it. Statement against our own convenience. |
| We do not offer a Windows virtual machine alongside the image | `migration/07-exe-compatibility-layer.md` | **DECISION D16**: it needs a Windows licence per device on top, and its own floor is `4 GB` of memory for the virtual machine on laptops with `4 GB` in total. The copy states both numbers. |
| The site never states that .exe files work | everywhere | **SPEC** §4.2, §11.3. Verified by inspection: every statement is conditional, and `copy.ts` doesNotComeAcrossColumn.footnote states the negative explicitly. |

## 5. The migration installer and data safety

| Claim | Where | Evidence |
|---|---|---|
| Files are copied to a disk that is not the system disk, then verified by file count and per-file hash, and only then is anything written | `migration/20-files.md`, `pages/1-landing.mdx`, `copy.ts` migrationSafety | **SPEC** §4.1 and §6C. **DESIGN** — the installer does not exist. Gate 3 is the evidence, and it requires 100 clean runs and 20 clean aborts. |
| Any mismatch aborts and changes nothing; Windows still boots | same | **SPEC** §6C.4 and the Gate 3 exit condition. **DESIGN.** |
| The installer reads the machine's actual installed-programs list and requires acknowledgement | `migration/01-windows-programs.md`, `copy.ts` migrationSafety | **SPEC** §6C.2. **DESIGN.** |
| Wi-Fi network names and keys, printers, default printer and account name are carried over | `migration/23-wifi-credentials.md`, `24-printers.md`, `25-account-name.md` | **SPEC** §4.2 and §6C.1 name exactly these. **DESIGN.** |
| The restore re-verifies on first boot and reports the file count on the desktop, and shows any discrepancy rather than swallowing it | `migration/20-files.md` | **SPEC** §6C, Linux side. **MATRIX** check `R1`, which fails on any discrepancy that is swallowed rather than shown. **DESIGN.** |
| Files locked by Windows are listed as "in use and not copied" rather than dropped quietly | `migration/20-files.md`, `copy.ts` migrationSafety | **DECISION D14**: shadow-copy tooling is unavailable on current Windows client editions, so backup semantics are the default path and the residue is quarantined and reported. **DESIGN.** |
| The Windows program does not write boot media; media is made elsewhere and the same stick does every machine | `migration/20-files.md`, `copy.ts` migrationSafety.noBootMediaNote | **DECISION D13**, which drops SPEC §6C step 5's literal wording and records the deviation as flagged for the human. The copy gives D13's own reason: raw writes to a disk we do not own, with no undo. **This row exists because the site now describes something SPEC §6C words differently. A human should confirm the deviation is settled before publish.** |
| The archive stays on the customer's premises and is never uploaded | `faq/5-do-you-see-my-data.md`, `pages/1-landing.mdx` | **SPEC** §6C (destination is a local disk). Architectural: there is no upload path in the design. **DESIGN** until the installer exists. |
| "If your network was unplugged for the whole migration it would work the same" | `faq/5-do-you-see-my-data.md` | Follows from the row above. **BUILD-REQ** on workstream C: add an offline run to the installer test matrix so this sentence is measured rather than reasoned. |
| Enterprise wireless that authenticates a user rather than a shared key is a separate conversation | `migration/23-wifi-credentials.md` | True by construction. Stated as a caveat, not a capability. |
| Dual boot is offered only after the archive is verified, and is more dangerous than a clean install | `faq/4-can-i-get-windows-back.md` | **SPEC** §6C optional clause as amended by PLAN §3.7a, which uses the same framing. |
| Windows 10 and 11 licences are usually recorded against the hardware, so a reinstall reactivates | `faq/4-can-i-get-windows-back.md` | **UPSTREAM.** Microsoft's documented digital licence behaviour. Copy already tells the reader to test one machine before relying on it across a fleet. **Verify against Microsoft documentation before publish.** |

## 6. Images, updates, signing and rollback

| Claim | Where | Evidence |
|---|---|---|
| There is exactly one base image | `layers/4-stratum-2.md`, `pages/6-how-it-works.mdx` | **SPEC** §3. |
| A recipe may add and remove, and may never change the base, the kernel or a package version | `layers/3-stratum-1.md`, `pages/6-how-it-works.mdx` | **SPEC** §3, enforced by the schema validator (PLAN B1). **DESIGN** — the validator does not exist yet. **BUILD-REQ** on workstream B. |
| A customer whose requirement needs a base fork is declined | `layers/3-stratum-1.md`, `migration/04-active-directory.md` | **SPEC** §3 and §9. |
| A security fix is one rebuild, and downstream follows without human action | `layers/4-stratum-2.md`, `pages/6-how-it-works.mdx` | **SPEC** §3. **DESIGN** — Gate 2 is the evidence, and **BLOCKED.md B2** and **DECISION D18** record that instant cross-repo propagation needs a credential the project does not yet have. The copy says "automatically", which a 15-minute poll satisfies. Acceptable. Do not upgrade the wording to "immediately". |
| Images are signed, and a machine will not install an unsigned image | `faq/2-who-has-root.md`, `layers/4-stratum-2.md`, console sample | **SPEC** §6A. **MATRIX** checks `S8` (signature valid and discoverable) and `U4` (offered an unsigned or wrongly-signed image, the upgrade exits non-zero and the booted digest is unchanged). **DECISION D8** records that this does not come for free by deriving from upstream and that we ship the policy ourselves, which is why `U4` is the check that matters. **DECISION D17** records that the signature format is a pinned, time-boxed upstream risk. **DESIGN.** |
| There is no private key to lose; signing is keyless against a public transparency log | `pages/5-replaceable-on-purpose.mdx` | **SPEC** §6A ("cosign, keyless"). **UPSTREAM** for the transparency-log description. Verify wording before publish. |
| The previous image stays on disk, and a machine that fails to reach a login prompt twice rolls back by itself | `faq/3-update-breaks-a-machine.md`, `layers/1-surface.md` | **SPEC** §6A, in those words. **MATRIX** checks `U2` (two deployments retained) and `U3` (repeated failed boots return to the previous deployment). **DECISION D9**: the rollback mechanism is absent from upstream and we install it deliberately, and the storage backend is constrained because of it. **DESIGN.** |
| The site always says "the previous image", singular, and never implies a history of images to choose from | `faq/3-update-breaks-a-machine.md`, `layers/1-surface.md` | **DECISION D10**: exactly one rollback deployment is retained and anything implying otherwise is false. Verified by inspection; `tools/honesty-gate.mjs` also has a rule for it. |
| A machine with no reachable registry keeps working | `faq/5-do-you-see-my-data.md` | **MATRIX** check `U5`. Supports the "unplug the network and it still works" sentence. |
| An image is published only after booting in a VM and passing the full matrix, and the publish step reads the ledger with no override flag | `faq/3-update-breaks-a-machine.md`, `pages/6-how-it-works.mdx`, console legend | **SPEC** §4.3, §8. **MATRIX** header states the gate cannot be overridden. PLAN §3.2 notes the real gate is four layers, of which the CI publish step reading the ledger is the first. **DESIGN.** |
| Removed packages are bytes the customer never downloads | `pages/1-landing.mdx`, `faq/7-updates-one-uplink.md`, `layers/3-stratum-1.md` | **DECISION** D2 (flatten at publish via rechunk). **DESIGN.** |
| The removal report names every removed package with a measured size | `pages/1-landing.mdx`, `layers/3-stratum-1.md`, tier includes | **MATRIX** check `S5` requires a real measured byte count and forbids counting recipe lines. Strong evidence for the shape of the claim. **DESIGN** for its existence. |
| The prune list is asserted every night, and a single survivor fails the build | `pages/3-pricing.mdx`, `pages/6-how-it-works.mdx`, `tiers/4-single-purpose.md` | **MATRIX** check `S3`, including the note that a red morning is correct behaviour rather than flakiness. This is the single best-evidenced claim on the site. |
| Kiosk means the desktop shell and the login manager are absent from the image, not hidden | `tiers/4-single-purpose.md`, `copy.ts` configurator policy options | **SPEC** §6A. **MATRIX** check `S9`, which asserts those specific binaries are absent. **DECISION D12** resolves the wording: the shell and display manager go, shared libraries the closure will not release stay. **The copy must never say "the whole desktop is removed", which would be false.** Verified by inspection. |
| A kiosk image is larger than one purpose-built from a minimal base, and we report the measured size | `tiers/4-single-purpose.md` | **DECISION D12**, including that the trade is made deliberately to keep one base, and that changing it is a §9 decision. Statement against interest. |
| Applications come from Flathub and update themselves, separately from the OS | `layers/2-topsoil.md` | **SPEC** §3. |
| The base is pinned by digest, so two builds stand on the same base | `layers/5-bedrock.md`, console sample | **SPEC** §6A. **MATRIX** check `S1`, which fails on a single character's mismatch. |
| Machines pull and stage in the background, apply on restart, and are not synchronised | `faq/7-updates-one-uplink.md`, `layers/1-surface.md` | **SPEC** §6A for pull-on-boot and staging. **DESIGN.** The "not synchronised" half is **UNEVIDENCED as written** until the agent's schedule is implemented. **BUILD-REQ** on workstream A: either implement jitter or remove that bullet. |
| `bootc status` tells a machine's operator what it is running | `layers/1-surface.md` | **UPSTREAM.** Standard bootc command. Verify before publish. |
| Fedora and Universal Blue are maintained by others and do not depend on us | `layers/5-bedrock.md` | **SPEC** §2, **DECISION** D3. |

## 7. Trust, replaceability and the rebuild instructions

**These instructions must work. They are the main trust asset, and a broken command here is
worse than no page at all.**

| Claim | Where | Evidence |
|---|---|---|
| Every recipe is a public git repository, including the customer's | `pages/5-replaceable-on-purpose.mdx`, `faq/1-if-you-disappear.md`, `tiers/5-self-serve.md` | **SPEC** §1.3, §5. **DECISION** D6 (auros-recipes must be independently public and forkable for this claim to be true). Repository exists. |
| `git clone https://github.com/aarohkandy/auros-recipes` | `faq/1-if-you-disappear.md`, `pages/5-replaceable-on-purpose.mdx` | Repository exists locally and is named in `auros.config.json`. **BUILD-REQ:** must be public on GitHub before publish. **Verify by cloning from a machine with no credentials.** |
| `podman build -t myschool:local -f myschool/Containerfile .` rebuilds the image | same | **BUILD-REQ on workstream B, and it is a hard one.** This command is only true if `auros-recipes` **commits the compiled Containerfile next to each `recipe.yaml`**. If the Containerfile is generated at build time by a compiler that is not in the repository, this instruction is false and the page's central promise is false with it. Recorded here as a requirement the website places on the recipe repository. **Do not publish this page until a clean clone builds.** |
| `podman build -t auros-base:hardened auros-base` rebuilds the base | same | **BUILD-REQ on workstream A:** the base Containerfile must build from a clean clone with no secrets and no private registry access. Verify. |
| The `--build-arg BASE=localhost/auros-base:hardened` override works | `pages/5-replaceable-on-purpose.mdx` | **BUILD-REQ on workstream B:** the compiled Containerfile must take the base as a build argument defaulting to the published image. Without that, the offline rebuild path is broken. Verify. |
| `bootc-image-builder` turns the image into a bootable ISO with the invocation shown | `pages/5-replaceable-on-purpose.mdx` | **UPSTREAM** and **SPEC** §2. The exact flags and the image reference `quay.io/centos-bootc/bootc-image-builder:latest` must be verified against current upstream documentation and by running it once. **Do not publish untested.** |
| Requirements: one `x86_64` Linux machine, `podman`, about `40 GB` free disk, no account with us | `copy.ts` replaceable.requirements | `x86_64` is **SPEC**/`auros.config.json`. `podman` is **SPEC** §2. **The `40 GB` figure is an estimate and is UNEVIDENCED.** Measure a real build and replace it with the measured number, or remove the figure. |
| Existing machines can be pointed at a registry the customer controls and keep updating | `pages/5-replaceable-on-purpose.mdx` | **UPSTREAM** (bootc supports switching image source). **DESIGN.** **BUILD-REQ:** document the exact command, or remove the paragraph. A promise with no command under it is the thing this page exists to avoid. |
| The nightly rebuild workflow is in the repository and runs on free CI for public repositories | `pages/5-replaceable-on-purpose.mdx`, `tiers/5-self-serve.md` | **SPEC** §2 (GitHub Actions free for public repos). **DESIGN** for the workflow's existence. Verify GitHub's current free-tier terms before publish. |
| There is no Auros account on the image and nothing listening for us | `faq/2-who-has-root.md` | **DESIGN.** **BUILD-REQ on workstream A:** add a check-matrix item asserting no vendor account, no authorised key of ours, and no inbound service. Until that check exists this is an intention, not a fact. **This is the most load-bearing trust claim on the site and it should be mechanically proved, not written.** |
| We control the base image, so a machine updating from it trusts us like any OS vendor | `faq/2-who-has-root.md` | Statement against interest. No evidence needed; removing it would be the defect. |
| A fleet console does not exist yet | `faq/2-who-has-root.md` | **SPEC** §6E ("Do not build this speculatively"). Accurate. |
| Compatibility table records failures publicly, including honest crosses | `faq/6-machine-wont-boot.md`, `tiers/2-school-nonprofit.md` | **SPEC** §8, §10 Gate 5. `hardware/compat.tsv` exists with its header. **DESIGN** for the rows. |
| VM rows leave physical-only columns empty, and empty means untested | `faq/6-machine-wont-boot.md` | **MATRIX** `profiles.yaml` honesty rule, in those words. Well evidenced. |
| Secure Boot: Fedora's boot loader is signed by a Microsoft certificate authority that some business firmware of that era ships disabled | `faq/6-machine-wont-boot.md` | **MATRIX** `profiles.yaml` `uefi-secureboot`, which records this and names it as the reason for the profile. **UPSTREAM** for the underlying fact. Verify before publish. Note the profile also warns about MOK enrolment for custom kernel modules, which the copy does not mention because we ship none. Re-check if that changes. |
| The check matrix includes a legacy BIOS profile and a Secure Boot profile | `faq/6-machine-wont-boot.md` | **MATRIX** `profiles.yaml` (`bios-legacy`, `uefi-secureboot`). |

## 8. The honest gaps, stated on the site as gaps

These rows exist because the copy admits something is missing. Each is evidenced by the same
internal document that records the gap, and **none of them may be quietly upgraded to a promise
later without a human deciding it.**

| Claim | Where | Evidence |
|---|---|---|
| Staged rollout by machine group is a design requirement, not something already built | `faq/3-update-breaks-a-machine.md` | Honest. Nothing in SPEC §6A provides it. Correct as written. Revisit when built. |
| Automatic rollback catches a machine that will not boot, not an update that boots and breaks a printer | `faq/3-update-breaks-a-machine.md` | True by construction from the SPEC §6A rollback trigger, which is failure to reach a login prompt. Statement against interest. |
| There is no on-site caching mirror, and that is what actually solves 180 machines on one uplink | `faq/7-updates-one-uplink.md` | Honest. Nothing in SPEC or PLAN provides it. Correct as written. |
| A nightly base change can be a large pull, and some nights it is a kernel | `faq/7-updates-one-uplink.md` | True by construction. No size figure is given, deliberately, because we have not measured one. |
| `180` and `25` in that answer | `faq/7-updates-one-uplink.md` | Both come from the reader's own question and from SPEC §3's diagram, which uses 180 as the illustrative fleet. Neither is a device count we claim to have in the field. Checked against §4.4. |
| Recipe names are public, so do not put anything private in one | `faq/5-do-you-see-my-data.md`, `copy.ts` configurator.privacyWarning | Follows from SPEC §1.3 and §6D. A warning against our own convenience. |
| Pulling from a public registry tells the registry an address pulled an image | `faq/5-do-you-see-my-data.md` | True by construction. Statement against interest. |

## 9. Social proof, and the absence of it

| Claim | Where | Evidence |
|---|---|---|
<!-- auros-allow: states the prohibition, does not make the claim -->
| The site contains no customer count, no testimonial, no logo, no device count in the field and no savings figure | all content files | **SPEC** §4.4. Verified by inspection of every file in `src/content/` on 2026-09-20. **Re-verify on every content change.** |
| The build console sample is labelled as an illustration | `copy.ts` buildConsole.sampleLinesMono with `ILLUSTRATION_LABEL` | **SPEC** §4.4 ("the site says what a build looks like, framed as illustration, labelled as such"). **BUILD-REQ on the scaffold owner:** `ILLUSTRATION_LABEL` must be rendered visibly next to the sample, not placed in a title attribute or a tooltip. If the component cannot show it, the sample does not ship. |
| Numbers inside the illustration (`11 packages`, `214 packages`, `3.9 GB`) | `copy.ts` buildConsole.sampleLinesMono | **ILLUSTRATION.** `214` is the figure SPEC §7 itself uses as an example of console output. None of these are measurements. They must never appear outside the labelled sample, and must never be quoted in prose. |
| "Eleven applications instead of three hundred" | `pages/1-landing.mdx`, `layers/3-stratum-1.md` | **SPEC** §1.2 uses this exact comparison as the statement of the value proposition. It is a description of a shape, not a count of any real fleet. Acceptable, and it must not acquire a customer next to it. |
| The names in the configurator and rebuild examples (`myschool`) are generic | `copy.ts`, `pages/5-replaceable-on-purpose.mdx`, `faq/1-if-you-disappear.md` | Deliberate. The SPEC §3 diagram names `lincoln`, `hopelink` and `westside`, which read as real organisations. **They are not used anywhere in site copy** to avoid implying customers. Verified by inspection. |

## 10. Contact and legal

| Claim | Where | Evidence |
|---|---|---|
| `hello@auros.example` | `copy.ts` site.contactEmail | **UNEVIDENCED PLACEHOLDER, deliberately un-routable.** SPEC §9 reserves anything touching a real person's inbox. The no-JS mailto fallback required by SPEC §6D depends on this, so **a human must set a real address before launch.** `site.contactEmailIsPlaceholder` is exported so the scaffold can refuse to render a mailto until it is false. |
| Site and source released under Apache 2.0 | `copy.ts` footer.licenceNote | `LICENSE` files in all four repositories are Apache 2.0. Verified 2026-09-20. |
| Repository URLs under `github.com/aarohkandy/` | `copy.ts` site.repos | `auros.config.json`, **DECISION** D1. Verify each resolves publicly before publish. |

---

## 11. Open items requiring a human decision (§9)

Collected from the rows above. None of these may be resolved by an agent.

1. **Whether the site may be published before Gates 1 to 3**, and if so, the wording of the
   state banner. See section 0.
2. **What each pricing tier includes and excludes.** The lists in `tiers/*.md` are drafted from
   the architecture and are not decided.
3. **Whether the one-machine tier continues to receive nightly rebuilds after a single payment.**
4. **Whether we offer to test a customer's .exe on request**, which is written into
   `migration/07-exe-compatibility-layer.md` as an offer.
5. **The real contact address.**
6. Whether to name a jurisdiction in the safeguarding paragraph.

## 12. Verification required before publish (not §9, but blocking)

1. Clone `auros-recipes` and `auros-base` on a machine with no credentials and run every command
   on `pages/5-replaceable-on-purpose.mdx` and `faq/1-if-you-disappear.md`. Any failure means the
   page is false. Fix the repository or fix the page.
2. Record the Microsoft and Chromium documentation URLs behind D15 in section 3, and confirm the
   password export path still exists in the current browser versions.
3. Verify a migrated Firefox profile opens with saved logins intact in the installer test matrix.
4. Replace the `40 GB` disk estimate with a measured figure or delete it.
5. Confirm `ILLUSTRATION_LABEL` renders visibly beside the console sample.
6. Confirm with the human that D13's deviation from SPEC §6C step 5 is settled, since the site
   now describes the D13 behaviour rather than the §6C wording.
7. Re-read the WineHQ ratings for Office and Photoshop and re-date them, or remove them.
8. Re-run the §4.4 inspection with `node tools/honesty-gate.mjs auros-web/src/content`, which
   <!-- auros-allow: names the forbidden categories in order to forbid them -->
   mechanises this: no customer count, testimonial, logo, device count or savings figure
   anywhere in `src/content/`.
