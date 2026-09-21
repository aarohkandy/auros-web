/**
 * AUROS — strings used inside components.
 *
 * Long-form prose lives in `src/content/**` as MDX. This file holds the strings that are not
 * prose: navigation, headings, labels, buttons, empty states, error text, and the small number
 * of structured blocks (the pricing arithmetic, the console sample) that a component assembles
 * rather than renders from a document.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * THE MONO CONVENTION (spec §7)
 * Anything factual is set in IBM Plex Mono. In this file that is marked by the type system and
 * by nothing else:
 *   - every `Fact.value` renders mono, `Fact.label` does not
 *   - every field whose name ends in `Mono` renders mono
 * A string that is not a fact never gets mono. Emphasis is not a reason.
 *
 * THE ILLUSTRATION RULE (spec §4.4)
 * We have no customers. No string in this file may state or imply a customer count, a
 * testimonial, a logo, a device count in the field, or a savings figure. auros-allow: this
 * comment states the prohibition, it does not make the claim. Any sample output
 * shown on the site is rendered with `ILLUSTRATION_LABEL` attached to it, visibly, always.
 *
 * VOICE
 * Plain, specific, unhurried. Short declarative sentences. Concrete nouns. No exclamation
 * marks. No "simply", "revolutionary", "seamless", "effortless", "just". The confidence comes
 * from specificity, not from adjectives.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 */

/** A label/value pair. `value` is a fact and renders in IBM Plex Mono. */
export type Fact = { label: string; value: string };

/** Attached, visibly, to every sample output on the site. Never omitted. Never abbreviated. */
export const ILLUSTRATION_LABEL =
  "Illustration. This is what a build looks like, not a build we have run for a customer.";

export const site = {
  name: "Auros",
  /** Used as the <title> suffix. */
  tagline: "An OS with only what you asked for",
  description:
    "We build schools and nonprofits a Linux image containing only what they asked for, in their language, under their rules, rebuilt every night against upstream so a security fix is one file changed.",
  /**
   * PLACEHOLDER. Not a real inbox. Spec §9 reserves anything touching a real person's inbox to
   * the human, so this address is deliberately un-routable until a human sets it. The no-JS
   * fallback depends on it, so it must be set before launch, and it must be set by a human.
   */
  contactEmail: "hello@auros.example",
  contactEmailIsPlaceholder: true,
  repos: {
    base: "https://github.com/aarohkandy/auros-base",
    recipes: "https://github.com/aarohkandy/auros-recipes",
    installer: "https://github.com/aarohkandy/auros-installer",
    web: "https://github.com/aarohkandy/auros-web",
  },
} as const;

export const nav = {
  items: [
    { href: "/what-doesnt-come-across", label: "What doesn't come across" },
    { href: "/how-it-works", label: "How it works" },
    { href: "/pricing", label: "Pricing" },
    { href: "/replaceable", label: "Replaceable" },
    { href: "/faq", label: "Questions" },
  ],
  /** Screen-reader label for the landmark. */
  ariaLabel: "Main",
  skipToContent: "Skip to content",
} as const;

export const hero = {
  headline: "An OS with only what you asked for",
  standfirst:
    "Your 2012 to 2018 laptops are not broken. Windows stopped patching them, which is a different problem with a different fix. We build them an operating system holding the ten or so applications your staff actually open and nothing else, in the language the class is taught in, rebuilt every night against upstream so that when a serious vulnerability lands there is one file to change and every machine has it on the next restart. How long we keep doing that for any one tier is a term nobody here has set, and the pricing page says so rather than implying a horizon.",
  /**
   * The real `first_boot_message` from `auros-recipes/customers/example-school/recipe.yaml` — a
   * committed public file carrying `# ILLUSTRATIVE EXAMPLE — not a customer` on line 1.
   *
   * Printed rather than described. The site said "in your language" four times and never once
   * showed a language, and the 261 KB Devanagari subset in `public/fonts/` has been sitting
   * behind a `unicode-range` waiting for a string that already existed in the repository.
   */
  firstBoot: {
    lead: "The worked example in our public recipes repository is written for a Marathi-medium secondary school that does not exist. Build it and the machines finish setting themselves up and say this:",
    messageMono: "नमस्कार! काही अडचण असल्यास शिक्षकांना सांगा.",
    gloss: "Hello. If something goes wrong, tell a teacher.",
    sourceMono: "auros-recipes/customers/example-school/recipe.yaml",
    note: "One line of a file anyone can read, and most of the argument. A shared classroom laptop would greet a fourteen-year-old in the language the lesson is in, because somebody wrote that sentence down and the build puts it in the image. Nobody has to find a setting afterwards. No such machine has been imaged yet, and the day one is, that is what it says.",
  },
  primaryCta: { label: "Configure a build", href: "/configure" },
  secondaryCta: { label: "Read what doesn't come across", href: "/what-doesnt-come-across" },
  /** Sits under the CTAs. A fact, so it renders mono. */
  priceNoteMono: "$79 one machine · $15 per device per year for schools, 25 minimum",
} as const;

