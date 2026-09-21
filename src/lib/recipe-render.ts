/**
 * Answers in, a real `recipe.yaml` out.
 *
 * Not a mockup of a recipe: a recipe. The object this file builds is validated against the
 * same `recipe.schema.json` that `auros-recipes` runs in CI (see `recipe-validate.ts`), and the
 * text it emits is the text that would be committed. If the two ever disagree, the site is
 * lying at the exact moment it is trying hardest to be trusted.
 *
 * TWO RULES THAT ARE NOT STYLE CHOICES
 *
 * 1. THE PRUNE BLOCK IS NEVER SHORTENED. It is emitted one deletion per line, in full, with a
 *    plain-English reason beside each. There is no "and 9 more". If a layout ever has to choose
 *    what to cut, it cuts the apps list. The asymmetry between what stays and what goes IS the
 *    argument the panel is making.
 *
 * 2. THERE IS NO REMOVAL COUNT HERE. `must_remove_at_least` is emitted at the schema's floor
 *    with a comment saying so, because a count of removed packages is a measurement and we have
 *    not taken it. Naming the removals and omitting the number is the honest shape (spec 4.4).
 *    The first real build writes REMOVED.md and that number is what raises this floor.
 */

import {
  ACTIVITIES,
  AGE_BANDS,
  appsFor,
  languageByName,
  partitionRemovals,
  specialRequest,
  type RemovableGroup,
} from "./catalogue";
import { draftForParagraph, effectiveForParagraph, slug, splitList, type Answers } from "./answers";
import {
  blank,
  blockSeq,
  comment,
  flowMap,
  folded,
  keyValue,
  keyOnly,
  render,
  type SeqItem,
  type YamlLine,
} from "./yaml";

/** Why each group is going, said the way the reader would say it. */
const REMOVAL_REASONS: Record<RemovableGroup, string> = {
  "developer tools": "nobody here writes software",
  games: "not what these machines are for",
  "media players": "no video or sound files on these",
  "office suite": "the writing happens in the browser",
  "remote desktop": "nothing on the machine can be driven remotely",
  "sample wallpapers and media": "the sample pictures and clips nobody opens",
  virtualisation: "no virtual machines on a laptop this old",
  "usb storage": "a USB drive will not mount at all",
  bluetooth: "no wireless pairing",
  printing: "these machines do not print",
  scanning: "these machines do not scan",
  webcam: "the camera stack is not in the image",
};

/** What each kept capability buys, so `also_keep` is not a bare list either. */
const KEEP_REASONS: Record<string, string> = {
  printing: "the whole printing stack, not half of one",
  scanning: "scanning is separate from printing",
  bluetooth: "wireless mice, keyboards and headphones",
  webcam: "so video calls actually see you",
};

export type Recipe = Record<string, unknown>;

export type RenderResult = {
  /** The recipe as data, ready for the validator. */
  recipe: Recipe;
  /** The recipe as lines, each with a stable id, ready for the panel. */
  lines: YamlLine[];
  /** The recipe as text, ready for the clipboard, the download and the pull request body. */
  text: string;
  /** Derived facts the surrounding page wants without recomputing them. */
  derived: {
    apps: string[];
    alsoKeep: string[];
    alsoRemove: RemovableGroup[];
    alsoTest: string[];
    /** The `for:` paragraph we drafted, so the form can pre-fill its box. */
    draftedFor: string;
    sizeBudgetGb: number;
  };
};

/** A size ceiling the build enforces. A ceiling is a declaration, not a prediction. */
function sizeBudget(policy: string | null, windowsApps: boolean): number {
  const base = policy === "kiosk" ? 4 : policy === "locked" ? 8 : policy === "managed" ? 9 : 12;
  return Math.min(40, base + (windowsApps ? 4 : 0));
}

