/**
 * A JSON Schema 2020-12 evaluator, for the subset `recipe.schema.json` actually uses.
 *
 * WHY THIS FILE EXISTS AND WHY IT IS NOT A SET OF RULES
 * ─────────────────────────────────────────────────────
 * The configurator must reject exactly what CI rejects. If the site can render YAML the
 * validator would refuse, the site is lying at the moment it is trying hardest to be trusted.
 * So the rules live in ONE place — `auros-recipes/schema/recipe.schema.json`, vendored here
 * byte-for-byte by `schema-sync.mjs` and checked in CI — and this file is only the machine
 * that reads them. There is no second copy of a rule anywhere in `src/`.
 *
 * FAILING CLOSED
 * This implements a subset. A subset that silently ignores the keywords it does not know is
 * the drift we are trying to prevent: the day someone adds `dependentRequired` to the schema,
 * a permissive evaluator starts passing recipes CI refuses, and nothing anywhere says so.
 * So `assertSupported()` walks the schema at startup and throws on any keyword this evaluator
 * does not implement. The site fails to build rather than quietly disagreeing with CI.
 *
 * When `auros-web` has a `package.json` (owned by another agent), this whole file is
 * replaceable by Ajv in about ten lines. The interface below is deliberately Ajv-shaped so
 * that swap is a swap and not a rewrite. What must not change is where the rules live.
 */

/** Anything the evaluator can be handed. */
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export type SchemaError = {
  /** JSON Pointer into the instance, e.g. `/prune/also_remove/0`. */
  instancePath: string;
  /** JSON Pointer into the schema, for debugging. */
  schemaPath: string;
  keyword: string;
  /** Terse, machine-ish. Use `title`/`detail` for anything a person reads. */
  message: string;
  /**
   * The nearest enclosing subschema's own `title` and `description`, when it has them.
   * This is how a refusal reaches the screen in the schema author's words rather than ours.
   */
  title?: string;
  detail?: string;
};

type SchemaObject = { [k: string]: Json };

/** Keywords this evaluator applies. */
const APPLIED = new Set([
  "$ref",
  "type",
  "const",
  "enum",
  "format",
  "pattern",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "uniqueItems",
  "allOf",
  "oneOf",
  "not",
  "if",
  "then",
]);

/** Keywords that carry meaning for humans or tooling and none for validation. */
const ANNOTATION = new Set(["$schema", "$id", "$defs", "$comment", "title", "description", "default", "examples", "deprecated", "readOnly", "writeOnly"]);

/** Resolve a local `#/...` JSON pointer against the root schema. */
function resolveRef(root: Json, ref: string): Json {
  if (!ref.startsWith("#/") && ref !== "#") throw new Error(`only local refs are supported, got ${ref}`);
  if (ref === "#") return root;
  let node: Json = root;
  for (const rawPart of ref.slice(2).split("/")) {
    const part = rawPart.replace(/~1/g, "/").replace(/~0/g, "~");
    if (node === null || typeof node !== "object" || Array.isArray(node)) {
      throw new Error(`cannot resolve ${ref}`);
    }
    node = (node as SchemaObject)[part];
    if (node === undefined) throw new Error(`cannot resolve ${ref}`);
  }
  return node;
}

/**
 * Walk the schema as it will actually be applied — from the root, following `$ref`s — and throw
 * if it uses a keyword this evaluator does not apply.
 *
 * It follows refs rather than walking `$defs` wholesale on purpose. `$defs` is a namespace, not
 * a schema: `$defs/refusals` is a bag of ten named subschemas and is not itself one. Following
 * refs checks exactly the subschemas that are reachable from the root, which is exactly the set
 * that can decide a recipe.
 */
export function assertSupported(root: Json, schema: Json = root, path = "#", seen = new Set<string>()): void {
  if (Array.isArray(schema)) {
    schema.forEach((s, i) => assertSupported(root, s, `${path}/${i}`, seen));
    return;
  }
  if (schema === null || typeof schema !== "object") return;
  for (const [key, value] of Object.entries(schema as SchemaObject)) {
    if (ANNOTATION.has(key)) continue;
    if (!APPLIED.has(key)) {
      throw new Error(
        `recipe schema uses \`${key}\` at ${path}, which src/lib/json-schema.ts does not implement. ` +
          `Implement it or switch to Ajv — do not let the site validate by a different rulebook than CI does.`,
      );
    }
    switch (key) {
      case "$ref": {
        const ref = value as string;
        if (seen.has(ref)) break;
        seen.add(ref);
        assertSupported(root, resolveRef(root, ref), ref, seen);
        break;
      }
      case "properties": {
        for (const [k, v] of Object.entries(value as SchemaObject)) assertSupported(root, v, `${path}/properties/${k}`, seen);
        break;
      }
      case "items":
      case "not":
      case "if":
      case "then":
      case "additionalProperties": {
        if (value !== null && typeof value === "object") assertSupported(root, value, `${path}/${key}`, seen);
        break;
      }
      case "allOf":
      case "oneOf": {
        (value as Json[]).forEach((sub, i) => assertSupported(root, sub, `${path}/${key}/${i}`, seen));
        break;
      }
      case "format": {
        if (value !== "date") {
          throw new Error(`recipe schema uses format "${String(value)}" at ${path}; only "date" is implemented.`);
        }
        break;
      }
      default:
        break;
    }
  }
}