/**
 * The above-the-fold column required by spec §6D. Entries come from the `migration` collection
 * where `onLanding` is true; these are the strings around them.
 */
export const doesNotComeAcrossColumn = {
  title: "what doesn't come across",
  standfirst:
    "This belongs at the top rather than on page four. The organisations that migrate successfully knew this on day one. The ones that leave in month two found out in month two.",
  /** Rendered against each entry in the column. */
  verdictLabels: {
    "does-not": "does not come across",
    conditional: "depends on your copy, and here is how to check",
    comes: "comes across",
  },
  footnote:
    "Windows programs do not run on Linux. A compatibility layer exists, some programs work under it, and many do not. Send us your list and we go through it with you by hand before you spend anything. We will never tell you that .exe files work.",
  moreLink: { label: "The full inventory", href: "/what-doesnt-come-across" },
} as const;

export const comesAcrossColumn = {
  title: "what does come across",
  standfirst:
    "Copied to a second disk, counted, and hashed before a single byte of the old system is touched.",
  moreLink: { label: "How the migration is ordered", href: "/what-doesnt-come-across#files" },
} as const;

export const migrationPage = {
  filterAll: "Everything",
  filterDoesNot: "Does not come across",
  filterConditional: "Depends on your copy",
  filterComes: "Comes across",
  howToCheckLabel: "How to check yours",
  examplesLabel: "For example",
  /** Shown above the conditional entries. */
  conditionalNote:
    "Conditional means the answer depends on a fact about your copy that we cannot know from here. Every one of these has a test attached, and every test is something you can do this week without buying anything.",
} as const;

export const pricing = {
  title: "Pricing",
  standfirst:
    "Four tiers, each a price and a minimum. There was a fifth at $0, and what nothing bought was the right to build the recipes yourself. The licence changed on 2026-09-20 and took the product out of that tier, so it is held back rather than repriced by whoever happened to be editing this page. Pricing is a decision for a person.",
  perDeviceNote: "Prices are per device. There is no quote to request and no discount to negotiate for.",
  minimumLabel: "Minimum",
  includesLabel: "Includes",
  excludesLabel: "Does not include",
  noMinimumLabel: "No minimum",
  chargeNote:
    "Payment is taken after your test build passes, not when you order. If the build does not pass there is nothing to refund, because you were not charged.",
  orderNote:
    "An order becomes a pull request in the public recipes repository. You read the exact file before it is built.",
} as const;

/**
 * The replacement-cost comparison required alongside the school tier (spec §6D).
 *
 * §4.4 forbids a savings figure, and there is a second reason not to print one: the honest
 * competitor is doing nothing, and doing nothing is free. So this block is arithmetic the
 * reader performs with their own numbers. Every number in it comes from the reader except the
 * price, which is fixed by spec §9.
 */
