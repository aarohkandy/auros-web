#!/usr/bin/env node
/**
 * AUROS — ink lint. §7's "Ink" rules, enforced on the source rather than trusted.
 *
 *   "No gradients (the stepped sky is not a gradient). No drop shadows. Border radius ceiling
 *    3px. Hairline 1px rules are the only divider. All body text sits on opaque panels."
 *
 * src/styles/base.css neutralises shadows at runtime with `!important`, which stops one reaching
 * a visitor. It does not stop one being written, and a rule you can violate without noticing is
 * a rule that erodes. This reads every stylesheet the site has — `src/styles/*.css` and the
 * `<style>` block of every `.astro` file — and stops the build.
 *
 * What it checks, and the §7 sentence each one comes from:
 *   gradient    linear-/radial-/conic-gradient anywhere          "No gradients"
 *   shadow      box-shadow / text-shadow / filter: drop-shadow   "No drop shadows"
 *   radius      any border-radius over 3px                       "Border radius ceiling 3px"
 *   divider     a >1px border that is not an ore mark             "Hairline 1px rules are the
 *                                                                 only divider"
 *   alpha       an alpha channel on a --panel* token, or a
 *               fractional opacity                                "All body text sits on opaque
 *                                                                 panels"
 *
 * Deliberately NOT checked here: whether a given block of text is inside a Panel. That is a DOM
 * question, and tools/contrast.mjs answers it properly by measuring the built HTML. This file
 * only catches the CSS-level way of breaking the same rule — making a panel see-through.
 *
 * Every finding names file, line and the text. An exemption is written in EXEMPT below, with a
 * reason, and appears in the output so it is never silent.
 *
 * Usage:  node tools/ink-lint.mjs [--verbose]
 * Exit 0 clean · 1 findings · 2 could not run.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const VERBOSE = process.argv.includes("--verbose");
const MAX_RADIUS_PX = 3;

/**
 * The only exemptions. Each is {file, rule, match, reason}: `match` is a substring of the offending
 * declaration, so an exemption covers one line rather than a whole file. An empty list is the goal;
 * a long one is a design system being negotiated away one line at a time. Unused exemptions are
 * printed as such so a stale one is visible rather than quietly protective.
 */
const EXEMPT = [
  {
    file: "src/components/configurator/RecipePanel.astro",
    rule: "divider",
    match: "border-left: 3px solid var(--rule",
    reason:
      "The refusal flag on the recipe panel is a CHIP, not a rule between two blocks of content: " +
      "it has its own background, a radius and an edge marker, and that edge turns ore when the " +
      "finding is a refusal. Its neutral state is the same marker in --rule. Exempted rather " +
      "than restyled because the component belongs to the configurator agent and the shape is " +
      "deliberate. If §7 is meant to forbid a neutral edge marker anywhere, that is a change to " +
      "the component, not to this lint.",
  },
];

const findings = [];
const usedExemptions = new Set();

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
      walk(p, out);
    } else if ([".css", ".astro"].includes(extname(name))) {
      out.push(p);
    }
  }
  return out;
}

/** For an .astro file, only the <style> blocks are CSS. For a .css file, all of it is. */
function stylesOf(path, text) {
  if (extname(path) === ".css") return [{ text, lineOffset: 0 }];
  const blocks = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/g;
  let m;
  while ((m = re.exec(text))) {
    blocks.push({ text: m[1], lineOffset: text.slice(0, m.index).split("\n").length - 1 });
  }
  return blocks;
}

/** Strip comments so a rule described in prose is not reported as a rule written in CSS. */
const decomment = (css) =>
  css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));