type Titled = { title: string; detail: string } | undefined;

type Ctx = {
  root: Json;
  errors: SchemaError[];
  /** The nearest enclosing subschema that named itself. Carries refusal text to the surface. */
  titled: Titled;
  /** Suppresses error collection while probing (`if`, `not`, `oneOf` branches). */
  quiet: boolean;
};

function typeOf(v: Json): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

function sameJson(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (typeof a !== "object") return false;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function canonical(v: Json): Json {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    const out: SchemaObject = {};
    for (const k of Object.keys(v as SchemaObject).sort()) out[k] = canonical((v as SchemaObject)[k]);
    return out;
  }
  return v;
}

const DATE_RE = /^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])$/;

function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function fail(ctx: Ctx, instancePath: string, schemaPath: string, keyword: string, message: string): false {
  if (!ctx.quiet) {
    ctx.errors.push({
      instancePath,
      schemaPath,
      keyword,
      message,
      ...(ctx.titled ? { title: ctx.titled.title, detail: ctx.titled.detail } : {}),
    });
  }
  return false;
}

function evaluate(schema: Json, instance: Json, instancePath: string, schemaPath: string, ctx: Ctx): boolean {
  if (schema === true) return true;
  if (schema === false) return fail(ctx, instancePath, schemaPath, "false", "nothing is allowed here");
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) return true;

  const s = schema as SchemaObject;

  // A subschema that names itself becomes the voice of any failure beneath it. This is the
  // mechanism that lets a refusal print the schema author's paragraph instead of "unexpected
  // property" — the refusals in recipe.schema.json are titled for exactly this reason.
  const outerTitled = ctx.titled;
  if (typeof s.title === "string" && typeof s.description === "string") {
    ctx.titled = { title: s.title, detail: s.description };
  }
  try {
    return evaluateBody(s, instance, instancePath, schemaPath, ctx);
  } finally {
    ctx.titled = outerTitled;
  }
}

