/**
 * Painting the output panel.
 *
 * Spec section 6D calls this panel the single most persuasive object on the site, so the rules
 * it is painted under are rules, not preferences:
 *
 *   THE PRUNE BLOCK IS NEVER COLLAPSED, never truncated behind a "show more", and never
 *   rendered smaller than the apps list. Every line carries `data-section`, and the stylesheet
 *   is only ever allowed to shrink `apps`. If a narrow screen forces a choice, the apps list
 *   gives way. The asymmetry between what stays and what is deleted is the argument.
 *
 *   NOTHING HERE PRETENDS TO BE ALIVE. A value changing is a real fact, so a changed line is
 *   marked and settles (spec section 7). There is no typewriter, no streaming, no cursor, and
 *   under `prefers-reduced-motion` the mark appears and clears with no transition at all.
 *
 *   THE WHOLE FILE IS NOT SHOUTED AT SCREEN READERS. The panel is a polite live region, but the
 *   `<pre>` inside it is `aria-live="off"`: re-announcing two hundred lines on every keystroke
 *   is not "updates without interrupting", it is interrupting continuously. The polite region
 *   carries a short summary; the file itself is focusable and read on demand.
 */

import type { YamlLine } from "../../lib/yaml";
import { changedIds } from "../../lib/yaml";
import type { Verdict } from "../../lib/recipe-validate";
import { statusLine } from "../../lib/recipe-validate";

export type PanelElements = {
  root: HTMLElement;
  code: HTMLElement;
  status: HTMLElement;
  findings: HTMLElement;
  summary: HTMLElement;
  illustration: HTMLElement | null;
  path: HTMLElement | null;
};

/** Which part of the file a line belongs to. Only `apps` may ever be shrunk. */
export function sectionOf(line: YamlLine): string {
  if (line.prune) return "prune";
  const id = line.id;
  if (id === "apps" || id.startsWith("apps/")) return "apps";
  if (id.startsWith("refused/")) return "refused";
  if (id.startsWith("kiosk")) return "kiosk";
  if (id.startsWith("windows_apps")) return "windows";
  return "body";
}