export const replacementComparison = {
  title: "Compared to what",
  standfirst:
    "Our real competitor is doing nothing. Doing nothing is free. A pricing page that pretends your alternative is a purchase order for new laptops is arguing with something you never said.",
  /** The reader fills these in. The site never supplies a default, an average, or an example. */
  inputs: [
    {
      keyMono: "A",
      label: "Machines you would otherwise retire this year",
      hint: "Count the cupboard. Not the ones that are genuinely dead.",
    },
    {
      keyMono: "B",
      label: "What one replacement machine costs you, all in",
      hint: "The machine, the charger, the imaging time, the disposal, the trolley slot.",
    },
    {
      keyMono: "C",
      label: "What Auros costs for those machines",
      hint: "A multiplied by $15, per year, with a 25-device minimum — so below 25 machines the figure is 25 × $15.",
    },
  ],
  /** Rendered in mono next to the inputs. */
  formulaMono: "C = max(A, 25) × $15 per year",
  body: [
    "Compare A × B against C. You have both numbers and we have neither, which is why the page does the arithmetic and not the arguing.",
    "If B is effectively zero because you were never going to replace them, then the comparison is C against nothing, and the question stops being financial. It becomes whether a machine that still works but no longer receives security updates is something you are willing to keep on a network with children on it. That is a risk decision and we are not going to dress it up as a saving.",
    "There is a third column nobody puts in the spreadsheet: the machines you keep and do nothing about. That column has a cost too, and we are not going to estimate it for you.",
  ],
  noFigureNote:
    "We do not print a savings figure. We have no customers, so any figure would be invented, and a number you cannot check is worth less than no number at all.",
} as const;

export const configurator = {
  title: "Configure a build",
  standfirst:
    "Answer the questions on the left. The file on the right is the actual recipe that gets built, including the list of what gets deleted.",
  outputPanelTitle: "Your recipe",
  outputPanelSubtitleMono: "recipe.yaml",
  removeBlockNote:
    "The remove block is the product. Everything named there is deleted from the image, so it is not something anyone can open.",
  emptyState:
    "Nothing chosen yet. As you answer, this file fills in, and it is the file we build.",
  submitLabel: "Open this as a pull request",
  submitNote:
    "Submitting creates a branch in the public recipes repository and opens a pull request. Nothing is charged and nothing is built until you and we have both read it.",
  privacyWarning:
    "Recipes are public. Do not put a pupil's name, a password, or anything else private into a build name. If you would rather the recipe carried no identifying name, say so and we will use a neutral one.",
  questions: {
    orgName: { label: "What should this build be called?", hint: "This becomes a folder in the recipes repository, which anyone can read." },
    deviceCount: { label: "How many machines?", hint: "Roughly is fine. It sets the tier, not the build." },
    locale: { label: "What language should the machines be in?", hint: "This is in the image, not a setting somebody has to find." },
    keyboard: { label: "Which keyboard layout?", hint: "" },
    apps: { label: "Which applications do your staff open?", hint: "Name the ones people actually use. Everything you do not name is removed." },
    policy: {
      label: "How locked down?",
      hint: "",
      options: [
        { valueMono: "open", label: "Open", description: "A normal computer. The user can install applications and change settings." },
        { valueMono: "managed", label: "Managed", description: "Settings you have chosen are fixed. Applications come from a list." },
        { valueMono: "locked", label: "Locked", description: "No installation, no settings, no terminal. A machine for one kind of work." },
        { valueMono: "kiosk", label: "Single-purpose", description: "One application, full screen, no way out. The desktop shell and the login manager are not hidden. They are not in the image, and the build proves it every night." },
      ],
    },
    hardware: { label: "What are the machines?", hint: "Model numbers if you have them. They select which test machine your build is checked on." },
    compatLayer: { label: "Do you need to try Windows programs?", hint: "This installs the compatibility layer. It does not make your programs work. Tell us which ones and we will test them." },
  },
  /** Shown when JavaScript is off. Spec §6D requires the site works down to a mailto fallback. */
  noJsFallback:
    "The live configurator needs JavaScript. Without it, email us the language, the machine count, the applications you need, and the model numbers, and we will write the recipe and send you the file to read.",
} as const;

/**
 * The build console streams genuine pipeline output (spec §7). These are the labels around it
 * and a sample for the state where no build is running. The sample is ILLUSTRATION and is
 * rendered with ILLUSTRATION_LABEL attached, always.
 */
