/**
 * A small, deterministic YAML writer for the shape `recipe.yaml` has.
 *
 * It is a writer, not a library: it emits the handful of YAML constructs the recipe schema
 * needs, in a fixed field order, and it emits them as a list of LINES each carrying a stable
 * id. The ids are what lets the panel highlight the lines that actually changed without
 * re-rendering everything — a value changing is a real fact and may be marked as one (spec
 * section 7); nothing here animates, streams, or types itself out.
 *
 * Determinism matters beyond tidiness: the same answers must produce the same file, because the
 * file on screen is the file that gets committed.
 */

export type LineKind = "comment" | "blank" | "key" | "item" | "text";

export type YamlLine = {
  /** Stable across renders. Two renders agreeing on an id are claiming the line is the same line. */
  id: string;
  text: string;
  kind: LineKind;
  /** Set on every line belonging to the prune block, so the panel can mark it and never hide it. */
  prune?: boolean;
  /** Set on lines the reader still has to fill in. */
  pending?: boolean;
};

const CONTROL = new RegExp(
  "[\\u0000-\\u0008\\u000b-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u2069]",
);

/**
 * Quote when a plain scalar would be ambiguous, and not otherwise. Over-quoting makes a config
 * file look machine-written, which is the opposite of what this file is for.
 */
export function scalar(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  const s = value;
  if (s.length === 0) return '""';
  if (CONTROL.test(s) || s.includes("\n")) return JSON.stringify(s);
  // A plain scalar is safe when it opens with a letter or an opening bracket and carries no
  // construct that would end it early.
  const opensSafely = /^[\p{L}(]/u.test(s);
  const hasBreaker = s.includes(": ") || s.includes(" #") || /[:,]$/.test(s) || /^\s|\s$/.test(s);
  if (opensSafely && !hasBreaker) return s;
  return JSON.stringify(s);
}

const pad = (indent: number) => "  ".repeat(indent);

export function comment(id: string, text: string, indent = 0): YamlLine {
  return { id, kind: "comment", text: `${pad(indent)}# ${text}` };
}

export function blank(id: string): YamlLine {
  return { id, kind: "blank", text: "" };
}

export function keyValue(
  id: string,
  key: string,
  value: string | number | boolean,
  opts: { indent?: number; comment?: string; pending?: boolean } = {},
): YamlLine {
  const indent = opts.indent ?? 0;
  const tail = opts.comment ? `  # ${opts.comment}` : "";
  return { id, kind: "key", text: `${pad(indent)}${key}: ${scalar(value)}${tail}`, pending: opts.pending };
}

/** A key with nothing after the colon; its children follow, indented. */
export function keyOnly(id: string, key: string, opts: { indent?: number; comment?: string } = {}): YamlLine {
  const indent = opts.indent ?? 0;
  const tail = opts.comment ? `  # ${opts.comment}` : "";
  return { id, kind: "key", text: `${pad(indent)}${key}:${tail}` };
}

export type SeqItem = { value: string | number | boolean; comment?: string; id?: string };

/**
 * A block sequence: one entry per line.
 *
 * The prune block in particular is ALWAYS emitted like this rather than as a flow list. One
 * deletion per line is the whole point: the reader is meant to be able to run their eye down
 * the list of things that will not be on their machines and find it longer than the list of
 * things that will.
 */
export function blockSeq(
  idPrefix: string,
  key: string,
  items: SeqItem[],
  opts: { indent?: number; comment?: string } = {},
): YamlLine[] {
  const indent = opts.indent ?? 0;
  const lines: YamlLine[] = [keyOnly(idPrefix, key, { indent, comment: opts.comment })];
  for (const item of items) {
    const tail = item.comment ? `  # ${item.comment}` : "";
    lines.push({
      id: item.id ?? `${idPrefix}/${String(item.value)}`,
      kind: "item",
      text: `${pad(indent + 1)}- ${scalar(item.value)}${tail}`,
    });
  }
  return lines;
}

/** A single-line flow mapping, e.g. `helpdesk: { label: Front desk, phone: "+1 425 555 0178" }`. */
export function flowMap(
  id: string,
  key: string,
  entries: [string, string | number | boolean][],
  opts: { indent?: number } = {},
): YamlLine {
  const indent = opts.indent ?? 0;
  const body = entries.map(([k, v]) => `${k}: ${flowScalar(v)}`).join(", ");
  return { id, kind: "key", text: `${pad(indent)}${key}: { ${body} }` };
}

/** Inside flow context, the structural characters end a plain scalar too. */
function flowScalar(value: string | number | boolean): string {
  if (typeof value !== "string") return scalar(value);
  if (/[,[\]{}]/.test(value)) return JSON.stringify(value);
  return scalar(value);
}

/**
 * A folded block scalar for the one paragraph in the file.
 * `>-` rather than `>` so the value round-trips through a parser exactly as written.
 */
export function folded(
  idPrefix: string,
  key: string,
  text: string,
  opts: { indent?: number; width?: number } = {},
): YamlLine[] {
  const indent = opts.indent ?? 0;
  const width = opts.width ?? 88;
  const lines: YamlLine[] = [{ id: idPrefix, kind: "key", text: `${pad(indent)}${key}: >-` }];
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  let current = "";
  let n = 0;
  const push = () => {
    if (!current) return;
    lines.push({ id: `${idPrefix}/${n++}`, kind: "text", text: `${pad(indent + 1)}${current}` });
    current = "";
  };
  for (const word of words) {
    if (current && current.length + 1 + word.length > width) push();
    current = current ? `${current} ${word}` : word;
  }
  push();
  if (lines.length === 1) lines.push({ id: `${idPrefix}/0`, kind: "text", text: pad(indent + 1) });
  return lines;
}

/** The document as text, for the clipboard, the download and the pull request body. */
export function render(lines: YamlLine[]): string {
  return lines.map((l) => l.text).join("\n") + "\n";
}

/**
 * Which line ids differ between two renders. Used for the settle highlight and for nothing else:
 * the panel marks what changed, then stops.
 */
export function changedIds(before: YamlLine[], after: YamlLine[]): Set<string> {
  // A first render is not a change. Everything arriving at once is the page loading.
  if (before.length === 0) return new Set<string>();
  const prev = new Map(before.map((l) => [l.id, l.text]));
  const changed = new Set<string>();
  for (const line of after) {
    if (line.kind === "blank") continue;
    const was = prev.get(line.id);
    if (was === undefined || was !== line.text) changed.add(line.id);
  }
  return changed;
}
