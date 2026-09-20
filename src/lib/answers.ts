/**
 * What the visitor has told us, and nothing else.
 *
 * Four questions shape the machine. Everything after `alsoAsking` is the small amount of
 * identity a pull request needs and shapes nothing — it is grouped separately in the form for
 * that reason, and the panel fills in from the first answer rather than waiting for all of it.
 *
 * Nothing in this file talks to a package manager, and no field here is a package name. The
 * translation from a situation to a technical field happens in `recipe-render.ts`, against the
 * vocabulary in `catalogue.ts`.
 */

import { AGE_BANDS, LANGUAGES, SWITCH_COMBINATIONS } from "./catalogue";

export type OrgKind = "school-or-nonprofit" | "business" | "just-me";
export type Policy = "open" | "managed" | "locked" | "kiosk";

export type Answers = {
  // ── 1. Your machines ───────────────────────────────────────────────────────────────────
  machines: number | null;
  age: string | null;
  /** Free text: "Dell Latitude E6440, HP ProBook 650 G1". Slugged for the recipe. */
  models: string;
  orgKind: OrgKind | null;

  // ── 2. The language you work in ────────────────────────────────────────────────────────
  language: string;
  /** Latin layout. Defaulted from the language, overridable, never removed. */
  keyboard: string;
  secondScript: string;
  switchWith: string;
  otherLanguages: string[];

  // ── 3. What people actually do on these ────────────────────────────────────────────────
  activities: string[];
  /** "and nothing else". This is `prune.keep_only_the_apps_above`, which is the product. */
  onlyThese: boolean;

  // ── 4. Who is allowed to change things ─────────────────────────────────────────────────
  policy: Policy | null;
  kioskOpens: string;
  kioskSites: string;
  kioskForgetMinutes: number;
  kioskPrinting: boolean;
  kioskRestartAt: string;

  // ── The disclosure, which is not a question ────────────────────────────────────────────
  /** Installs the compatibility layer. It does not make anybody's programs work. */
  windowsApps: boolean;
  /** Read and acknowledged the list of what does not come across. Not dismissible. */
  acknowledgedMigration: boolean;

  // ── The thing a recipe may not do ──────────────────────────────────────────────────────
  alsoAsking: string;

  // ── Before you send it: identity. Shapes nothing. ──────────────────────────────────────
  buildName: string;
  orgDisplayName: string;
  helpdeskLabel: string;
  helpdeskPhone: string;
  timezone: string;
  /** Drafted from the answers above, then edited by the person whose file it is. */
  forParagraph: string;
  forParagraphEdited: boolean;
  approverName: string;
  approverRole: string;
  firstBootMessage: string;
};

export function defaultAnswers(): Answers {
  const first = LANGUAGES[0];
  return {
    machines: null,
    age: null,
    models: "",
    orgKind: null,

    language: first.name,
    keyboard: first.keyboard,
    secondScript: first.secondScript ?? "",
    switchWith: SWITCH_COMBINATIONS[0],
    otherLanguages: first.otherLanguages ?? [],

    activities: ["web"],
    onlyThese: true,

    policy: null,
    kioskOpens: "",
    kioskSites: "",
    kioskForgetMinutes: 8,
    kioskPrinting: false,
    kioskRestartAt: "03:30",

    windowsApps: false,
    acknowledgedMigration: false,

    alsoAsking: "none",

    buildName: "",
    orgDisplayName: "",
    helpdeskLabel: "",
    helpdeskPhone: "",
    timezone: "",
    forParagraph: "",
    forParagraphEdited: false,
    approverName: "",
    approverRole: "",
    firstBootMessage: "",
  };
}

/** Lowercase, hyphenated, no other characters. The shape `name` and `hardware.models` require. */
export function slug(input: string): string {
  return input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Split a free-text model list on commas, semicolons or newlines. */
export function splitList(input: string): string[] {
  return input
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The paragraph the schema asks for, drafted from the answers.
 *
 * It is a draft and the form says so: the field is editable and pre-filled, never hidden. The
 * schema wants twenty words in the author's own words so the person who inherits the file in
 * eighteen months can read it; handing them a blank box and a 120-character minimum produces
 * "asdf asdf asdf", which is worse than a draft somebody corrected.
 */
export function draftForParagraph(a: Answers, appCount: number, removedCount: number): string {
  // Nothing to draft from until we know the size and the rule. A draft built out of nulls reads
  // like "The 0 machines", which is worse than an honest blank.
  if (a.machines === null || a.policy === null) return "";

  const count = a.machines;
  const noun = count === 1 ? "machine" : "machines";
  const band = AGE_BANDS.find((b) => b.id === a.age);
  const age = band ? ` ${band.label.toLowerCase()}` : "";
  const where =
    a.orgKind === "school-or-nonprofit"
      ? "at a school or nonprofit"
      : a.orgKind === "business"
        ? "at a business"
        : "belonging to one person";

  const opening = `The ${count} ${noun}${age ? `,${age},` : ""} ${where}.`.replace(/\s+/g, " ");

  const work =
    a.policy === "kiosk"
      ? "Nobody signs in. A visitor uses the one page these machines open, and the session is wiped behind them."
      : a.onlyThese
        ? `People use ${appCount} application${appCount === 1 ? "" : "s"} and nothing else, in ${a.language}. Nobody installs anything on these by hand.`
        : `People use an ordinary desktop in ${a.language}, with ${removedCount} group${removedCount === 1 ? "" : "s"} of things taken out of it.`;

  const rule =
    a.policy === "open"
      ? "The person at the machine is in charge of it."
      : a.policy === "managed"
        ? "People do their work; the organisation owns the settings."
        : a.policy === "locked"
          ? "Nobody at the machine installs anything or changes anything."
          : "";

  return [opening, work, rule].filter(Boolean).join(" ").trim();
}

/** The paragraph shown in the form: the draft, unless the person has written their own. */
export function effectiveForParagraph(a: Answers, drafted: string): string {
  return a.forParagraphEdited && a.forParagraph.trim() ? a.forParagraph : drafted;
}
