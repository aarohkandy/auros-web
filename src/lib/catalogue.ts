/**
 * The vocabulary the configurator speaks.
 *
 * Every entry here is a SITUATION a person recognises — "we print", "we join video calls",
 * "somebody in IT takes over the screen to help" — and the compiler below turns it into the
 * technical fields. A question that names a package has already failed, so no package name,
 * Flatpak id or RPM appears in any `label` in this file. The only technical strings are the
 * `apps` values, which are catalogue names out of the base image ("Google Chrome", "VLC Media
 * Player") because `recipe.schema.json` is deliberately written in those same words.
 *
 * THE ASYMMETRY IS COMPUTED, NOT DECORATED
 * `REMOVABLE_GROUPS` is the schema's complete removal vocabulary. Each activity KEEPS one of
 * them. Everything nobody kept is named in `prune.also_remove`. So the remove block gets longer
 * as the answers get more specific, which is the argument the panel is making, arrived at by
 * subtraction rather than by writing a long list and hoping.
 */

/** The complete `removableGroup` enum from recipe.schema.json. Kept in schema order. */
export const REMOVABLE_GROUPS = [
  "developer tools",
  "games",
  "media players",
  "office suite",
  "remote desktop",
  "sample wallpapers and media",
  "virtualisation",
  "usb storage",
  "bluetooth",
  "printing",
  "scanning",
  "webcam",
] as const;
export type RemovableGroup = (typeof REMOVABLE_GROUPS)[number];

/** The subset of the above that `prune.also_keep` can also name, per the schema. */
const KEEPABLE_AS_CAPABILITY = new Set<RemovableGroup>(["printing", "scanning", "bluetooth", "webcam"]);

export type Activity = {
  id: string;
  /** Plain words. A person reads this and knows whether it is them. */
  label: string;
  /** What it means for the machine, in one line. Shown under the label. */
  note: string;
  /** Application catalogue names added to `apps`. */
  apps: string[];
  /** The removal group this activity saves from deletion, if any. */
  keeps?: RemovableGroup;
};

export const ACTIVITIES: Activity[] = [
  {
    id: "web",
    label: "Work in a web browser",
    note: "A browser, and the fonts and the sound it needs.",
    apps: ["Firefox"],
  },
  {
    id: "workspace",
    label: "Sign in to Google Workspace or Microsoft 365 in the browser",
    note: "Adds Chrome, because some school and council systems only support it.",
    apps: ["Google Chrome"],
  },
  {
    id: "documents",
    label: "Write documents and spreadsheets on the machine itself",
    note: "Keeps the office suite. Leave this unchecked and the whole suite is deleted.",
    apps: ["LibreOffice Writer", "LibreOffice Calc", "LibreOffice Impress"],
    keeps: "office suite",
  },
  {
    id: "email",
    label: "Read email in a program rather than in a browser",
    note: "Adds a mail program. Most organisations in a browser do not need this.",
    apps: ["Thunderbird"],
  },
  {
    id: "media",
    label: "Play video and sound files",
    note: "Keeps a media player. Unchecked, every media player is deleted.",
    apps: ["VLC Media Player"],
    keeps: "media players",
  },
  {
    id: "photos",
    label: "Look at and edit pictures",
    note: "Adds a picture viewer and an image editor.",
    apps: ["Image Viewer", "GIMP"],
  },
  {
    id: "teaching",
    label: "Run learning programs for children",
    note: "Adds the two we know well, and keeps the games group they live in.",
    apps: ["GCompris", "Scratch"],
    keeps: "games",
  },
  {
    id: "code",
    label: "Write software",
    note: "Keeps the developer tools, and is the only reason to.",
    apps: ["Visual Studio Code", "Kate"],
    keeps: "developer tools",
  },
  {
    id: "print",
    label: "Print",
    note: "Keeps the whole printing stack. Half a printing stack prints nothing.",
    apps: [],
    keeps: "printing",
  },
  {
    id: "scan",
    label: "Scan",
    note: "Keeps scanning. Separate from printing because many machines only print.",
    apps: [],
    keeps: "scanning",
  },
  {
    id: "videocall",
    label: "Join video calls",
    note: "Keeps the camera working. Unchecked, the camera stack is deleted from the image.",
    apps: [],
    keeps: "webcam",
  },
  {
    id: "bluetooth",
    label: "Use wireless mice, keyboards or headphones",
    note: "Keeps Bluetooth. On a shared classroom machine this is often a no.",
    apps: [],
    keeps: "bluetooth",
  },
  {
    id: "usb",
    label: "Use USB sticks and external drives",
    note: "Keeps USB storage. Unchecked, a USB drive does not mount at all.",
    apps: [],
    keeps: "usb storage",
  },
  {
    id: "remote",
    label: "Let someone in IT take over the screen to help",
    note: "Keeps remote desktop. Unchecked, nothing on the machine can be remotely driven.",
    apps: [],
    keeps: "remote desktop",
  },
];