export const buildConsole = {
  title: "Build output",
  liveLabel: "live",
  idleLabel: "No build running",
  /*
   * This said "most of the time this panel is empty — that is what a maintained image looks like
   * from the outside." Present tense, describing a steady state that has never once existed:
   * GATE.md has `auros-base:hardened` at Gate 1, in progress, never published. The panel is empty
   * because nothing has gone green yet, which is a different sentence and a more interesting one.
   */
  /*
   * Split on whether there IS a run below, the way `outcomeNote` in BuildConsole.astro already is.
   * It used to be one unconditional string ending "…what is below is the last run that actually
   * happened rather than a picture of a steady state" — printed directly above a panel that, with
   * no snapshot committed, says in the next breath that we have no record of a completed run. True
   * in one state, false in the other, printed in both.
   */
  subtitle:
    "The base rebuilds at 04:17 UTC and again whenever a recipe changes, and free CI runs its schedules late, so in practice it is a little after that. Nothing has gone green yet. auros-base:hardened has never published, so",
  /** …and there is a run under this line. */
  subtitleLastRun:
    "what is below is the last run that actually happened rather than a picture of a steady state.",
  /** …and there is not. The absence is the sentence; it does not get dressed as a steady state either. */
  subtitleNoRecord: "there is no run below for this line to describe.",
  subtitleCoda: "The day the first one passes, this line will say so and carry the date.",
  /** ILLUSTRATION. Never presented as a build we ran for a customer. Mono, obviously. */
  sampleLinesMono: [
    "resolving base  ghcr.io/ublue-os/aurora:stable",
    "pinned          sha256:911281f2aaa42bfd…c28d0d2f1 · 3.5 GB · 58 s",
    "installing      11 packages",
    "pruning         240 packages · recipe floor was 240",
    "removal report  written · every size measured from this image, none estimated",
    "booting test vm uefi-modern",
    "check S1        base pinned by digest",
    "check S3        prune assertions · 0 survivors",
    "check S4        keep assertions · 11 present",
    "check B4        locale mr_IN · keyboard us",
    "check S8        signed · cosign, with our key",
    "published       only because every check above passed",
  ],
  /**
   * Four entries, not three. Three equal terms in three equal columns is the card grid D29 bans
   * wearing a different hat. This is a glossary and now reads as one.
   */
  legend: [
    { label: "pinned", meaning: "The digest out of base.lock. Check S1 fails the build if FROM resolves to anything else. A tag is a moving target: two builds a day apart would be different operating systems wearing one name." },
    { label: "pruning", meaning: "Packages deleted from the image. Not disabled. Deleted. The recipe sets a floor on it — the worked example says must_remove_at_least: 240 — and a build that removes fewer than that fails." },
    { label: "check", meaning: "A binary test from the matrix. Mostly worked is a fail." },
    { label: "published", meaning: "The publish step reads the results ledger. There is no flag that skips it." },
  ],
} as const;

export const layerStack = {
  title: "The stack",
  standfirst:
    "The background of this site is a cross-section of ground, and it is the diagram. Each stratum is a layer of what we build.",
  ownedByLabels: {
    upstream: "Maintained by others. Not us.",
    Auros: "Ours. Exactly one of it.",
    you: "Yours.",
    nobody: "No artefact.",
  },
  readFromBottom: "Read from the bottom up.",
} as const;

export const faqPage = {
  title: "Questions",
  /*
   * A `standfirst` and an `unfinishedNote` used to live here. Both said what
   * `src/content/pages/4-faq.mdx` already says at the top of the same page, and the note was
   * printed two inches under the document containing it, in a different typeface. Deleted
   * rather than reworded. The page did not need the sentence three times.
   */
  groupLabels: {
    trust: "If something goes wrong with us",
    operations: "Running it",
    data: "Your data",
    hardware: "The machines",
  },
} as const;