function evaluateBody(s: SchemaObject, instance: Json, instancePath: string, schemaPath: string, ctx: Ctx): boolean {
  let ok = true;

  if (typeof s.$ref === "string") {
    const target = resolveRef(ctx.root, s.$ref);
    if (!evaluate(target, instance, instancePath, `${schemaPath}/$ref`, ctx)) ok = false;
  }

  if (s.type !== undefined) {
    const actual = typeOf(instance);
    const wanted = Array.isArray(s.type) ? (s.type as string[]) : [s.type as string];
    const matched = wanted.some((t) => t === actual || (t === "number" && actual === "integer"));
    if (!matched) {
      ok = fail(ctx, instancePath, `${schemaPath}/type`, "type", `must be ${wanted.join(" or ")}, got ${actual}`);
      // Every remaining keyword here is about a type this value does not have.
      return ok;
    }
  }

  if (s.const !== undefined && !sameJson(instance, s.const)) {
    ok = fail(ctx, instancePath, `${schemaPath}/const`, "const", `must be ${JSON.stringify(s.const)}`);
  }

  if (Array.isArray(s.enum) && !(s.enum as Json[]).some((v) => sameJson(instance, v))) {
    ok = fail(ctx, instancePath, `${schemaPath}/enum`, "enum", `must be one of: ${(s.enum as Json[]).map((v) => JSON.stringify(v)).join(", ")}`);
  }

  if (typeof instance === "string") {
    if (typeof s.pattern === "string" && !new RegExp(s.pattern).test(instance)) {
      ok = fail(ctx, instancePath, `${schemaPath}/pattern`, "pattern", `does not match the shape this field allows`);
    }
    if (typeof s.minLength === "number" && [...instance].length < s.minLength) {
      ok = fail(ctx, instancePath, `${schemaPath}/minLength`, "minLength", `must be at least ${s.minLength} characters`);
    }
    if (typeof s.maxLength === "number" && [...instance].length > s.maxLength) {
      ok = fail(ctx, instancePath, `${schemaPath}/maxLength`, "maxLength", `must be at most ${s.maxLength} characters`);
    }
    if (s.format === "date" && !isRealDate(instance)) {
      ok = fail(ctx, instancePath, `${schemaPath}/format`, "format", "must be a real calendar day, written YYYY-MM-DD");
    }
  }

  if (typeof instance === "number") {
    if (typeof s.minimum === "number" && instance < s.minimum) {
      ok = fail(ctx, instancePath, `${schemaPath}/minimum`, "minimum", `must be at least ${s.minimum}`);
    }
    if (typeof s.maximum === "number" && instance > s.maximum) {
      ok = fail(ctx, instancePath, `${schemaPath}/maximum`, "maximum", `must be at most ${s.maximum}`);
    }
  }

  if (Array.isArray(instance)) {
    if (typeof s.minItems === "number" && instance.length < s.minItems) {
      ok = fail(ctx, instancePath, `${schemaPath}/minItems`, "minItems", `needs at least ${s.minItems} item${s.minItems === 1 ? "" : "s"}`);
    }
    if (typeof s.maxItems === "number" && instance.length > s.maxItems) {
      ok = fail(ctx, instancePath, `${schemaPath}/maxItems`, "maxItems", `may hold at most ${s.maxItems} items`);
    }
    if (s.uniqueItems === true) {
      for (let i = 0; i < instance.length; i++) {
        for (let j = i + 1; j < instance.length; j++) {
          if (sameJson(instance[i], instance[j])) {
            ok = fail(ctx, `${instancePath}/${j}`, `${schemaPath}/uniqueItems`, "uniqueItems", "the same entry appears twice");
          }
        }
      }
    }
    if (s.items !== undefined) {
      instance.forEach((item, i) => {
        if (!evaluate(s.items as Json, item, `${instancePath}/${i}`, `${schemaPath}/items`, ctx)) ok = false;
      });
    }
  }

  const isObject = instance !== null && typeof instance === "object" && !Array.isArray(instance);
  if (isObject) {
    const obj = instance as SchemaObject;
    if (Array.isArray(s.required)) {
      for (const key of s.required as string[]) {
        if (!(key in obj)) {
          ok = fail(ctx, instancePath, `${schemaPath}/required`, "required", `is missing \`${key}\``);
        }
      }
    }
    const props = (s.properties as SchemaObject | undefined) ?? {};
    for (const [key, sub] of Object.entries(props)) {
      if (key in obj) {
        if (!evaluate(sub, obj[key], `${instancePath}/${key}`, `${schemaPath}/properties/${key}`, ctx)) ok = false;
      }
    }
    if (s.additionalProperties !== undefined) {
      for (const key of Object.keys(obj)) {
        if (key in props) continue;
        if (s.additionalProperties === false) {
          ok = fail(ctx, `${instancePath}/${key}`, `${schemaPath}/additionalProperties`, "additionalProperties", `\`${key}\` is not a field this file has`);
        } else if (!evaluate(s.additionalProperties, obj[key], `${instancePath}/${key}`, `${schemaPath}/additionalProperties`, ctx)) {
          ok = false;
        }
      }
    }
  }

  if (Array.isArray(s.allOf)) {
    (s.allOf as Json[]).forEach((sub, i) => {
      if (!evaluate(sub, instance, instancePath, `${schemaPath}/allOf/${i}`, ctx)) ok = false;
    });
  }

  if (Array.isArray(s.oneOf)) {
    const branches = s.oneOf as Json[];
    const passing = branches.filter((sub, i) => probe(sub, instance, instancePath, `${schemaPath}/oneOf/${i}`, ctx));
    if (passing.length !== 1) {
      ok = fail(
        ctx,
        instancePath,
        `${schemaPath}/oneOf`,
        "oneOf",
        passing.length === 0 ? "does not match any of the allowed forms" : "matches more than one of the allowed forms",
      );
    }
  }

  if (s.not !== undefined && probe(s.not, instance, instancePath, `${schemaPath}/not`, ctx)) {
    ok = fail(ctx, instancePath, `${schemaPath}/not`, "not", describeNot(s.not));
  }

  if (s.if !== undefined && s.then !== undefined) {
    if (probe(s.if, instance, instancePath, `${schemaPath}/if`, ctx)) {
      if (!evaluate(s.then, instance, instancePath, `${schemaPath}/then`, ctx)) ok = false;
    }
  }

  return ok;
}

/** Evaluate a subschema without recording errors, to answer a yes/no question. */
function probe(schema: Json, instance: Json, instancePath: string, schemaPath: string, ctx: Ctx): boolean {
  const wasQuiet = ctx.quiet;
  const before = ctx.errors.length;
  ctx.quiet = true;
  try {
    return evaluate(schema, instance, instancePath, schemaPath, ctx);
  } finally {
    ctx.quiet = wasQuiet;
    ctx.errors.length = before;
  }
}

/** The refusals are written as `not: { required: [...] }`, so the field name is right there. */
function describeNot(notSchema: Json): string {
  if (notSchema && typeof notSchema === "object" && !Array.isArray(notSchema)) {
    const req = (notSchema as SchemaObject).required;
    if (Array.isArray(req) && req.length === 1 && typeof req[0] === "string") {
      return `\`${req[0]}\` is refused by name`;
    }
    const en = (notSchema as SchemaObject).enum;
    if (Array.isArray(en)) return "this value is refused by name";
  }
  return "this is refused";
}

export type ValidateResult = { valid: boolean; errors: SchemaError[] };

/** Validate `instance` against `schema`. Deterministic: same input, same error order. */
export function validate(schema: Json, instance: Json): ValidateResult {
  const ctx: Ctx = { root: schema, errors: [], titled: undefined, quiet: false };
  const valid = evaluate(schema, instance, "", "#", ctx);
  return { valid, errors: ctx.errors };
}
