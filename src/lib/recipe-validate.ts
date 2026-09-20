/**
 * The same rulebook CI uses, applied in the browser.
 *
 * The schema is IMPORTED, not restated. There is no second list of rules anywhere in `src/`:
 * `schema/recipe.schema.json` is a byte-identical copy of the file in `auros-recipes`, kept
 * current by `schema/sync.mjs --check` in CI, and `json-schema.ts` is a reader for it that
 * throws rather than skip a keyword it does not implement. A site that can render YAML CI
 * would reject is a site lying at the moment it is trying hardest to be trusted, so the only
 * acceptable failure mode here is refusing to build.
 *
 * A client-side check is a convenience and never a control. The Worker re-validates every
 * submission with this same schema before it writes anything.
 *
 * WHAT THIS FILE ADDS ON TOP OF VALIDATION
 * It sorts the schema's complaints into four kinds, because they mean different things to a
 * reader and deserve different words on screen:
 *
 *   refusal     the schema will not say this, ever, and it explains why in its own paragraph
 *   conflict    two answers contradict each other and the file refuses to pick a winner
 *   incomplete  a field is still blank. Not an error; work not done yet
 *   invalid     something is filled in but the wrong shape
 *
 * Every word of a refusal comes out of the schema. None of it is written here. That is the
 * point: the reader is seeing what the validator says, not our summary of it.
 */

import schema from "../../schema/recipe.schema.json";
import { assertSupported, validate, type Json, type SchemaError } from "./json-schema";

const SCHEMA = schema as unknown as Json;

/**
 * Runs once, at module load, in the browser and on the server. If the schema in `auros-recipes`
 * grows a keyword this evaluator does not apply, the site stops working immediately and loudly
 * rather than quietly passing recipes CI would reject.
 */
assertSupported(SCHEMA);

export const SCHEMA_TITLE = (schema as { title?: string }).title ?? "";

export type FindingKind = "refusal" | "conflict" | "incomplete" | "invalid";

export type Finding = {
  kind: FindingKind;
  /** The schema's own heading, where the failing rule has one. */
  title: string;
  /** The schema's own paragraph. Not paraphrased, not shortened, not softened. */
  detail: string;
  /** Where in the file, in words. */
  where: string;
  /** The terse machine reason, kept for the ones with no paragraph of their own. */
  message: string;
  /** For `incomplete`: the field that is still blank. */
  field?: string;
};

export type Verdict = {
  /** `ready` means this exact text would pass the CI validator as written. */
  status: "ready" | "refused" | "conflict" | "invalid" | "incomplete";
  valid: boolean;
  findings: Finding[];
  refusals: Finding[];
  conflicts: Finding[];
  incomplete: Finding[];
  invalid: Finding[];
};

/** `/prune/also_remove/0` becomes `prune -> also_remove -> first entry`. */
function humanPath(pointer: string): string {
  if (!pointer) return "the file itself";
  const parts = pointer.split("/").filter(Boolean);
  const ordinals = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
  return parts
    .map((p) => {
      if (/^\d+$/.test(p)) {
        const n = Number(p);
        return `${ordinals[n] ?? `entry ${n + 1}`} entry`;
      }
      return p;
    })
    .join(" › ");
}

/** The field name out of "`kernel` is refused by name" / "is missing `models`". */
function backtickedField(message: string): string | null {
  const m = /`([^`]+)`/.exec(message);
  return m ? m[1] : null;
}

function classify(err: SchemaError): FindingKind {
  const titled = Boolean(err.title) && err.title !== SCHEMA_TITLE;
  if (err.keyword === "not") return titled ? "refusal" : "invalid";
  if (err.keyword === "required") return titled ? "conflict" : "incomplete";
  return "invalid";
}

function toFinding(err: SchemaError): Finding {
  const kind = classify(err);
  const titled = Boolean(err.title) && err.title !== SCHEMA_TITLE;
  return {
    kind,
    title: titled ? (err.title as string) : "",
    detail: titled ? (err.detail as string) : "",
    where: humanPath(err.instancePath),
    message: err.message,
    ...(kind === "incomplete" ? { field: backtickedField(err.message) ?? undefined } : {}),
  };
}

export function validateRecipe(recipe: unknown): Verdict {
  const { valid, errors } = validate(SCHEMA, recipe as Json);

  // A refused field also trips `additionalProperties`, because the schema has no such field AND
  // says why. Showing both would bury the paragraph under "`pin` is not a field this file has",
  // which is the true statement that teaches nobody anything.
  const refusedKeys = new Set<string>();
  const refusedPaths = new Set<string>();
  for (const e of errors) {
    if (classify(e) !== "refusal") continue;
    refusedPaths.add(e.instancePath);
    const f = backtickedField(e.message);
    if (f) refusedKeys.add(f);
  }

  const kept = errors.filter((e) => {
    if (classify(e) === "refusal") return true;
    if (e.keyword === "additionalProperties") {
      const key = e.instancePath.split("/").pop() ?? "";
      if (refusedKeys.has(key)) return false;
    }
    // A value the schema refuses by name also fails the plain enum beside the refusal.
    if (refusedPaths.has(e.instancePath)) return false;
    return true;
  });

  const seen = new Set<string>();
  const findings: Finding[] = [];
  for (const e of kept) {
    const f = toFinding(e);
    const key = `${f.kind}|${f.title}|${f.where}|${f.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push(f);
  }

  const refusals = findings.filter((f) => f.kind === "refusal");
  const conflicts = findings.filter((f) => f.kind === "conflict");
  const incomplete = findings.filter((f) => f.kind === "incomplete");
  const invalid = findings.filter((f) => f.kind === "invalid");

  const status: Verdict["status"] = refusals.length
    ? "refused"
    : conflicts.length
      ? "conflict"
      : invalid.length
        ? "invalid"
        : incomplete.length
          ? "incomplete"
          : "ready";

  return { status, valid, findings, refusals, conflicts, incomplete, invalid };
}

/**
 * The one-line status the panel announces. Deliberately flat: a refusal is not an apology and
 * an incomplete file is not a failure.
 */
export function statusLine(v: Verdict): string {
  switch (v.status) {
    case "ready":
      return "This file passes the validator. It is ready to be opened as a pull request.";
    case "refused":
      return "The validator refuses this, and says why below. This is the validator's own wording, not ours.";
    case "conflict":
      return "Two of your answers contradict each other, so the file refuses to pick a winner.";
    case "invalid":
      return `Something is filled in but the wrong shape. ${v.invalid.length} to fix.`;
    case "incomplete": {
      const names = [...new Set(v.incomplete.map((f) => (f.where === "the file itself" ? f.field : `${f.where} \u203a ${f.field}`))).values()];
      return `Not finished yet. Still blank: ${names.join(", ")}.`;
    }
  }
}