/**
 * On every machine that has a desktop at all. Three things, not thirty: a file manager, a text
 * editor and something that opens a PDF. If these were optional the form would be asking a
 * question nobody has an opinion about.
 */
export const STAPLE_APPS = ["Files", "Text Editor", "Document Viewer"] as const;

/** Never kept by any activity. Named so the reader sees them go rather than discovering it. */
export const ALWAYS_REMOVED: RemovableGroup[] = ["sample wallpapers and media", "virtualisation"];

/** Work out the two prune lists from the activities chosen. */
export function partitionRemovals(activityIds: string[]): {
  alsoKeep: string[];
  alsoRemove: RemovableGroup[];
} {
  const chosen = new Set(activityIds);
  const kept = new Set<RemovableGroup>();
  for (const a of ACTIVITIES) {
    if (a.keeps && chosen.has(a.id)) kept.add(a.keeps);
  }
  const alsoKeep: string[] = [];
  const alsoRemove: RemovableGroup[] = [];
  for (const g of REMOVABLE_GROUPS) {
    if (kept.has(g)) {
      if (KEEPABLE_AS_CAPABILITY.has(g)) alsoKeep.push(g);
      continue;
    }
    alsoRemove.push(g);
  }
  return { alsoKeep, alsoRemove };
}

/** Applications implied by the activities, plus the staples, sorted and de-duplicated. */
export function appsFor(activityIds: string[], opts: { kiosk: boolean }): string[] {
  const chosen = new Set(activityIds);
  const out = new Set<string>();
  for (const a of ACTIVITIES) {
    if (!chosen.has(a.id)) continue;
    for (const app of a.apps) out.add(app);
  }
  if (opts.kiosk) {
    // A kiosk is one window doing one job. Whatever browser they chose, and nothing beside it.
    const browser = out.has("Google Chrome") ? "Google Chrome" : "Firefox";
    return [browser];
  }
  for (const s of STAPLE_APPS) out.add(s);
  return [...out].sort((a, b) => a.localeCompare(b, "en"));
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// Language
//
// The schema takes a language the way a person says it and derives the fonts from it, so there
// is no font question and no locale code anywhere in this form. The primary keyboard must be a
// Latin layout — not a preference, a safety rule: the login screen and the disk-unlock prompt
// appear before any input method is running, and a fleet that cannot type its own password is a
// fleet nobody can log into. A non-Latin script is therefore always a SECOND layout.
// ─────────────────────────────────────────────────────────────────────────────────────────

export type LanguageOption = {
  /** As `language:` in the recipe. */
  name: string;
  /** As `keyboard:` — always a Latin layout. */
  keyboard: string;
  /** As `second_script:`, where the keycaps do not show the script. */
  secondScript?: string;
  /** Extra languages a user can switch to without a rebuild. */
  otherLanguages?: string[];
};

export const LANGUAGES: LanguageOption[] = [
  { name: "English (United Kingdom)", keyboard: "English (UK)" },
  { name: "English (United States)", keyboard: "English (US)" },
  { name: "English (India)", keyboard: "English (India)" },
  { name: "Marathi", keyboard: "English (US)", secondScript: "Marathi (InScript)", otherLanguages: ["English (India)", "Hindi"] },
  { name: "Hindi", keyboard: "English (US)", secondScript: "Hindi (InScript)", otherLanguages: ["English (India)"] },
  { name: "Bengali", keyboard: "English (US)", secondScript: "Bengali (InScript)", otherLanguages: ["English (India)"] },
  { name: "Tamil", keyboard: "English (India)", secondScript: "Tamil (InScript)", otherLanguages: ["English (India)"] },
  { name: "Telugu", keyboard: "English (India)", secondScript: "Telugu (InScript)", otherLanguages: ["English (India)"] },
  { name: "Arabic", keyboard: "English (US)", secondScript: "Arabic" },
  { name: "Amharic", keyboard: "English (US)", secondScript: "Amharic" },
  { name: "Greek", keyboard: "English (US)", secondScript: "Greek" },
  { name: "Hebrew", keyboard: "English (US)", secondScript: "Hebrew" },
  { name: "Russian", keyboard: "English (US)", secondScript: "Russian" },
  { name: "Ukrainian", keyboard: "English (US)", secondScript: "Ukrainian" },
  { name: "Thai", keyboard: "English (US)", secondScript: "Thai" },
  { name: "French", keyboard: "French" },
  { name: "German", keyboard: "German" },
  { name: "Spanish", keyboard: "Spanish" },
  { name: "Spanish (Latin America)", keyboard: "Spanish (Latin America)" },
  { name: "Portuguese (Brazil)", keyboard: "Portuguese (Brazil)" },
  { name: "Italian", keyboard: "Italian" },
  { name: "Dutch", keyboard: "Dutch" },
  { name: "Polish", keyboard: "Polish" },
  { name: "Turkish", keyboard: "Turkish" },
  { name: "Vietnamese", keyboard: "Vietnamese" },
  { name: "Indonesian", keyboard: "Indonesian" },
  { name: "Swahili", keyboard: "Swahili" },
];

export function languageByName(name: string): LanguageOption | undefined {
  return LANGUAGES.find((l) => l.name === name);
}

/** The schema's three permitted layout-switch combinations. */
export const SWITCH_COMBINATIONS = ["Windows key + Spacebar", "Alt + Shift", "Ctrl + Spacebar"] as const;

// ─────────────────────────────────────────────────────────────────────────────────────────
// Age of the fleet → which virtual machines the image is tested on.
// You may only ADD tests. There is no way to ask for fewer, here or in the schema.
// ─────────────────────────────────────────────────────────────────────────────────────────

export type AgeBand = { id: string; label: string; alsoTest: string[] };

export const AGE_BANDS: AgeBand[] = [
  { id: "before-2012", label: "Older than 2012", alsoTest: ["bios-legacy", "old-cpu", "low-ram"] },
  { id: "2012-2015", label: "About 2012 to 2015", alsoTest: ["bios-legacy", "low-ram"] },
  { id: "2015-2018", label: "About 2015 to 2018", alsoTest: ["uefi-secureboot", "low-ram"] },
  { id: "after-2018", label: "Newer than 2018", alsoTest: ["uefi-modern"] },
  { id: "mixed", label: "A mixture, and I do not know", alsoTest: ["bios-legacy", "uefi-secureboot", "low-ram", "old-cpu"] },
];

export function ageBand(id: string | null): AgeBand | undefined {
  return AGE_BANDS.find((a) => a.id === id);
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// Who is allowed to change things.
// ─────────────────────────────────────────────────────────────────────────────────────────

export type PolicyOption = { id: "open" | "managed" | "locked" | "kiosk"; label: string; note: string };

export const POLICIES: PolicyOption[] = [
  { id: "open", label: "Anyone at the machine", note: "A normal computer. The person using it can install things and change settings." },
  { id: "managed", label: "Staff, but not the people using them day to day", note: "People work; the organisation owns the settings." },
  { id: "locked", label: "Nobody. It does one kind of work and stays that way", note: "No installing, no settings, no command line." },
  { id: "kiosk", label: "This is a single-purpose machine", note: "One window, one job, nobody signs in. The desktop is not hidden — it is not in the image, and the build proves that every night." },
];

// ─────────────────────────────────────────────────────────────────────────────────────────
// The things a recipe may not do.
//
// This list is not a warning label. It is the control that makes the refusal REACHABLE: pick
// one and the panel shows what the validator says, in the validator's own words. That state is
// the most persuasive one the panel has, because it is where a reader works out that the
// constraint is load-bearing rather than a limitation we have not got round to lifting.
//
// Each entry names the field it would have to add. The refusal text is NOT written here — it
// comes back out of recipe.schema.json at validation time, so it cannot drift from what CI says.
// ─────────────────────────────────────────────────────────────────────────────────────────

export type SpecialRequest = {
  id: string;
  /** How a real IT person would put it. Nobody asks for "a version pin". */
  label: string;
  /** The field the request would need. Injected into the candidate recipe so the schema answers. */
  apply: (recipe: Record<string, unknown>) => void;
};

export const SPECIAL_REQUESTS: SpecialRequest[] = [
  { id: "none", label: "No — the questions above cover it", apply: () => {} },
  {
    id: "pin-version",
    label: "Keep the browser pinned to the version currently in use here",
    apply: (r) => { r.pin = "the browser version we tested"; },
  },
  {
    id: "hold-updates",
    label: "Stop updates over the exam period, or over the summer",
    apply: (r) => { r.disable_updates = true; },
  },
  {
    id: "own-base",
    label: "Build it on top of our own image instead of yours",
    apply: (r) => { r.base = "our own image"; },
  },
  {
    id: "kernel",
    label: "Stay on the kernel our projector or label printer works with",
    apply: (r) => { r.kernel = "the one our projector works with"; },
  },
  {
    id: "script",
    label: "Run our own setup script the first time a machine starts",
    apply: (r) => { r.firstboot_script = "our setup script"; },
  },
  {
    id: "repo",
    label: "Add the package repository our supplier gave us",
    apply: (r) => { r.repos = ["our supplier's repository"]; },
  },
  {
    id: "config-file",
    label: "Drop our own configuration file into the image",
    apply: (r) => { r.files = ["our configuration file"]; },
  },
  {
    id: "skip-tests",
    label: "Skip the testing this once — we need it by Friday",
    apply: (r) => { r.skip_tests = true; },
  },
  {
    id: "wifi",
    label: "Put the wi-fi password in so the machines join the network on their own",
    apply: (r) => { r.wifi_password = "our wireless key"; },
  },
  {
    id: "no-rollback",
    label: "Switch off the automatic roll-back, it confuses our staff",
    apply: (r) => { r.rollback = false; },
  },
  {
    id: "drop-a11y",
    label: "Take the screen reader out — none of our pupils use it",
    apply: (r) => {
      const prune = r.prune as { also_remove?: string[] } | undefined;
      if (prune) prune.also_remove = [...(prune.also_remove ?? []), "screen reader"];
    },
  },
];

export function specialRequest(id: string): SpecialRequest | undefined {
  return SPECIAL_REQUESTS.find((s) => s.id === id);
}

/** A short, common list for the timezone control. Free text is still accepted. */
export const COMMON_TIMEZONES = [
  "Africa/Nairobi",
  "America/Chicago",
  "America/Los_Angeles",
  "America/New_York",
  "America/Sao_Paulo",
  "Asia/Bangkok",
  "Asia/Dhaka",
  "Asia/Jakarta",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Warsaw",
  "Pacific/Auckland",
] as const;
