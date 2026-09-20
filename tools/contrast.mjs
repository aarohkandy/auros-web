#!/usr/bin/env node
/**
 * CONTRAST — spec §7: "WCAG AA contrast on every text/panel pair, verified not assumed."
 *
 * The word that makes this a tool rather than a table is *verified*. So this script does not hold a
 * hand-written list of pairs and it does not hold a single hex value of its own. It:
 *
 *   1. reads `src/styles/tokens.css` and resolves every custom property, per theme, through as many
 *      `var()` hops as it takes, into a concrete colour;
 *   2. reads every stylesheet the site has — `src/styles/*.css` and the `<style>` block of every
 *      `.astro` component and page — and records which declaration sets which colour on which
 *      selector;
 *   3. works out the pairs the site ACTUALLY produces. When a build exists in `dist/`, it does that
 *      the only way that is true: it parses the built HTML, matches the real selectors against the
 *      real elements, resolves the cascade, and measures the text colour against the background of
 *      the nearest ancestor that actually paints one. When there is no build, it falls back to the
 *      pairs the stylesheets DECLARE, says so in the output, and does not pretend the two are the
 *      same kind of evidence;
 *   4. computes the WCAG 2.x contrast ratio for each pair and fails the run on
 *        - body text        < 4.5:1
 *        - large text       < 3:1   (>= 24px, or >= 18.66px at weight >= 700)
 *        - non-text marks   < 3:1   (borders, rules, focus rings — WCAG 1.4.11)
 *
 * Usage:  node tools/contrast.mjs [--write] [--verbose]
 *   --write    also write the measured table to src/styles/a11y-audit.md
 * Exit 0 clean · 1 findings · 2 could not run (also a failure — it fails closed, like the other gates).
 *
 * Honest limits, stated because a tool that overstates its own reach is the same defect it is
 * looking for:
 *   - It reads the site's own CSS. It does not run a browser, so it does not see UA styles, it does
 *     not do layout, and it cannot know that an element is visually covered by another.
 *   - The selector matcher covers what this site's CSS uses: tags, classes, ids, attribute presence
 *     and value, descendant and child combinators, and `:global(...)`. A selector it cannot parse is
 *     REPORTED as unmeasured rather than skipped silently.
 *   - `font-size: clamp(a, b, c)` is measured at `a`, the smallest value, because the smallest text
 *     is the one that has to clear the higher threshold.
 *   - Alpha is composited onto the backdrop it is drawn over. `color-mix()` and gradients are not
 *     resolved; they are reported as unmeasured, and §7 forbids gradients anyway.
 */

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, relative, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, ".."); // auros-web/, wherever the script is called from
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");
const TOKENS = join(SRC, "styles", "tokens.css");
const AUDIT_OUT = join(SRC, "styles", "a11y-audit.md");

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const VERBOSE = args.includes("--verbose");
/** `--note "..."` adds one provenance line to the written audit. For saying where a build came from. */
const NOTE = (() => {
  const i = args.indexOf("--note");
  return i !== -1 && args[i + 1] ? args[i + 1] : "";
})();

const THRESH = { body: 4.5, large: 3.0, nonText: 3.0 };

/**
 * WCAG 1.4.11 (non-text contrast) governs user-interface components and graphics needed to
 * understand content. A purely decorative border is exempt by the success criterion's own words.
 * So a mark on an interactive element, and any focus indicator, must clear 3:1 or this run fails;
 * a decorative mark is measured and printed but does not fail the build. Measuring it and then
 * failing on it would train people to ignore this tool, which costs more than the rule buys.
 */