/**
 * DECISIONS.md D31 rewrote this page's claim and this block with it.
 *
 * The old standfirst said "every recipe is a public git repository, including yours — if we
 * disappear you rebuild the same operating system with the same commands we use." D30 made every
 * repository all-rights-reserved, which left that sentence describing a licence we do not grant.
 * Reading a file and being permitted to build from it are different rights, and the old wording
 * collapsed them.
 *
 * What replaced it is weaker and true: the image is already on the machines, the thing that dies
 * with us is the maintenance, and the commitment is a written term rather than a licence.
 */
export const replaceable = {
  title: "Replaceable on purpose",
  standfirst:
    "The image is already on your laptops and it keeps booting whether or not we are here. What would die with us is the maintenance — the nightly rebuild that keeps it patched. So the commitment is written down before there is a customer to reassure: if Auros stops operating, you receive the build files for your own image.",
  requirementsLabel: "What the handover is, and what it takes to use it",
  requirements: [
    { label: "What you receive", value: "your recipe · the base Containerfile · the build scripts" },
    { label: "What you need to run them", value: "one x86_64 Linux machine with podman" },
    { label: "Free disk", value: "a few tens of GB · we have not measured the working set" },
    { label: "An account with us", value: "none — there would not be one to have" },
  ] satisfies Fact[],
  /*
   * `terminalNote` and `verifyNote` were here, printed directly above the document that makes
   * both points in its own words. Deleted. The requirements are all this panel needs.
   */
} as const;

export const migrationSafety = {
  title: "The order is not negotiable",
  steps: [
    { label: "Inventory", value: "files · browser profiles" },
    { label: "Show you what cannot come", value: "read from this machine's installed programs list" },
    { label: "Copy", value: "to a disk that is not the system disk" },
    { label: "Verify", value: "file count and per-file hash" },
    { label: "Report what was in use", value: "locked files are listed, never dropped quietly" },
    { label: "Only then write", value: "a mismatch is retried once, then listed by name — nothing is written until that list is empty" },
  ] satisfies Fact[],
  body: "Step five is the one other tools skip. A file Windows has locked while the machine is running cannot always be read cleanly, so the run produces a list of the files it could not copy and puts that list in front of you before you decide anything. A gap you can see is a problem. A gap nobody mentioned is a disaster.",
  archiveNote:
    "The archive is written to your disk, on your premises. It is never uploaded and we never receive it.",
  noBootMediaNote:
    "The Windows program does not write your USB stick. Writing boot media means raw writes to a disk on a machine we do not own, with no undo. The media is made once, elsewhere, and the same stick does every machine.",
} as const;

/**
 * The number this product is most uncomfortable about, set in the largest type on the site.
 *
 * `docs/evidence/2026-09-20-runner-probe.md` calls 3.5 GB "the most consequential number in the
 * probe" and works out the 630 GB consequence for a 180-machine site. It is an argument against
 * us — a nightly rebuild is a real cost on a real school uplink — and it is measured, sourced and
 * reopenable, which is why it goes large rather than into a footnote.
 *
 * A site that prints its worst measurement bigger than its headline is doing something a
 * generated one cannot, because a generated one has no measurements.
 */
export const measured = {
  label: "Measured, on a CI runner",
  bigMono: "3.5 GB",
  caption:
    "What one machine pulls on a night when a low layer of the base changes. Compressed, 3,758,096,384 bytes, pinned in base.lock and timed at 58 s on a datacentre uplink that is nothing like yours.",
  consequenceMono: "× 180 machines = 630 GB",
  consequence:
    "That is a morning where nothing else on your line works, and the caching mirror that fixes it is a design requirement rather than a feature — we have not built it. The FAQ question about one uplink is the honest version of this and it is the one we would read before ordering.",
  sourceMono: "docs/evidence/2026-09-20-runner-probe.md",
  sourceLink: {
    label: "The CI run that produced it",
    href: "https://github.com/aarohkandy/auros-base/actions/runs/35538612202",
  },
  faqLink: { label: "Updates on a 180-machine site with one uplink", href: "/faq" },
} as const;

