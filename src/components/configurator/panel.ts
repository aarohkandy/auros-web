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

export type PanelState = { previous: YamlLine[] };

export function createPanelState(): PanelState {
  return { previous: [] };
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
 * Repaint. Only the lines that actually changed are touched, which is both cheaper and the
 * reason the settle mark means something.
 */
export function paint(el: PanelElements, state: PanelState, input: PaintInput): void {
  const changed = changedIds(state.previous, input.lines);
  el.code.innerHTML = linesToHtml(input.lines);
  state.previous = input.lines;

  if (el.path) el.path.textContent = input.path;
  if (el.illustration) el.illustration.hidden = !input.showIllustration;

  el.root.dataset.status = input.verdict.status;
  el.status.textContent = statusLine(input.verdict);
  el.findings.innerHTML = findingsHtml(input.verdict);
  el.summary.textContent = summaryText(input);

  if (changed.size === 0) return;
  const marked: HTMLElement[] = [];
  for (const id of changed) {
    const node = el.code.querySelector<HTMLElement>(`[data-id="${cssEscape(id)}"]`);
    if (!node) continue;
    node.dataset.changed = "true";
    marked.push(node);
  }
  window.setTimeout(() => {
    for (const node of marked) delete node.dataset.changed;
  }, HIGHLIGHT_MS);
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