function todayISO(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** A line that shows the shape of a field nobody has filled in yet. It is a comment, so the */
/** key really is absent from the document and the validator really does say it is missing. */
function pending(id: string, key: string, prompt: string, indent = 0): YamlLine {
  return { ...comment(id, `${key}: ${prompt}`, indent), pending: true };
}

export function renderRecipe(a: Answers, opts: { now?: Date } = {}): RenderResult {
  const now = opts.now ?? new Date();
  const kiosk = a.policy === "kiosk";
  const apps = appsFor(a.activities, { kiosk });
  const { alsoKeep, alsoRemove } = partitionRemovals(kiosk ? a.activities.filter((id) => id === "print") : a.activities);
  const band = AGE_BANDS.find((b) => b.id === a.age);
  const alsoTest = band ? band.alsoTest : [];
  const models = splitList(a.models).map(slug).filter(Boolean);
  const lang = languageByName(a.language);
  const keepOnly = kiosk ? true : a.onlyThese;
  const budget = sizeBudget(a.policy, a.windowsApps);

  const draftedFor = draftForParagraph(a, apps.length, alsoRemove.length);
  const forText = effectiveForParagraph(a, draftedFor);

  // ── the object ────────────────────────────────────────────────────────────────────────
  const recipe: Recipe = { schema: 1 };

  const name = slug(a.buildName);
  if (name) recipe.name = name;
  if (forText) recipe.for = forText;

  const organisation: Record<string, unknown> = {};
  if (a.orgDisplayName.trim()) organisation.display_name = a.orgDisplayName.trim();
  if (a.helpdeskLabel.trim() || a.helpdeskPhone.trim()) {
    organisation.helpdesk = {
      ...(a.helpdeskLabel.trim() ? { label: a.helpdeskLabel.trim() } : {}),
      ...(a.helpdeskPhone.trim() ? { phone: a.helpdeskPhone.trim() } : {}),
    };
  }
  if (Object.keys(organisation).length) recipe.organisation = organisation;

  const hardware: Record<string, unknown> = {};
  if (a.machines !== null) hardware.machines = a.machines;
  if (models.length) hardware.models = models;
  if (alsoTest.length) hardware.also_test = alsoTest;
  if (Object.keys(hardware).length) recipe.hardware = hardware;

  recipe.language = a.language;
  if (a.otherLanguages.length) recipe.other_languages = [...a.otherLanguages];
  recipe.keyboard = a.keyboard;
  if (a.secondScript) {
    recipe.second_script = a.secondScript;
    recipe.switch_scripts_with = a.switchWith;
  }
  if (a.timezone.trim()) recipe.timezone = a.timezone.trim();
  recipe.apps = apps;

  const prune: Record<string, unknown> = { keep_only_the_apps_above: keepOnly };
  if (alsoKeep.length) prune.also_keep = alsoKeep;
  if (alsoRemove.length) prune.also_remove = alsoRemove;
  // The floor, not a measurement. See the header of this file.
  prune.must_remove_at_least = 1;
  recipe.prune = prune;

  if (a.policy) recipe.policy = a.policy;

  if (a.policy === "open") recipe.desktop = { can_install_apps: true };
  if (a.policy === "locked") recipe.desktop = { can_install_apps: false, can_reach_a_terminal: false };
  // windows is what an omitted field means, and a kiosk refuses any desktop block at all.
  if (!kiosk && a.layout !== "windows") recipe.desktop = { ...(recipe.desktop as object | undefined), layout: a.layout };

  if (kiosk) {
    const sites = splitList(a.kioskSites).map((s) => s.trim().toLowerCase());
    const k: Record<string, unknown> = {};
    if (a.kioskOpens.trim()) k.opens = a.kioskOpens.trim();
    if (sites.length) k.allowed_sites = sites;
    k.printing = a.kioskPrinting;
    k.usb_storage = false;
    k.forget_session_after_minutes = a.kioskForgetMinutes;
    if (a.kioskRestartAt) k.restart_daily_at = a.kioskRestartAt;
    recipe.kiosk = k;
  } else {
    recipe.windows_apps = a.windowsApps ? { enabled: true, we_promise_nothing_else: true } : { enabled: false };
  }

  if (a.firstBootMessage.trim()) recipe.first_boot_message = a.firstBootMessage.trim();
  recipe.size_budget_gb = budget;

  const approved: Record<string, unknown> = { enrolment: "pending" };
  if (a.approverName.trim()) approved.name = a.approverName.trim();
  if (a.approverRole.trim()) approved.role = a.approverRole.trim();
  approved.date = todayISO(now);
  recipe.approved_by = approved;

  // The thing a recipe may not do. Injected last, so the panel shows an otherwise-complete file
  // with one impossible line in it, which is the honest picture of what was asked for.
  const special = specialRequest(a.alsoAsking);
  if (special && special.id !== "none") special.apply(recipe);

  // ── the document ──────────────────────────────────────────────────────────────────────
  const L: YamlLine[] = [];

  L.push(comment("hdr/1", "This is the file. If it is not in here, it is not on the machines."));
  L.push(comment("hdr/2", "It is committed to the recipes repository, readable by you, and built from as written."));
  L.push(blank("hdr/blank"));

  L.push(keyValue("schema", "schema", 1, { comment: "the version of this form" }));
  if (name) {
    L.push(keyValue("name", "name", name));
  } else {
    L.push(pending("name", "name", "you have not named this build yet"));
  }

  if (forText) {
    L.push(...folded("for", "for", forText));
  } else {
    L.push(pending("for", "for", "we draft this once you have answered; it is yours to rewrite"));
  }

  // A bare `organisation:` with only comments under it parses as null, which is a DIFFERENT
  // document from the object the validator just saw. The text on screen and the object being
  // validated have to be the same file, so an empty block is emitted as one pending line and
  // the key is not written at all.
  const helpdesk = organisation.helpdesk as { label?: string; phone?: string } | undefined;
  if (Object.keys(organisation).length === 0) {
    L.push(pending("organisation", "organisation", "who these machines belong to, and who to ring"));
  } else {
    L.push(keyOnly("organisation", "organisation"));
    if (organisation.display_name) {
      L.push(keyValue("organisation/display_name", "display_name", organisation.display_name as string, { indent: 1 }));
    } else {
      L.push(pending("organisation/display_name", "display_name", "the name shown on the login screen", 1));
    }
    if (helpdesk?.label && helpdesk?.phone) {
      L.push(flowMap("organisation/helpdesk", "helpdesk", [["label", helpdesk.label], ["phone", helpdesk.phone]], { indent: 1 }));
    } else if (helpdesk?.label || helpdesk?.phone) {
      L.push(keyOnly("organisation/helpdesk", "helpdesk", { indent: 1 }));
      if (helpdesk?.label) L.push(keyValue("organisation/helpdesk/label", "label", helpdesk.label, { indent: 2 }));
      else L.push(pending("organisation/helpdesk/label", "label", "what to call the desk on screen", 2));
      if (helpdesk?.phone) L.push(keyValue("organisation/helpdesk/phone", "phone", helpdesk.phone, { indent: 2 }));
      else L.push(pending("organisation/helpdesk/phone", "phone", "the number, starting with a plus", 2));
    } else {
      L.push(pending("organisation/helpdesk", "helpdesk", "the desk a confused user is told to ring", 1));
    }
  }

  if (Object.keys(hardware).length === 0) {
    L.push(pending("hardware", "hardware", "how many machines, and which ones"));
  } else {
  L.push(keyOnly("hardware", "hardware"));
  if (a.machines !== null) {
    L.push(keyValue("hardware/machines", "machines", a.machines, { indent: 1 }));
  } else {
    L.push(pending("hardware/machines", "machines", "how many", 1));
  }
  if (models.length) {
    L.push(...blockSeq("hardware/models", "models", models.map((m) => ({ value: m })), { indent: 1 }));
  } else {
    L.push(pending("hardware/models", "models", "the machines you have, so we know what to test on", 1));
  }
  if (alsoTest.length) {
    L.push(
      ...blockSeq("hardware/also_test", "also_test", alsoTest.map((t) => ({ value: t })), {
        indent: 1,
        comment: "extra test machines, chosen by how old yours are",
      }),
    );
  }
  }

  L.push(blank("blank/lang"));
  L.push(keyValue("language", "language", a.language, { comment: "this is what pulls in the fonts for it" }));
  if (a.otherLanguages.length) {
    L.push(...blockSeq("other_languages", "other_languages", a.otherLanguages.map((l) => ({ value: l }))));
  }
  L.push(
    keyValue("keyboard", "keyboard", a.keyboard, {
      comment: lang?.secondScript ? "what is printed on the keys" : undefined,
    }),
  );
  if (a.secondScript) {
    L.push(
      keyValue("second_script", "second_script", a.secondScript, {
        comment: "added, never substituted: the login screen needs a Latin layout",
      }),
    );
    L.push(keyValue("switch_scripts_with", "switch_scripts_with", a.switchWith));
  }
  if (a.timezone.trim()) {
    L.push(keyValue("timezone", "timezone", a.timezone.trim()));
  } else {
    L.push(pending("timezone", "timezone", "the clock, as a zone like Europe/London"));
  }

  L.push(blank("blank/apps"));
  L.push(
    ...blockSeq("apps", "apps", apps.map((app) => ({ value: app })), {
      comment: kiosk ? "one window, one job" : "everything these machines have",
    }),
  );

  // ── the prune block ───────────────────────────────────────────────────────────────────
  // Never collapsed. Never truncated. Never smaller than the list above it.
  L.push(blank("blank/prune"));
  L.push(keyOnly("prune", "prune", { comment: "what gets deleted. Not hidden. Deleted." }));
  L.push(
    keyValue("prune/keep_only_the_apps_above", "keep_only_the_apps_above", keepOnly, {
      indent: 1,
      comment: keepOnly ? "everything except the list above goes" : "keep an ordinary desktop, take these out of it",
    }),
  );
  if (alsoKeep.length) {
    L.push(
      ...blockSeq(
        "prune/also_keep",
        "also_keep",
        alsoKeep.map((k) => ({ value: k, comment: KEEP_REASONS[k] })),
        { indent: 1, comment: "capabilities, not applications" },
      ),
    );
  }
  if (alsoRemove.length) {
    L.push(
      ...blockSeq(
        "prune/also_remove",
        "also_remove",
        alsoRemove.map((g) => ({ value: g, comment: REMOVAL_REASONS[g] })) as SeqItem[],
        { indent: 1 },
      ),
    );
  }
  L.push(
    keyValue("prune/must_remove_at_least", "must_remove_at_least", 1, {
      indent: 1,
      comment: "a floor, not a count. The first build measures the real number.",
    }),
  );
  for (const line of L) {
    if (line.id === "prune" || line.id.startsWith("prune/")) line.prune = true;
  }

  L.push(blank("blank/policy"));
  if (a.policy) {
    L.push(keyValue("policy", "policy", a.policy));
  } else {
    L.push(pending("policy", "policy", "who is allowed to change things"));
  }

  const desktop = recipe.desktop as Record<string, boolean | string> | undefined;
  if (desktop) {
    L.push(
      flowMap("desktop", "desktop", Object.entries(desktop), { indent: 0 }),
    );
  }

  if (kiosk) {
    const k = recipe.kiosk as Record<string, unknown>;
    L.push(keyOnly("kiosk", "kiosk", { comment: "there is no desktop shell in this image at all" }));
    if (k.opens) {
      L.push(keyValue("kiosk/opens", "opens", k.opens as string, { indent: 1 }));
    } else {
      L.push(pending("kiosk/opens", "opens", "the one page this machine shows", 1));
    }
    if (Array.isArray(k.allowed_sites) && k.allowed_sites.length) {
      L.push(
        ...blockSeq("kiosk/allowed_sites", "allowed_sites", (k.allowed_sites as string[]).map((s) => ({ value: s })), {
          indent: 1,
          comment: "where the window may go. Read the caveat before trusting this as a boundary.",
        }),
      );
    } else {
      L.push(pending("kiosk/allowed_sites", "allowed_sites", "the only hostnames this window may reach", 1));
    }
    L.push(keyValue("kiosk/printing", "printing", k.printing as boolean, { indent: 1 }));
    L.push(keyValue("kiosk/usb_storage", "usb_storage", false, { indent: 1, comment: "a USB drive does not mount" }));
    L.push(
      keyValue("kiosk/forget", "forget_session_after_minutes", k.forget_session_after_minutes as number, {
        indent: 1,
        comment: "what stops one visitor's form being on screen for the next one",
      }),
    );
    if (k.restart_daily_at) {
      L.push(keyValue("kiosk/restart", "restart_daily_at", k.restart_daily_at as string, { indent: 1 }));
    }
  } else {
    const wa = recipe.windows_apps as Record<string, unknown>;
    if (wa.enabled) {
      L.push(keyOnly("windows_apps", "windows_apps"));
      L.push(keyValue("windows_apps/enabled", "enabled", true, { indent: 1 }));
      L.push(
        keyValue("windows_apps/promise", "we_promise_nothing_else", true, {
          indent: 1,
          comment: "required, and only ever true",
        }),
      );
      L.push(comment("windows_apps/note", "there is no `tested:` list here because nobody has run your", 1));
      L.push(comment("windows_apps/note2", "programs on these machines yet. Send us the list and we will.", 1));
    } else {
      L.push(flowMap("windows_apps", "windows_apps", [["enabled", false]]));
    }
  }

  if (a.firstBootMessage.trim()) {
    L.push(keyValue("first_boot_message", "first_boot_message", a.firstBootMessage.trim()));
  }

  L.push(blank("blank/size"));
  L.push(
    keyValue("size_budget_gb", "size_budget_gb", budget, {
      comment: "a ceiling the build enforces, not a prediction of the finished size",
    }),
  );

  if (approved.name && approved.role) {
    L.push(
      flowMap("approved_by", "approved_by", [
        ["enrolment", "pending"],
        ["name", approved.name as string],
        ["role", approved.role as string],
        ["date", approved.date as string],
      ]),
    );
  } else {
    L.push(keyOnly("approved_by", "approved_by", { comment: "a named person has to sign this off" }));
    L.push(
      keyValue("approved_by/enrolment", "enrolment", "pending", {
        indent: 1,
        comment: "test-builds, never reaches a machine",
      }),
    );
    if (approved.name) L.push(keyValue("approved_by/name", "name", approved.name as string, { indent: 1 }));
    else L.push(pending("approved_by/name", "name", "who is signing this off", 1));
    if (approved.role) L.push(keyValue("approved_by/role", "role", approved.role as string, { indent: 1 }));
    else L.push(pending("approved_by/role", "role", "their role at the organisation", 1));
    L.push(keyValue("approved_by/date", "date", approved.date as string, { indent: 1 }));
  }

  // The impossible line, rendered exactly where it would sit if it were possible.
  if (special && special.id !== "none") {
    L.push(blank("blank/refused"));
    L.push(comment("refused/label", "the thing you also asked for:"));
    for (const [key, value] of Object.entries(recipe)) {
      if (KNOWN_FIELDS.has(key)) continue;
      L.push({
        id: `refused/${key}`,
        kind: "key",
        text: Array.isArray(value)
          ? `${key}: [${value.map(String).join(", ")}]`
          : `${key}: ${typeof value === "string" ? value : String(value)}`,
      });
    }
    if (a.alsoAsking === "drop-a11y") {
      L.push({ id: "refused/a11y", kind: "item", text: "  (see prune.also_remove above)" });
    }
  }

  return {
    recipe,
    lines: L,
    text: render(L),
    derived: { apps, alsoKeep, alsoRemove, alsoTest, draftedFor, sizeBudgetGb: budget },
  };
}

/** Everything the schema has a name for. Anything else in the object is a refused request. */
const KNOWN_FIELDS = new Set([
  "schema",
  "name",
  "for",
  "organisation",
  "hardware",
  "language",
  "other_languages",
  "keyboard",
  "second_script",
  "switch_scripts_with",
  "timezone",
  "apps",
  "prune",
  "policy",
  "desktop",
  "kiosk",
  "windows_apps",
  "theme",
  "updates",
  "first_boot_message",
  "size_budget_gb",
  "approved_by",
]);

/** The named removals, for the places on the page that want them outside the YAML. */
export function removalSummary(a: Answers): { removed: RemovableGroup[]; kept: string[] } {
  const { alsoKeep, alsoRemove } = partitionRemovals(a.activities);
  return { removed: alsoRemove, kept: alsoKeep };
}

/** Which activity would have kept a given group, for the form's own explanations. */
export function activityKeeping(group: RemovableGroup): string | undefined {
  return ACTIVITIES.find((x) => x.keeps === group)?.label;
}

/**
 * Check that the TEXT and the OBJECT are the same file.
 *
 * This is the one bug class that would make the panel a liar without looking wrong: the
 * validator passes an object while the reader is shown a document that parses differently —
 * a block header with nothing under it parsing as null, say, or a key emitted but never added.
 * It compares the top-level keys of the emitted document against the keys of the object the
 * validator saw, and returns every disagreement. Tests and CI call it; it is cheap enough to
 * call anywhere.
 */
export function auditDocument(result: RenderResult): string[] {
  const problems: string[] = [];
  const inText = new Set<string>();
  const lines = result.lines;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.kind === "blank" || line.kind === "comment" || line.kind === "text") continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*):(\s|$)/.exec(line.text);
    if (!m) continue;
    inText.add(m[1]);
    // A bare `key:` must be followed by something indented under it, or it parses as null.
    if (/^[A-Za-z_][A-Za-z0-9_]*:(\s*#.*)?$/.test(line.text)) {
      const next = lines.slice(i + 1).find((l) => l.kind !== "blank" && l.kind !== "comment");
      if (!next || !next.text.startsWith("  ")) {
        problems.push(`\`${m[1]}\` is written as a block but has nothing under it, so it parses as null.`);
      }
    }
  }
  const inObject = new Set(Object.keys(result.recipe));
  for (const k of inObject) if (!inText.has(k)) problems.push(`\`${k}\` is in the validated object but not in the document.`);
  for (const k of inText) if (!inObject.has(k)) problems.push(`\`${k}\` is in the document but not in the validated object.`);
  return problems;
}