const INTERACTIVE_TAGS = new Set(["a", "button", "input", "select", "textarea", "summary", "label", "output"]);
function markIsGoverned({ tag, prop, selector }) {
  if (/outline/.test(prop) || /:focus/.test(selector ?? "")) return true;
  if (tag && INTERACTIVE_TAGS.has(tag)) return true;
  if (!tag && /(^|[\s>(.#])(a|button|input|select|textarea|summary|label|output)\b/.test(selector ?? "")) return true;
  return false;
}

/* ── colour ─────────────────────────────────────────────────────────────────────────────────── */

const INHERITED_KEYWORDS = new Set(["inherit", "currentcolor", "unset", "initial", "revert", "none", "auto"]);

function parseColor(raw) {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  let m = /^#([0-9a-f]{3,8})$/.exec(v);
  if (m) {
    const h = m[1];
    const ex = (s) => parseInt(s.length === 1 ? s + s : s, 16);
    if (h.length === 3 || h.length === 4)
      return { r: ex(h[0]), g: ex(h[1]), b: ex(h[2]), a: h.length === 4 ? ex(h[3]) / 255 : 1 };
    if (h.length === 6 || h.length === 8)
      return {
        r: ex(h.slice(0, 2)), g: ex(h.slice(2, 4)), b: ex(h.slice(4, 6)),
        a: h.length === 8 ? ex(h.slice(6, 8)) / 255 : 1,
      };
    return null;
  }
  m = /^rgba?\(([^)]+)\)$/.exec(v);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const n = (s) => (s.endsWith("%") ? (parseFloat(s) / 100) * 255 : parseFloat(s));
    const a = parts[3] === undefined ? 1 : parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    return { r: n(parts[0]), g: n(parts[1]), b: n(parts[2]), a };
  }
  return null; // named colours, color-mix(), gradients: unmeasured on purpose
}

const channel = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const luminance = ({ r, g, b }) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** Composite a possibly-translucent colour over an opaque backdrop. */
function over(fg, bg) {
  if (fg.a >= 1) return fg;
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

function ratio(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const hex = ({ r, g, b }) =>
  "#" + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");

/* ── css parsing ────────────────────────────────────────────────────────────────────────────── */

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * A deliberately small CSS reader. It walks the text tracking brace depth, so an at-rule's contents
 * are read with the at-rule's condition attached rather than flattened away.
 */
function parseCss(css, origin) {
  const rules = [];
  const text = stripComments(css);
  let i = 0;
  const stack = []; // open at-rule conditions

  while (i < text.length) {
    const open = text.indexOf("{", i);
    if (open === -1) break;
    const close = text.indexOf("}", i);
    if (close !== -1 && close < open) {
      stack.pop();
      i = close + 1;
      continue;
    }
    const prelude = text.slice(i, open).trim();
    if (prelude.startsWith("@")) {
      stack.push(prelude);
      i = open + 1;
      continue;
    }
    // A normal rule: find its matching close brace.
    let depth = 1;
    let j = open + 1;
    while (j < text.length && depth > 0) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}") depth--;
      j++;
    }
    const body = text.slice(open + 1, j - 1);
    const decls = {};
    const important = new Set();
    for (const part of body.split(";")) {
      const idx = part.indexOf(":");
      if (idx === -1) continue;
      const prop = part.slice(0, idx).trim().toLowerCase();
      let value = part.slice(idx + 1).trim();
      if (/!important\s*$/i.test(value)) {
        value = value.replace(/\s*!\s*important\s*$/i, "").trim();
        important.add(prop);
      }
      if (prop && value) decls[prop] = value;
    }
    for (const selector of prelude.split(",")) {
      const s = selector.trim();
      if (s) rules.push({ selector: s, decls, important, at: [...stack], origin, order: rules.length });
    }
    i = j;
  }
  return rules;
}

/** Every stylesheet the site has: real .css files plus the <style> block of every .astro file. */
function collectStyleSources(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".git", "dist", ".astro"].includes(entry)) continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      collectStyleSources(p, out);
      continue;
    }
    const ext = extname(p);
    if (ext === ".css") out.push({ file: p, css: readFileSync(p, "utf8") });
    else if (ext === ".astro") {
      const text = readFileSync(p, "utf8");
      for (const m of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
        out.push({ file: p, css: m[1] });
      }
    }
  }
  return out;
}

/* ── tokens ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * Build one variable map per theme from the token file. Light is `:root`. Dark is `:root` plus the
 * declarations under `[data-theme="dark"]` and under the `prefers-color-scheme: dark` media query —
 * which is exactly how a browser resolves them.
 */