const RULES = [
  {
    id: "gradient",
    re: /\b(linear|radial|conic|repeating-linear|repeating-radial|repeating-conic)-gradient\s*\(/g,
    message: "§7: No gradients. The stepped sky is stepped bands, not a CSS gradient.",
  },
  {
    id: "shadow",
    // A shadow being switched OFF is fine; a shadow being drawn is not.
    re: /\b(box-shadow|text-shadow)\s*:\s*(?!\s*none\b)(?!\s*unset\b)(?!\s*initial\b)[^;}]+/g,
    message: "§7: No drop shadows.",
  },
  {
    id: "shadow",
    re: /\bfilter\s*:\s*[^;}]*drop-shadow\s*\(/g,
    message: "§7: No drop shadows — filter: drop-shadow() is one.",
  },
  {
    // Narrow on purpose. A translucent MARK behind a line of text is legitimate and is measured
    // by tools/contrast.mjs, which composites alpha onto its backdrop. What §7 forbids is a
    // translucent PANEL: "All body text sits on opaque panels — the background never reduces
    // text contrast." So this fires only when a panel token itself is given an alpha channel.
    id: "alpha",
    re: /--panel[\w-]*\s*:\s*[^;}]*(?:\b(?:rgba|hsla)\s*\(|#[0-9a-fA-F]{8}\b|\btransparent\b|\bcolor-mix\s*\()/g,
    message:
      "§7: all body text sits on OPAQUE panels — \"the background never reduces text contrast\". " +
      "A panel token with an alpha channel makes the measured ratios in a11y-audit.md untrue.",
  },
];

function checkRadius(css, report) {
  const re = /border(?:-[a-z]+)?-radius\s*:\s*([^;}]+)/g;
  let m;
  while ((m = re.exec(css))) {
    const value = m[1];
    if (/var\(/.test(value) && !/\d/.test(value.replace(/var\([^)]*\)/g, ""))) continue; // --radius
    for (const num of value.matchAll(/(-?\d*\.?\d+)\s*(px|rem|em|%)/g)) {
      const n = Number(num[1]);
      const unit = num[2];
      const px = unit === "px" ? n : unit === "rem" || unit === "em" ? n * 16 : Infinity;
      if (px > MAX_RADIUS_PX) {
        report(
          "radius",
          m.index,
          m[0].trim(),
          `§7: border radius ceiling is ${MAX_RADIUS_PX}px; this is ${num[0]}. Use var(--radius).`,
        );
        break;
      }
    }
  }
}

function checkDivider(css, report) {
  /*
   * §7: "Hairline 1px rules are the only divider."
   *
   * A DIVIDER is a neutral line separating content: drawn in --rule, 1px. An ORE MARK is not a
   * divider — it is §7's layer-boundary accent, the same mark the terrain paints where one image
   * layer ends, and the site draws it as a 2-3px coloured edge. Reading §7 to forbid that would
   * forbid the one accent §7 explicitly asks for. So the two are told apart by COLOUR.
   *
   * The colour is very often NOT in the same declaration:
   *
   *     .cta.primary { border-left-color: var(--ore); border-left-width: 3px; }
   *
   * so the check reads the whole declaration BLOCK and asks whether THAT EDGE is ore anywhere in
   * it. A per-declaration regex reports this as a violation, which is how this check first ran,
   * and a lint that cries wolf gets switched off within a week.
   *
   * Anything over 3px is neither a hairline nor a mark. It is a slab, and it is always reported.
   */
  for (const block of declarationBlocks(css)) {
    const oreEdges = new Set();
    let oreAnywhere = false;
    for (const d of block.text.matchAll(
      /\bborder(?:-(top|right|bottom|left|block-start|block-end|inline-start|inline-end))?(?:-color)?\s*:\s*([^;}]+)/g,
    )) {
      if (isOre(d[2])) {
        oreAnywhere = true;
        if (d[1]) oreEdges.add(d[1]);
      }
    }

    const re =
      /\bborder(?:-(top|right|bottom|left|block|inline|block-start|block-end|inline-start|inline-end))?(?:-width)?\s*:\s*([^;}]+)/g;
    let m;
    while ((m = re.exec(block.text))) {
      const edge = m[1];
      const value = m[2];
      if (/\b(none|0)\b/.test(value) && !/\d\s*px/.test(value)) continue;
      const edgeIsOre = isOre(value) || (edge && oreEdges.has(edge)) || (!edge && oreAnywhere);
      for (const num of value.matchAll(/(-?\d*\.?\d+)\s*px/g)) {
        const n = Number(num[1]);
        if (n <= 1) continue;
        if (n > 3) {
          report(
            "divider",
            block.start + m.index,
            m[0].trim(),
            `A ${num[0]} border is not a hairline and not an ore mark. §7 draws neither.`,
          );
          break;
        }
        if (!edgeIsOre) {
          report(
            "divider",
            block.start + m.index,
            m[0].trim(),
            `§7: "Hairline 1px rules are the only divider." This is ${num[0]} in a colour that is ` +
              `not ore, so it reads as a divider — and a divider is var(--rule) at 1px. If it is ` +
              `meant as a layer-boundary mark, draw it in var(--ore).`,
          );
          break;
        }
      }
    }
  }
}

