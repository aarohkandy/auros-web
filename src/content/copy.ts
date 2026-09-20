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
    "We build schools and nonprofits a Linux image containing only what they asked for, in their language, under their rules, rebuilt every night so it is still patched in four years.",
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
    "Your 2012 to 2018 laptops are not broken. Windows stopped patching them. We build them an operating system that contains the applications your staff actually open, in your language, under your rules, rebuilt every night so it is still patched in four years.",
  primaryCta: { label: "Configure a build", href: "/configure" },
  secondaryCta: { label: "Read what doesn't come across", href: "/what-doesnt-come-across" },
  /** Sits under the CTAs. A fact, so it renders mono. */
  priceNoteMono: "$79 one machine · $15 per device per year for schools · $0 self-serve",
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
    "Five tiers. One of them is zero, because the recipes are public and you can build them yourself.",
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
      hint: "A multiplied by $15, per year.",
    },
  ],
  /** Rendered in mono next to the inputs. */
  formulaMono: "C = A × $15 per year",
  body: [
    "Compare A × B against C. You have both numbers and we have neither, which is why the page does the arithmetic and not the arguing.",
    "If B is effectively zero because you were never going to replace them, then the comparison is C against nothing, and the question stops being financial. It becomes whether a machine that still works but no longer receives security updates is something you are willing to keep on a network with children on it. That is a risk decision and we are not going to dress it up as a saving.",
    "There is a third column nobody puts in the spreadsheet: the machines you keep and do nothing about. That is the most common outcome in this situation and it has a cost too. We are not going to estimate it for you.",
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
    "The remove block is the product. Everything named there is deleted from the image, so it is not bytes your machines download and not something anyone can open.",
  emptyState:
    "Nothing chosen yet. As you answer, this file fills in, and it is the file we build.",
  submitLabel: "Open this as a pull request",
  submitNote:
    "Submitting creates a branch in the public recipes repository and opens a pull request. Nothing is charged and nothing is built until you and we have both read it.",
  privacyWarning:
    "Recipes are public. Do not put a pupil's name, a password, or anything else private into a build name. If you would rather the recipe carried no identifying name, say so and we will use a neutral one.",
  questions: {
    orgName: { label: "What should this build be called?", hint: "This becomes a folder in a public repository." },
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
  subtitle: "Real output from the build pipeline. It is more interesting than an animation and it is true.",
  /** ILLUSTRATION. Never presented as a build we ran for a customer. Mono, obviously. */
  sampleLinesMono: [
    "resolving base  ghcr.io/ublue-os/aurora:stable",
    "pinned          sha256:… recorded in base.lock",
    "installing      11 packages",
    "pruning         214 packages",
    "removal report  written · 3.9 GB reclaimed",
    "booting test vm uefi-modern",
    "check S1        base pinned by digest",
    "check S3        prune assertions · 0 survivors",
    "check S4        keep assertions · 11 present",
    "check B4        locale · keyboard",
    "check S8        signed · cosign keyless",
    "published       only because every check above passed",
  ],
  legend: [
    { label: "pruning", meaning: "Packages deleted from the image. Not disabled. Deleted." },
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
  },
  readFromBottom: "Read from the bottom up.",
} as const;

export const faqPage = {
  title: "Questions",
  standfirst:
    "Ordered by how much they should affect your decision, not by how well they make us look.",
  groupLabels: {
    trust: "If something goes wrong with us",
    operations: "Running it",
    data: "Your data",
    hardware: "The machines",
  },
  unfinishedNote:
    "Where the honest answer is that something is designed and not built, it says so. An answer that is true in December is worth more than an answer that is impressive in September.",
} as const;

export const replaceable = {
  title: "Replaceable on purpose",
  standfirst:
    "Every recipe is a public git repository, including yours. If we disappear, you rebuild the same operating system with the same commands we use.",
  requirementsLabel: "What you need",
  requirements: [
    { label: "One Linux machine", value: "x86_64" },
    { label: "Container tooling", value: "podman" },
    { label: "Free disk", value: "40 GB" },
    { label: "An account with us", value: "none" },
  ] satisfies Fact[],
  terminalNote:
    "This is the only page on this site with a command line on it. Nobody using these machines should ever need one.",
  verifyNote:
    "Run these on a Tuesday when nothing is wrong. Ten minutes now is worth more than any promise on this page.",
} as const;

export const migrationSafety = {
  title: "The order is not negotiable",
  steps: [
    { label: "Inventory", value: "files · browser profiles · wi-fi · printers · account" },
    { label: "Show you what cannot come", value: "read from this machine's installed programs list" },
    { label: "Copy", value: "to a disk that is not the system disk" },
    { label: "Verify", value: "file count and per-file hash" },
    { label: "Report what was in use", value: "locked files are listed, never dropped quietly" },
    { label: "Only then write", value: "any mismatch aborts and changes nothing" },
  ] satisfies Fact[],
  body: "There is a moment, by design, where your data exists in two places and the original disk has not been touched. Ignoring that ordering is how other people have destroyed other people's data.",
  archiveNote:
    "The archive is written to your disk, on your premises. It is never uploaded and we never receive it.",
  noBootMediaNote:
    "The Windows program does not write your USB stick. Writing boot media means raw writes to a disk on a machine we do not own, with no undo. The media is made once, elsewhere, and the same stick does every machine.",
} as const;

export const footer = {
  /** No customer counts, no logos, no testimonials. Spec §4.4. */
  statement:
    "Auros builds maintained Linux images for organisations with machines that still work. The recipes are public. If we stop, you rebuild them yourself.",
  columns: [
    {
      title: "Read",
      links: [
        { href: "/what-doesnt-come-across", label: "What doesn't come across" },
        { href: "/how-it-works", label: "How it works" },
        { href: "/replaceable", label: "Rebuild without us" },
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
  licenceNote: "Site and source released under Apache 2.0.",
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