function readThemes(tokenRules) {
  const light = new Map();
  const dark = new Map();
  for (const rule of tokenRules) {
    const inDarkMedia = rule.at.some((a) => /prefers-color-scheme\s*:\s*dark/i.test(a));
    const isRoot = /^:root(?!\[)/.test(rule.selector) || rule.selector === ":root";
    const isDarkAttr = /\[data-theme\s*=\s*["']?dark["']?\]/.test(rule.selector);
    // `:root:not([data-theme="light"])` is a DARK rule guarded against a manual light override, not
    // a light rule. Strip every :not(...) before asking whether the selector targets light, or the
    // guard reads as its own opposite and the dark palette leaks into the light theme.
    const positive = rule.selector.replace(/:not\([^)]*\)/g, "");
    const isLightGuard = /\[data-theme\s*=\s*["']?light["']?\]/.test(positive);
    for (const [prop, value] of Object.entries(rule.decls)) {
      if (!prop.startsWith("--")) continue;
      if (inDarkMedia && !isLightGuard) dark.set(prop, value);
      else if (isDarkAttr) dark.set(prop, value);
      else if (isRoot) {
        light.set(prop, value);
        if (!dark.has(prop)) dark.set(prop, value);
      }
    }
  }
  // A dark override declared after a light-only value must win; re-apply in file order.
  for (const rule of tokenRules) {
    const inDarkMedia = rule.at.some((a) => /prefers-color-scheme\s*:\s*dark/i.test(a));
    const isDarkAttr = /\[data-theme\s*=\s*["']?dark["']?\]/.test(rule.selector);
    if (!inDarkMedia && !isDarkAttr) continue;
    for (const [prop, value] of Object.entries(rule.decls)) {
      if (prop.startsWith("--")) dark.set(prop, value);
    }
  }
  return { light, dark };
}

/** Resolve a value through var() hops, using a theme's map and the literal fallbacks in the call. */
function resolveValue(value, vars, depth = 0) {
  if (depth > 12 || !value) return value;
  const m = /var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([\s\S]+?)\s*)?\)/i.exec(value);
  if (!m) return value.trim();
  const [full, name, fallback] = m;
  let replacement;
  if (vars.has(name)) replacement = vars.get(name);
  else if (fallback !== undefined) replacement = fallback;
  else return null;
  const next = value.replace(full, replacement);
  return resolveValue(next, vars, depth + 1);
}

function resolveColor(value, vars) {
  const resolved = resolveValue(value, vars);
  if (resolved === null) return null;
  return parseColor(resolved);
}

/* ── font size / weight ─────────────────────────────────────────────────────────────────────── */

const ROOT_PX = 16;

function toPx(value) {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  const clamp = /^clamp\(\s*([^,]+),/.exec(v);
  if (clamp) return toPx(clamp[1]); // smallest value: the worst case for the large-text threshold
  let m = /^(-?[\d.]+)rem$/.exec(v);
  if (m) return parseFloat(m[1]) * ROOT_PX;
  m = /^(-?[\d.]+)em$/.exec(v);
  if (m) return parseFloat(m[1]) * ROOT_PX; // approximation, flagged in the audit's limits
  m = /^(-?[\d.]+)px$/.exec(v);
  if (m) return parseFloat(m[1]);
  return null;
}

function isLarge(px, weight) {
  if (px === null) return false;
  if (px >= 24) return true;
  return px >= 18.66 && Number(weight) >= 700;
}

/* ── selector matching (the subset this site's CSS uses) ────────────────────────────────────── */

const PSEUDO_STATE = /:(hover|focus|focus-visible|focus-within|active|visited|target)\b/;

function parseCompound(text) {
  const out = { tag: null, id: null, classes: [], attrs: [], unsupported: false };
  let rest = text;
  // Astro's default scoping wraps the component hash in `:where([data-astro-cid-…])`. Dropping the
  // pseudo-class WITH its contents throws that constraint away, and then one component's `.line`
  // rule matches another component's `.line` — which is exactly the false failure the first run of
  // this tool produced against Shiki's code-block spans. So `:where()` and `:is()` contribute their
  // contents to the compound, and `:not()` is dropped (conservatively widening, never narrowing).
  rest = rest.replace(/:(?:where|is)\(([^)]*)\)/g, (_m, inner) => inner.split(",")[0]);
  rest = rest.replace(/:not\([^)]*\)/g, "");
  rest = rest.replace(/::?[a-z-]+(\([^)]*\))?/g, (match) => {
    if (/^::?(before|after|first-line|first-letter|hover|focus|focus-visible|focus-within|active|visited|last-child|first-child|not|is|where|has|target)\b/.test(match)) return "";
    out.unsupported = true;
    return "";
  });
  for (const m of rest.matchAll(/\[([a-z0-9_-]+)(?:([~^$*|]?=)"?([^\]"]*)"?)?\]/gi)) {
    out.attrs.push({ name: m[1].toLowerCase(), op: m[2], value: m[3] });
  }
  rest = rest.replace(/\[[^\]]*\]/g, "");
  for (const m of rest.matchAll(/\.([a-z0-9_-]+)/gi)) out.classes.push(m[1]);
  const idm = /#([a-z0-9_-]+)/i.exec(rest);
  if (idm) out.id = idm[1];
  rest = rest.replace(/[.#][a-z0-9_-]+/gi, "");
  const tag = rest.trim();
  if (tag && tag !== "*") {
    if (/^[a-z][a-z0-9-]*$/i.test(tag)) out.tag = tag.toLowerCase();
    else out.unsupported = true;
  }
  return out;
}

function parseSelector(selector) {
  const cleaned = selector
    .replace(/:global\(([^)]*)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned === ":root") return { unsupported: false, parts: [{ tag: "html", id: null, classes: [], attrs: [], combinator: " " }], state: false, pseudoElement: false };
  const parts = [];
  let combinator = " ";
  for (const chunk of cleaned.replace(/([>+~])/g, " $1 ").split(" ")) {
    if (chunk === ">" || chunk === "+" || chunk === "~") {
      combinator = chunk;
      continue;
    }
    if (!chunk) continue;
    const compound = parseCompound(chunk);
    parts.push({ ...compound, combinator });
    combinator = " ";
  }
  const unsupported = parts.some((p) => p.unsupported) || parts.length === 0;
  return { unsupported, parts, state: PSEUDO_STATE.test(selector), pseudoElement: /::(before|after)/.test(selector) };
}

function specificity(selector) {
  const ids = (selector.match(/#[a-z0-9_-]+/gi) || []).length;
  const classes =
    (selector.match(/\.[a-z0-9_-]+/gi) || []).length +
    (selector.match(/\[[^\]]*\]/g) || []).length +
    (selector.match(/:(?!:)[a-z-]+/gi) || []).length;
  const tags = (selector.replace(/[.#][a-z0-9_-]+|\[[^\]]*\]|::?[a-z-]+(\([^)]*\))?/gi, "").match(/[a-z][a-z0-9-]*/gi) || []).length;
  return ids * 10000 + classes * 100 + tags;
}

function matchesCompound(el, part) {
  if (part.tag && el.tag !== part.tag) return false;
  if (part.id && el.attrs.id !== part.id) return false;
  for (const cls of part.classes) if (!el.classes.includes(cls)) return false;
  for (const attr of part.attrs) {
    const have = el.attrs[attr.name];
    if (have === undefined) return false;
    if (attr.op === "=" && have !== attr.value) return false;
  }
  return true;
}

function matches(el, parsed) {
  if (parsed.unsupported) return false;
  const parts = parsed.parts;
  if (!matchesCompound(el, parts[parts.length - 1])) return false;
  let idx = parts.length - 2;
  let node = el.parent;
  let combinator = parts[parts.length - 1].combinator;
  let sibling = el;
  while (idx >= 0) {
    if (combinator === "+" || combinator === "~") {
      const siblings = sibling.parent ? sibling.parent.children : [];
      const at = siblings.indexOf(sibling);
      let found = null;
      if (combinator === "+") {
        const prev = siblings[at - 1];
        if (prev && matchesCompound(prev, parts[idx])) found = prev;
      } else {
        for (let k = at - 1; k >= 0; k--) {
          if (matchesCompound(siblings[k], parts[idx])) { found = siblings[k]; break; }
        }
      }
      if (!found) return false;
      combinator = parts[idx].combinator;
      sibling = found;
      node = found.parent;
      idx--;
      continue;
    }
    if (combinator === ">") {
      if (!node || !matchesCompound(node, parts[idx])) return false;
      combinator = parts[idx].combinator;
      node = node.parent;
      idx--;
    } else {
      let found = null;
      let walker = node;
      while (walker) {
        if (matchesCompound(walker, parts[idx])) {
          found = walker;
          break;
        }
        walker = walker.parent;
      }
      if (!found) return false;
      combinator = parts[idx].combinator;
      node = found.parent;
      idx--;
    }
  }
  return true;
}

/* ── html parsing (built pages) ─────────────────────────────────────────────────────────────── */

const VOID = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);

function parseHtml(html) {
  const root = { tag: "#root", attrs: {}, classes: [], children: [], parent: null, text: "" };
  let current = root;
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s">]+))?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[0].startsWith("<!--")) continue;
    const [, closing, tagName, attrText, selfClose, textChunk] = m;
    if (textChunk !== undefined) {
      if (textChunk.trim()) current.text += textChunk.trim() + " ";
      continue;
    }
    const tag = tagName.toLowerCase();
    if (closing) {
      let node = current;
      while (node && node.tag !== tag) node = node.parent;
      if (node && node.parent) current = node.parent;
      continue;
    }
    const attrs = {};
    for (const a of (attrText || "").matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+)))?/g)) {
      attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? "";
    }
    const node = {
      tag,
      attrs,
      classes: (attrs.class || "").split(/\s+/).filter(Boolean),
      children: [],
      parent: current,
      text: "",
    };
    current.children.push(node);
    if (tag === "script" || tag === "style") {
      // Skip their contents wholesale: they are not painted text.
      const end = html.indexOf(`</${tag}`, re.lastIndex);
      if (end !== -1) re.lastIndex = end;
      continue;
    }
    if (!VOID.has(tag) && !selfClose) current = node;
  }
  return root;
}

function* walk(node) {
  for (const child of node.children) {
    yield child;
    yield* walk(child);
  }
}

/* ── the measurement ────────────────────────────────────────────────────────────────────────── */

const styleSources = collectStyleSources(SRC);
if (styleSources.length === 0) {
  console.error("contrast: found no stylesheets under src/ — refusing to report a pass on an empty scan");
  process.exit(2);
}
if (!existsSync(TOKENS)) {
  console.error(`contrast: ${relative(ROOT, TOKENS)} is missing. The tokens are the input to this tool; without them there is nothing measured, so this is a failure rather than a skip.`);
  process.exit(2);
}

const allRules = [];
for (const source of styleSources) {
  for (const rule of parseCss(source.css, relative(ROOT, source.file))) allRules.push(rule);
}
const tokenRules = parseCss(readFileSync(TOKENS, "utf8"), relative(ROOT, TOKENS));
const themes = readThemes(tokenRules);

const unmeasured = [];
const findings = [];
const measurements = [];
const seen = new Set();

function record(row) {
  const key = [row.theme, row.page, row.selector, row.kind, row.fg, row.bg].join("|");
  if (seen.has(key)) return;
  seen.add(key);
  measurements.push(row);
  if (row.value < row.required) findings.push(row);
}

/** Colour-bearing declarations we understand, and whether each one is text or a non-text mark. */
const COLOR_PROPS = [
  ["color", "text"],
  ["background-color", "surface"],
  ["background", "surface"],
  ["border-color", "mark"],
  ["border-top-color", "mark"],
  ["border-left-color", "mark"],
  ["border-right-color", "mark"],
  ["border-bottom-color", "mark"],
  ["outline-color", "mark"],
  ["text-decoration-color", "mark"],
];

/** Pull a colour out of a shorthand like `1px solid var(--rule)` or `2px solid #be3a12`. */
function colorFromShorthand(value, vars) {
  const direct = resolveColor(value, vars);
  if (direct) return direct;
  const resolved = resolveValue(value, vars);
  if (!resolved) return null;
  const m = /(#[0-9a-f]{3,8}|rgba?\([^)]*\)|transparent)/i.exec(resolved);
  return m ? parseColor(m[1]) : null;
}

const SHORTHAND = [
  ["border", "mark"],
  ["border-left", "mark"],
  ["border-top", "mark"],
  ["border-right", "mark"],
  ["border-bottom", "mark"],
  ["outline", "mark"],
];

function declaredColors(decls, vars) {
  const out = [];
  for (const [prop, kind] of COLOR_PROPS) {
    if (!(prop in decls)) continue;
    const parsed = prop === "background" ? colorFromShorthand(decls[prop], vars) : resolveColor(decls[prop], vars);
    if (parsed) out.push({ prop, kind, color: parsed });
    else out.push({ prop, kind, color: null, raw: decls[prop] });
  }
  for (const [prop, kind] of SHORTHAND) {
    if (!(prop in decls)) continue;
    const parsed = colorFromShorthand(decls[prop], vars);
    if (parsed) out.push({ prop, kind, color: parsed });
  }
  return out;
}

const themeNames = [["light", themes.light], ["dark", themes.dark]];

/* ---- Mode A: the built pages, when there are any ---- */

function distPages() {
  if (!existsSync(DIST)) return [];
  const pages = [];
  const walkDir = (dir) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const st = statSync(p);
      if (st.isDirectory()) walkDir(p);
      else if (extname(p) === ".html") pages.push(p);
    }
  };
  walkDir(DIST);
  return pages;
}

function measureBuiltPage(file, vars, themeName) {
  const html = readFileSync(file, "utf8");
  const page = "/" + relative(DIST, file).replace(/index\.html$/, "").replace(/\\/g, "/");
  const root = parseHtml(html);

  // The page's own <style> blocks are part of the cascade for this page.
  const pageRules = [...allRules];
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    for (const rule of parseCss(m[1], page)) pageRules.push(rule);
  }

  const prepared = pageRules.map((rule, index) => ({
    ...rule,
    parsed: parseSelector(rule.selector),
    spec: specificity(rule.selector),
    index,
  }));

  for (const rule of prepared) {
    if (!rule.parsed.unsupported) continue;
    const touchesColor = Object.keys(rule.decls).some((p) => /color|background|border|outline/.test(p));
    if (touchesColor) unmeasured.push({ why: "selector not supported by the matcher", selector: rule.selector, origin: rule.origin });
  }

  const elements = [...walk(root)];
  const computed = new Map();

  const computeFor = (el) => {
    if (computed.has(el)) return computed.get(el);
    const own = { color: null, background: null, marks: [], fontSize: null, fontWeight: null, state: [] };
    const applicable = prepared
      .filter((rule) => matches(el, rule.parsed))
      .sort((a, b) => a.spec - b.spec || a.index - b.index);
    // The style attribute wins over every non-!important rule, so it is applied last. Shiki writes
    // code-block colours there; a tool that skipped it would measure a pair that is never painted.
    const inlineDecls = {};
    if (el.attrs.style) {
      for (const part of el.attrs.style.split(";")) {
        const idx = part.indexOf(":");
        if (idx === -1) continue;
        inlineDecls[part.slice(0, idx).trim().toLowerCase()] = part.slice(idx + 1).trim();
      }
    }
    const importantDecls = {};
    for (const rule of applicable) {
      for (const prop of rule.important ?? []) importantDecls[prop] = rule.decls[prop];
    }
    const cascade = [
      ...applicable,
      ...(Object.keys(inlineDecls).length ? [{ decls: inlineDecls, parsed: { state: false }, selector: "[style]", origin: page }] : []),
      ...(Object.keys(importantDecls).length ? [{ decls: importantDecls, parsed: { state: false }, selector: "!important", origin: page }] : []),
    ];
    for (const rule of cascade) {
      const vals = declaredColors(rule.decls, vars);
      for (const v of vals) {
        if (!v.color) {
          if (!INHERITED_KEYWORDS.has((v.raw ?? "").trim().toLowerCase()))
            unmeasured.push({ why: `could not resolve ${v.prop}: ${v.raw}`, selector: rule.selector, origin: rule.origin });
          continue;
        }
        if (rule.parsed.state) {
          own.state.push({ ...v, selector: rule.selector, origin: rule.origin });
          continue;
        }
        if (v.kind === "surface") own.background = v.color;
        else if (v.kind === "text") own.color = v.color;
        else own.marks.push({ ...v, selector: rule.selector, origin: rule.origin });
      }
      if (rule.parsed.state) continue;
      if (rule.decls["font-size"]) own.fontSize = toPx(resolveValue(rule.decls["font-size"], vars));
      if (rule.decls["font-weight"]) own.fontWeight = resolveValue(rule.decls["font-weight"], vars);
      if (rule.decls["font"]) {
        const fm = /(\d+(?:\.\d+)?(?:px|rem|em))/.exec(resolveValue(rule.decls["font"], vars) || "");
        if (fm) own.fontSize = toPx(fm[1]);
      }
    }
    const parent = el.parent && el.parent.tag !== "#root" ? computeFor(el.parent) : null;
    const resolvedStyle = {
      color: own.color ?? parent?.color ?? null,
      background: own.background,
      effectiveBackground: null,
      marks: own.marks,
      state: own.state,
      fontSize: own.fontSize ?? parent?.fontSize ?? ROOT_PX,
      fontWeight: own.fontWeight ?? parent?.fontWeight ?? 400,
      el,
    };
    let backdrop = parent?.effectiveBackground ?? null;
    if (own.background) {
      resolvedStyle.effectiveBackground = own.background.a >= 1 || !backdrop ? own.background : over(own.background, backdrop);
    } else {
      resolvedStyle.effectiveBackground = backdrop;
    }
    computed.set(el, resolvedStyle);
    return resolvedStyle;
  };

  for (const el of elements) {
    const style = computeFor(el);
    const hasText = el.text.trim().length > 0;
    const selectorName =
      el.tag + (el.attrs.id ? `#${el.attrs.id}` : "") + (el.classes.length ? "." + el.classes.join(".") : "");

    if (hasText && style.color) {
      const bg = style.effectiveBackground;
      if (!bg) {
        unmeasured.push({ why: "text with no painted background anywhere above it", selector: selectorName, origin: page });
      } else {
        const fg = over(style.color, bg);
        const large = isLarge(style.fontSize, style.fontWeight);
        record({
          theme: themeName, page, selector: selectorName, kind: large ? "large text" : "body text",
          fg: hex(fg), bg: hex(bg), value: ratio(fg, bg), required: large ? THRESH.large : THRESH.body,
          detail: `${Math.round(style.fontSize)}px/${style.fontWeight}`, source: "built page",
        });
      }
    }

    for (const mark of [...style.marks, ...style.state.filter((s) => s.kind === "mark")]) {
      const bg = style.effectiveBackground ?? computeFor(el.parent ?? el)?.effectiveBackground;
      if (!bg || mark.color.a === 0) continue;
      const fg = over(mark.color, bg);
      const governed = markIsGoverned({ tag: el.tag, prop: mark.prop, selector: mark.selector });
      record({
        theme: themeName, page, selector: `${selectorName} (${mark.prop})`,
        kind: governed ? "non-text mark" : "decorative mark",
        fg: hex(fg), bg: hex(bg), value: ratio(fg, bg),
        required: governed ? THRESH.nonText : 0,
        reference: THRESH.nonText,
        detail: mark.prop, source: "built page",
      });
    }
  }
}