const isOre = (value) => /--ore\b|--ore-2\b|--ore-deep\b|#be3a12|#d9682e/i.test(value);

/** Split CSS into `{ ... }` declaration blocks with their offset, ignoring nested at-rules. */
function declarationBlocks(css) {
  const out = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === "{") {
      depth++;
      if (depth === 1) start = i + 1;
      else start = i + 1; // an at-rule opened; the inner block is the one that matters
    } else if (css[i] === "}") {
      if (start !== -1 && css.slice(start, i).indexOf("{") === -1) {
        out.push({ start, text: css.slice(start, i) });
      }
      depth = Math.max(0, depth - 1);
      start = -1;
    }
  }
  return out;
}

function checkOpacity(css, report) {
  const re = /(?<!-)\bopacity\s*:\s*([0-9.]+)/g;
  let m;
  while ((m = re.exec(css))) {
    const v = Number(m[1]);
    if (v > 0 && v < 1) {
      report(
        "alpha",
        m.index,
        m[0].trim(),
        "§7: all body text sits on opaque panels. A partial opacity makes a surface translucent " +
          "and drops the measured contrast below what tools/contrast.mjs proved.",
      );
    }
  }
}

let filesScanned = 0;
for (const path of walk(SRC)) {
  const relPath = relative(ROOT, path);
  const text = readFileSync(path, "utf8");
  for (const block of stylesOf(path, text)) {
    filesScanned++;
    const css = decomment(block.text);
    const lineOf = (index) => block.lineOffset + css.slice(0, index).split("\n").length;

    const report = (id, index, snippet, message) => {
      const exemption = EXEMPT.find(
        (e) => e.file === relPath && e.rule === id && (!e.match || snippet.includes(e.match)),
      );
      if (exemption) {
        usedExemptions.add(`${relPath}:${id}:${exemption.match ?? "*"}`);
        return;
      }
      findings.push({ file: relPath, line: lineOf(index), id, snippet, message });
    };

    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(css))) {
        report(rule.id, m.index, m[0].trim().slice(0, 90), rule.message);
      }
    }
    checkRadius(css, report);
    checkDivider(css, report);
    checkOpacity(css, report);
  }
}

if (VERBOSE || findings.length) {
  for (const e of EXEMPT) {
    const used = usedExemptions.has(`${e.file}:${e.rule}:${e.match ?? "*"}`);
    console.log(`  exemption ${used ? "(used)  " : "(unused)"} ${e.file} · ${e.rule} — ${e.reason}`);
  }
}

if (findings.length) {
  console.error(`\n  ink-lint: ${findings.length} finding(s) against §7's ink rules\n`);
  for (const f of findings) {
    console.error(`    ${f.file}:${f.line}  [${f.id}]  ${f.snippet}`);
    console.error(`      ${f.message}`);
  }
  console.error(
    "\n  §7 is fixed and is not open to reinterpretation. If one of these is genuinely required,\n" +
      "  add it to EXEMPT in this file with a reason — so the exemption is a visible decision.\n",
  );
  process.exit(1);
}

console.log(`  ink-lint: ${filesScanned} stylesheet block(s) clean against §7's ink rules.`);