/**
 * A worked recipe, shown rather than described.
 *
 * Every line below is copied verbatim out of `auros-recipes/customers/example-school/recipe.yaml`,
 * which is committed, public, and carries `# ILLUSTRATIVE EXAMPLE — not a customer` as its first
 * line. §4.4 is satisfied by the artefact itself; `flagNote` carries that label onto the page too,
 * because a reader should not have to open the repository to learn what they are looking at.
 *
 * Spec §6D calls the `remove:` block "the single most persuasive object on the site". It was
 * living behind four form questions on /configure, which meant a visitor who did not fill in a
 * form never saw the argument the company is built on.
 */
export const recipeExcerpt = {
  title: "A recipe, in full",
  flagNote:
    "Illustrative example, not a customer. Example Vidyalaya does not exist. The file does — it is committed in the public recipes repository and the nightly build compiles it like any other.",
  sourceMono: "auros-recipes/customers/example-school/recipe.yaml",
  standfirst:
    "This is the whole product in one file. Not a summary of it, not a screenshot of a dashboard: the file, which is also the thing that gets built.",
  /** The install side. Ten applications, named. */
  keep: {
    label: "apps",
    valuesMono: [
      "Calculator",
      "Document Viewer",
      "Files",
      "Firefox",
      "GCompris",
      "Google Chrome",
      "Image Viewer",
      "Scratch",
      "Text Editor",
      "VLC Media Player",
    ],
    note: "Ten, named individually, with no category headings and no etcetera. Every application that is not on this list is gone from the image — which is why the list on the right is the longer one.",
  },
  /** The removal side, which is longer, and looks it. */
  remove: {
    label: "prune",
    linesMono: [
      "keep_only_the_apps_above: true",
      "also_keep: [printing]",
      "also_remove: [developer tools, games, remote desktop,",
      "              sample wallpapers and media, virtualisation]",
      "must_remove_at_least: 240",
    ],
    note: "The last line is the one worth arguing about. A customer wrote a floor on deletion into their own recipe: if the build cannot take out at least 240 packages, fail the build and do not ship it. Nobody selling you a computer offers you that field.",
  },
  /** The texture a real file has and a marketing page never does. */
  detailsMono: [
    { label: "machines", value: "180 · dell-latitude-e6440, hp-probook-650-g1, lenovo-thinkpad-t440" },
    { label: "language", value: "Marathi · second script Marathi (InScript)" },
    { label: "switch scripts with", value: "Windows key + Spacebar" },
    // D38 measured that this field reaches the image as NOTHING: the update agent clears
    // `OnCalendar=` deliberately, because check U1 requires a fleet to take a rebuild inside its
    // own window, at whatever hour the rebuild publishes. A quiet window and that guarantee are
    // in tension and which wins is §9-reserved. Until somebody decides, the site shows the field
    // with the same words `explain` now prints into the pull request the customer agrees to —
    // showing the time alone would advertise a behaviour the machine does not have.
    { label: "updates", value: "install_between 21:00-05:00 · RECORDED, NOT YET APPLIED" },
    { label: "size budget", value: "9 GB" },
    { label: "policy", value: "managed" },
    { label: "approved by", value: "A. Deshmukh · IT Coordinator · 2026-09-18" },
  ] satisfies Fact[],
  /** Two honest .exe results, with dates, sitting in the same file. */
  windowsApps: {
    label: "windows_apps.tested",
    standfirst:
      "And the part a sales page would have left out. Two Windows programs, tested on 2026-09-11, written into the recipe with the result:",
    rows: [
      {
        appMono: "Vidyalaya School ERP desktop client",
        resultMono: "works with caveats",
        note: "Prints report cards. The fingerprint attendance module cannot see the reader.",
      },
      {
        appMono: "Tally.ERP",
        resultMono: "fails",
        note: "Crashes during licence activation. The office PC stays on Windows for Tally.",
      },
    ],
    closing:
      "One of those is a no. It is in the file because the answer to a Windows program is a fact about that program, and a recipe that only recorded the yeses would be worth nothing to the next school that asked.",
  },
  moreLink: { label: "Write your own", href: "/configure" },
} as const;