/* ---- Mode B: what the stylesheets declare, when there is no build ---- */

function measureDeclared(vars, themeName) {
  const surfaces = new Map();
  for (const name of ["--panel", "--panel-2", "--panel-deep", "--page-bg"]) {
    const c = resolveColor(`var(${name})`, vars);
    if (c) surfaces.set(name, c);
  }
  for (const rule of allRules) {
    const vals = declaredColors(rule.decls, vars);
    const ownSurface = vals.find((v) => v.kind === "surface" && v.color)?.color ?? null;
    for (const v of vals) {
      if (!v.color) {
        if (v.raw && !INHERITED_KEYWORDS.has(v.raw.trim().toLowerCase()))
          unmeasured.push({ why: `could not resolve ${v.prop}: ${v.raw}`, selector: rule.selector, origin: rule.origin });
        continue;
      }
      if (v.kind === "surface") continue;
      const fontPx = toPx(resolveValue(rule.decls["font-size"] ?? "", vars)) ?? ROOT_PX;
      const weight = resolveValue(rule.decls["font-weight"] ?? "400", vars);
      const large = v.kind === "text" && isLarge(fontPx, weight);
      const backdrops = ownSurface ? [["declared in the same rule", ownSurface]] : [...surfaces.entries()];
      for (const [label, bg] of backdrops) {
        const fg = over(v.color, bg);
        const governed = v.kind !== "text" && markIsGoverned({ prop: v.prop, selector: rule.selector });
        const kind = v.kind === "text" ? (large ? "large text" : "body text") : governed ? "non-text mark" : "decorative mark";
        record({
          theme: themeName, page: "—", selector: `${rule.selector} (${v.prop})`,
          kind,
          fg: hex(fg), bg: hex(bg), value: ratio(fg, bg),
          required: v.kind === "text" ? (large ? THRESH.large : THRESH.body) : governed ? THRESH.nonText : 0,
          reference: THRESH.nonText,
          detail: `${rule.origin} · backdrop ${label}`, source: "declared",
        });
      }
    }
  }
}