/** Build the line markup. Exported so the server render and the client render cannot diverge. */
export function linesToHtml(lines: YamlLine[]): string {
  return lines
    .map((line) => {
      const attrs = [
        `class="cfg-line"`,
        `data-id="${escapeAttr(line.id)}"`,
        `data-section="${sectionOf(line)}"`,
        `data-kind="${line.kind}"`,
        line.pending ? `data-pending="true"` : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<span ${attrs}>${escapeText(line.text)}</span>`;
    })
    // Joined with nothing, not with a newline. Each line is a block element inside a `<pre>`,
    // so a literal newline between them is a SECOND line break and the file renders
    // double-spaced. Selecting and copying still yields one newline per line, because that is
    // what a block element does.
    .join("");
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;");
}

const HIGHLIGHT_MS = 1100;

export type PanelState = {
  previous: YamlLine[];
  /** Increments once per marked repaint, so a stale settle timer cannot clear a fresh mark. */
  generation: number;
};

export function createPanelState(): PanelState {
  return { previous: [], generation: 0 };
}

export type PaintInput = {
  lines: YamlLine[];
  verdict: Verdict;
  /** The path this file would be committed at, once it has a name. */
  path: string;
  /** Kept until the visitor has answered something. Their file is not an illustration. */
  showIllustration: boolean;
  /** Counts of things the reader can verify on screen. Never a package count. */
  summary: { apps: number; removedGroups: number; keptCapabilities: number };
};

/**
 * Everything about a line that its rendered `<span>` carries, as one comparable string.
 *
 * JSON rather than a delimiter: the line text is arbitrary user input and there is no
 * separator character it cannot contain, so a hand-rolled one would make two different lines
 * compare equal and silently stop repainting one of them.
 */
function lineShape(line: YamlLine): string {
  return JSON.stringify([line.text, line.kind, sectionOf(line), line.pending === true]);
}

/** Rewrite one existing `<span>` in place to match a line. */
function writeLine(node: HTMLElement, line: YamlLine): void {
  node.textContent = line.text;
  node.dataset.kind = line.kind;
  node.dataset.section = sectionOf(line);
  if (line.pending) node.dataset.pending = "true";
  else delete node.dataset.pending;
}

/**
 * Repaint.
 *
 * ONLY THE LINES THAT ACTUALLY CHANGED ARE TOUCHED, and that is a property of the code below
 * rather than an aspiration written above it. When the file keeps its shape — the same line ids
 * in the same order, which is every keystroke that edits a value — the existing `<span>`s are
 * rewritten in place and the rest of the DOM is left alone. Only a change to the SET of lines
 * (a policy that adds a kiosk block, an answer that adds a refusal) rebuilds the file.
 *
 * It is not only cheaper. A full `innerHTML` swap destroys any text selection inside the panel,
 * and selecting the file by hand is the documented fallback when the clipboard API refuses —
 * `configurator.client.ts` relabels the button "Select the file and copy it" in exactly that
 * case, and a panel that dropped the selection on the next keystroke would be offering a
 * fallback it then took away. It is also ~50 fewer node mutations per keystroke inside an
 * `aria-live="polite"` ancestor, which stops the nested `aria-live="off"` on the `<pre>` from
 * being the only thing holding that back.
 */
export function paint(el: PanelElements, state: PanelState, input: PaintInput): void {
  const changed = changedIds(state.previous, input.lines);

  const nodes = el.code.children;
  const sameShape =
    state.previous.length === input.lines.length &&
    nodes.length === input.lines.length &&
    state.previous.every((line, i) => line.id === input.lines[i]!.id);

  if (sameShape) {
    for (let i = 0; i < input.lines.length; i += 1) {
      const line = input.lines[i]!;
      if (lineShape(state.previous[i]!) === lineShape(line)) continue;
      writeLine(nodes[i] as HTMLElement, line);
    }
  } else {
    el.code.innerHTML = linesToHtml(input.lines);
  }
  state.previous = input.lines;

  if (el.path) el.path.textContent = input.path;
  if (el.illustration) el.illustration.hidden = !input.showIllustration;

  // Written only when they differ, for the same reason the tier and the blocker list are:
  // `[data-summary]` is `role="status"`, so an identical string written back is an
  // announcement of nothing.
  if (el.root.dataset.status !== input.verdict.status) el.root.dataset.status = input.verdict.status;
  setText(el.status, statusLine(input.verdict));
  setHtml(el.findings, findingsHtml(input.verdict));
  setText(el.summary, summaryText(input));

  if (changed.size === 0) return;
  // Lines now survive a repaint, so a line marked twice in quick succession would have its
  // highlight cleared by the FIRST timer. Each mark carries the generation that set it and only
  // that generation may clear it.
  const generation = String((state.generation += 1));
  const marked: HTMLElement[] = [];
  for (const id of changed) {
    const node = el.code.querySelector<HTMLElement>(`[data-id="${cssEscape(id)}"]`);
    if (!node) continue;
    node.dataset.changed = "true";
    node.dataset.changedGen = generation;
    marked.push(node);
  }
  window.setTimeout(() => {
    for (const node of marked) {
      if (node.dataset.changedGen !== generation) continue;
      delete node.dataset.changed;
      delete node.dataset.changedGen;
    }
  }, HIGHLIGHT_MS);
}

function setText(node: HTMLElement, value: string): void {
  if (node.textContent === value) return;
  node.textContent = value;
}

function setHtml(node: HTMLElement, value: string): void {
  if (node.innerHTML === value) return;
  node.innerHTML = value;
}

function cssEscape(value: string): string {
  const esc = (globalThis as { CSS?: { escape?: (s: string) => string } }).CSS?.escape;
  return esc ? esc(value) : value.replace(/["\\]/g, "\\$&");
}

/**
 * A short sentence for the polite live region.
 *
 * It counts APPLICATIONS and NAMED GROUPS, both of which the reader can count for themselves on
 * the screen in front of them. It does not count removed packages: that is a measurement from a
 * real build and we have not taken it, so the number is absent rather than invented (spec 4.4).
 */
function summaryText(input: PaintInput): string {
  const { apps, removedGroups, keptCapabilities } = input.summary;
  const bits = [
    `${apps} application${apps === 1 ? "" : "s"} kept`,
    `${removedGroups} group${removedGroups === 1 ? "" : "s"} named for removal`,
  ];
  if (keptCapabilities) bits.push(`${keptCapabilities} capabilit${keptCapabilities === 1 ? "y" : "ies"} kept`);
  return `${bits.join(", ")}.`;
}

/**
 * The findings, in the schema's own words.
 *
 * A refusal is rendered at full length. It is not truncated, not put behind a disclosure, and
 * not rewritten into something gentler: it is the moment a reader works out that the constraint
 * is load-bearing, and softening it throws that away.
 */
function findingsHtml(v: Verdict): string {
  if (v.status === "ready") return "";
  const blocks: string[] = [];

  for (const f of v.refusals) {
    blocks.push(
      `<div class="cfg-finding cfg-finding--refusal">` +
        `<p class="cfg-finding__flag">refused</p>` +
        `<h3 class="cfg-finding__title">${escapeText(f.title)}</h3>` +
        `<p class="cfg-finding__detail">${escapeText(f.detail)}</p>` +
        `<p class="cfg-finding__where">The validator rejects this at <code>${escapeText(f.where)}</code>. ` +
        `The same check runs in CI and again on the server before anything is written, so this is ` +
        `not a warning you can click past. It is the answer.</p>` +
        `</div>`,
    );
  }

  for (const f of v.conflicts) {
    blocks.push(
      `<div class="cfg-finding cfg-finding--conflict">` +
        `<p class="cfg-finding__flag">these two answers disagree</p>` +
        `<h3 class="cfg-finding__title">${escapeText(f.title)}</h3>` +
        `<p class="cfg-finding__detail">${escapeText(f.detail)}</p>` +
        `</div>`,
    );
  }

  if (v.invalid.length) {
    const items = v.invalid
      .map((f) => `<li><code>${escapeText(f.where)}</code> ${escapeText(f.message)}</li>`)
      .join("");
    blocks.push(
      `<div class="cfg-finding cfg-finding--invalid">` +
        `<p class="cfg-finding__flag">wrong shape</p><ul class="cfg-finding__list">${items}</ul></div>`,
    );
  }

  if (v.incomplete.length) {
    const items = v.incomplete
      .map((f) => `<li><code>${escapeText(f.field ?? f.where)}</code></li>`)
      .join("");
    blocks.push(
      `<div class="cfg-finding cfg-finding--incomplete">` +
        `<p class="cfg-finding__flag">not finished yet</p>` +
        `<p class="cfg-finding__detail">Still blank. Nothing is wrong; this is work not done.</p>` +
        `<ul class="cfg-finding__list">${items}</ul></div>`,
    );
  }

  return blocks.join("");
}