/**
 * The compatibility table, shown in the state it is actually in.
 *
 * `hardware/compat.tsv` is a header row and nothing under it. Spec §8 calls the filled version
 * "the thing competitors cannot copy quickly" — after fifty rows. We have none. Inventing rows
 * would breach §4.4; describing the file as though it had rows would be the same lie in a softer
 * voice. So the columns are printed and the emptiness is printed with them.
 */
export const compatTable = {
  title: "The compatibility table, as of today",
  columnsMono: [
    "model",
    "year",
    "source",
    "cpu",
    "ram_gb",
    "firmware",
    "wifi",
    "trackpad",
    "suspend",
    "brightness",
    "gpu",
    "audio",
    "webcam",
    "verdict",
    "notes",
    "tested_on",
    "tester",
  ],
  emptyStateMono: "no rows yet",
  asOfMono: "2026-09-20",
  body: [
    "Seventeen columns, a header row, and nothing under it. No physical machine has been imaged. Everything proven so far was proven in a virtual machine, and a virtual machine has no wireless chipset, no trackpad, no backlight and no vendor firmware, so it cannot tell you the four things you most want to know about a 2014 ProBook.",
    "A lint rule stops a row sourced from a virtual machine claiming a physical-only column, which is a strange thing to build before you have any rows. We built it first on purpose. The moment the first three laptops are imaged, the temptation to let a vm row quietly fill a hardware column is at its highest, and a rule written afterwards is a rule written by someone who already wants the answer.",
    "When a row lands it will include the failures. A table with no crosses in it is a table nobody measured.",
  ],
} as const;

/**
 * How small this is.
 *
 * §4.4 forbids inventing customers. It does not forbid saying how few of us there are, and D29
 * asks for exactly that: "where we are early and small, SAY SO. That is inviting."
 *
 * The headcount itself is §9-reserved — only a human supplies it — so the blank stays visible on
 * the page rather than being filled with a plausible number. Guessing at our own size on a site
 * that refuses to guess at anything else would be the one unforced error here.
 */
export const howSmall = {
  title: "How small this is",
  headcountMono: null as string | null,
  blankMono: "——",
  blankNote:
    "That blank is a blank because a person here has to fill it in, and this site does not invent numbers about itself any more than it invents them about you.",
  body: [
    "Auros is newer and smaller than the tone of a website usually admits. There is no sales team. There is no support rota. The plan had the base image booting by the end of the first day and it is late, and it is late for a reason worth writing down: four assumptions about upstream turned out to be wrong, and two of them would have produced a green build that was not actually safe.",
    "Finding them cost hours. Not finding them would have cost a customer.",
    "Today: no physical machine has been imaged. The base builds in CI and produces a bootable disk image; whether it reaches a login prompt is under test rather than proven. Propagation from base to recipe to a running machine is built and untested. Those three sentences are the current state of the thing, and you can check every one of them against the gate table, which is in the repository and readable without an account.",
  ],
  closing:
    "That is an odd way to open a sale, and it is why the wind-down term was written down before the first customer rather than after the first scare. A company this size that could not be replaced has no business holding two hundred machines hostage. We tried to make that true with a permissive licence and took it back a week later, because the code is ours and we want it to stay ours — so it is a term instead: if we stop, you get the files that keep your machines patched. Narrower than what this page said last week, and it is the version we can actually keep.",
} as const;

/**
 * What this site is standing on. Facts with sources, in mono, in the footer.
 *
 * Copied by hand from `auros-base/base.lock` and `auros-recipes/.github/workflows/replaceable.yml`.
 * Those files are in different repositories
 * from this one, so nothing here is read at build time and nothing here should be trusted over
 * them. If this page and `base.lock` ever disagree, believe `base.lock` — CI writes it, a person
 * wrote this.
 */