const built = distPages();
const mode = built.length > 0 ? "built page" : "declared";
for (const [themeName, vars] of themeNames) {
  if (built.length > 0) for (const file of built) measureBuiltPage(file, vars, themeName);
  else measureDeclared(vars, themeName);
}

/* ── output ─────────────────────────────────────────────────────────────────────────────────── */

measurements.sort((a, b) => a.value - b.value);
const worst = measurements.slice(0, 40);
const fmt = (n) => n.toFixed(2);

function table(rows) {
  const head = "| theme | page | where | kind | text | panel | ratio | needs | verdict |\n|---|---|---|---|---|---|---|---|---|";
  const body = rows
    .map(
      (r) =>
        `| ${r.theme} | \`${r.page}\` | \`${r.selector}\` | ${r.kind} | \`${r.fg}\` | \`${r.bg}\` | **${fmt(r.value)}:1** | ${r.required > 0 ? `${fmt(r.required)}:1` : `— (${fmt(r.reference ?? THRESH.nonText)}:1 for reference)`} | ${r.value >= r.required ? "pass" : "**FAIL**"} |`,
    )
    .join("\n");
  return `${head}\n${body}`;
}

if (WRITE) {
  const uniqueUnmeasured = [...new Map(unmeasured.map((u) => [`${u.why}|${u.selector}`, u])).values()];
  const md = `# Contrast audit — measured, not asserted

Generated by \`node tools/contrast.mjs --write\`. **Do not hand-edit**: the next run overwrites it.

Spec §7 requires "WCAG AA contrast on every text/panel pair, verified not assumed". Every number
below was computed from \`src/styles/tokens.css\` and the site's own stylesheets. This file holds no
colour that was typed into it by a person.

- Pairs measured: **${measurements.length}** (${themeNames.length} themes)
- Failing: **${findings.length}**
- Evidence: **${mode === "built page" ? `the built pages in dist/ — ${built.length} page(s), real elements, real cascade` : "the stylesheets' declared pairs; there was no build in dist/ when this ran, so these are pairs the CSS can produce rather than pairs a page was observed to produce"}**
- Measured from: \`${ROOT}\` (${mode === "built page" ? "a real build of these sources" : "sources only"})
${NOTE ? `- Note: ${NOTE}\n` : ""}- Thresholds: body text ${THRESH.body}:1 · large text ${THRESH.large}:1 (≥24px, or ≥18.66px at weight ≥700) · non-text marks ${THRESH.nonText}:1

## Every failing pair

${findings.length === 0 ? "None." : table(findings)}

## The ${worst.length} tightest passing pairs

${table(worst.filter((r) => r.value >= r.required))}

## What this tool could not measure

${uniqueUnmeasured.length === 0 ? "Nothing — every colour-bearing declaration resolved." : uniqueUnmeasured.map((u) => `- ${u.why} — \`${u.selector}\` (${u.origin})`).join("\n")}

## Limits of the method

- It reads this repository's CSS. It does not run a browser, so there is no layout, no user-agent
  stylesheet, and no knowledge of one element covering another.
- \`clamp()\` is measured at its smallest value, which is the value that has to clear the higher bar.
- \`em\` font sizes are approximated at the 16px root rather than resolved through their ancestors.
- Terrain drawn to the \`<canvas>\` is not measured and cannot be: it is pixels, not CSS. The site is
  built so that no reading text is ever drawn over it — every block of text sits on an opaque panel
  (§7) — which is what makes this tool's coverage equal to the site's text rather than most of it.
`;
  writeFileSync(AUDIT_OUT, md);
}

const header = `contrast: ${measurements.length} pair(s) measured from ${mode === "built page" ? `${built.length} built page(s)` : "declared styles (no dist/ — run a build for page-level evidence)"}, ${themeNames.length} themes.`;

if (VERBOSE) console.log(table(worst));

if (findings.length === 0) {
  console.log(header);
  if (unmeasured.length) console.log(`contrast: ${new Set(unmeasured.map((u) => u.why + u.selector)).size} declaration(s) could not be resolved; they are listed in the audit.`);
  if (WRITE) console.log(`contrast: wrote ${relative(ROOT, AUDIT_OUT)}`);
  process.exit(0);
}

console.error(`\n${header}`);
console.error(`contrast: ${findings.length} pair(s) below the WCAG AA threshold.\n`);
console.error(table(findings));
console.error("\nFix the token or the pairing. Do not lower a threshold; AA is the floor, not a target.\n");
if (WRITE) console.error(`contrast: wrote ${relative(ROOT, AUDIT_OUT)}`);
process.exit(1);