export const provenance = {
  title: "What this site is standing on",
  /*
   * Three rows, not four. The nightly time and the pull size both have better homes on the pages
   * that need them — the build console's own subtitle, and the measurement beside it — and a
   * footer that restates what the page above already said is the exact defect this pass was for.
   * What is left here is what no page says: which image we are standing on, and when it was last
   * checked by something that is not us.
   *
   * The third row printed `Wednesdays 05:23 UTC` as a standing cadence. That job has been on
   * `workflow_dispatch` only since 2026-09-20 — its own header says so, and the cron line under it
   * is commented out — so the panel whose entire job is to be checkable carried the one row a
   * reader checking it would have caught. It now prints the state the file is actually in. A
   * provenance panel listing only the things that are working is a provenance panel nobody should
   * believe.
   */
  facts: [
    {
      label: "Upstream base, pinned",
      value: "sha256:911281f2aaa42bfd17532c5cef917aba8d7ac8c0faeb1c1edc6a43dc28d0d2f1",
    },
    {
      label: "Resolved",
      value: "2026-09-20T21:25:07Z · linux/amd64 · upstream image created 2026-09-15T20:33:50Z",
    },
    {
      label: "Replaceability test",
      value: "paused · workflow_dispatch only · auros-recipes/.github/workflows/replaceable.yml",
    },
  ] satisfies Fact[],
  note:
    "Copied by hand out of base.lock and a workflow file, both of which live in a different repository from this website. So if this footer and base.lock ever disagree, believe base.lock: CI writes that one, and a person wrote this one. The third row is a job that does not currently run, and it is here rather than removed because the day it starts running is a fact this panel should have to report either way.",
} as const;

export const footer = {
  /** No customer counts, no logos, no testimonials. Spec §4.4. */
  /*
   * This sat about sixty pixels above `licenceNote`, which says "All rights reserved". The old
   * sentence ended "the recipes are public — if we stop, you rebuild them yourself", and a reader
   * who noticed the two together had every reason to stop believing the rest of the page. Both
   * strings were in the built HTML at once. D31 is the claim that is true of both.
   */
  statement:
    "Auros builds maintained Linux images for organisations with machines that still work. The image is yours and keeps booting whatever happens to us. If we stop operating, you receive the build files for it.",
  columns: [
    {
      title: "Read",
      links: [
        { href: "/what-doesnt-come-across", label: "What doesn't come across" },
        { href: "/how-it-works", label: "How it works" },
        { href: "/replaceable", label: "If we stop" },
        { href: "/faq", label: "Questions" },
      ],
    },
    {
      title: "Source",
      links: [
        { href: site.repos.recipes, label: "auros-recipes" },
        { href: site.repos.base, label: "auros-base" },
        { href: site.repos.installer, label: "auros-installer" },
        { href: site.repos.web, label: "auros-web" },
      ],
    },
  ],
  /**
   * D30 replaced Apache-2.0 with an all-rights-reserved notice across all five repositories. This
   * string said "Site and source released under Apache 2.0" for as long as that was true and for a
   * short while after it stopped being true, which is the most checkable false statement a site can
   * make: the LICENSE file is one click away. Both halves below are facts, not positioning — our own
   * code is closed, and the GPL and LGPL components inside the image carry rights we cannot withhold
   * from anyone who receives it. See LICENSING.md.
   *
   * What this string must NOT do is answer the much larger question D30 opens, which is what happens
   * to the replaceability claim now that the licence does not support it. That is §9-reserved and
   * recorded in CLAIMS.md.
   */
  licenceNote: "All rights reserved. The image includes GPL and LGPL components, whose own licences travel with it to whoever receives it.",
  themeToggle: { label: "Theme", light: "Light", dark: "Dark", system: "Match system" },
} as const;

export const a11y = {
  terrainAlt:
    "A cross-section of ground drawn in pixels. From the top: sky, the surface with your machine, topsoil holding your applications and language, a stratum for your recipe, a stratum for the Auros base image, and bedrock, which is Fedora by way of Universal Blue.",
  reducedMotionNote: "Motion is off because your system asks for reduced motion. Nothing is missing.",
  monoNote: "Figures, commands and file names are set in a monospaced typeface.",
} as const;

export const errors = {
  notFound: {
    title: "That page is not here",
    body: "The address is wrong or the page has moved. Everything on this site is reachable from the navigation above.",
  },
  submitFailed: {
    title: "The order did not go through",
    body: "Nothing was charged and nothing was created. Try again, or email your answers and we will write the recipe by hand.",
  },
} as const;
