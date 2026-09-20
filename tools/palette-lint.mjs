#!/usr/bin/env node
/**
 * AUROS — palette lint.
 *
 * §7 caps the terrain palette at 18 colours and then lists 19. The resolution is recorded in the
 * header of src/styles/tokens.css. This script is what stops that record becoming a comment that
 * used to be true.
 *
 * src/terrain/render.ts asked for exactly this, in its own header:
 *   "TODO once tokens.css lands: have tools/contrast.mjs — or a sibling check — read both and
 *    fail the build on divergence."
 * This is the sibling check.
 *
 * It fails when:
 *   1. the --terrain-* tokens in tokens.css and the LIGHT table in render.ts are not the same set
 *   2. the light palette has more than 18 distinct values, or more than PALETTE_SIZE slots
 *   3. --terrain-star is not exactly --terrain-sky-0 (the freed slot must stay free)
 *   4. the dark table drops one of §7's four literal dark-theme requirements
 *   5. the counts WRITTEN IN THE COMMENT in tokens.css no longer match the tokens under it
 *   6. it cannot parse either file in the shape it expects — an unreadable check is a failed one
 *
 * Usage:  node tools/palette-lint.mjs [--verbose]
 * Exit 0 clean · 1 findings · 2 could not run. It fails closed, like the other gates.
 */
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOKENS = join(ROOT, "src", "styles", "tokens.css");
const RENDER = join(ROOT, "src", "terrain", "render.ts");
const STRATA = join(ROOT, "src", "terrain", "strata.ts");
const VERBOSE = process.argv.includes("--verbose");

/** §7. The number this whole file exists to hold. */
const CAP = 18;

const findings = [];
const note = (m) => findings.push(m);
const rel = (p) => relative(ROOT, p);

function bail(msg) {
  console.error(`\n  palette-lint: cannot run — ${msg}\n`);
  process.exit(2);
}

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (e) {
    bail(`${rel(path)} could not be read (${e.code ?? e.message})`);
  }
}

/* ---------------------------------------------------------------------------------------------
   tokens.css — the --terrain-* group, as declared in :root (the light theme).
--------------------------------------------------------------------------------------------- */
function terrainTokens(css) {
  // Only :root, not the dark overrides: the cap is stated for the light palette, and the dark
  // one is derived (see below). Take everything up to the DARK THEME banner.
  const cut = css.indexOf("DARK THEME");
  const head = cut === -1 ? css : css.slice(0, cut);
  const stripped = head.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = new Map();
  const re = /(--terrain-[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g;
  let m;
  while ((m = re.exec(stripped))) out.set(m[1], m[2].toLowerCase());
  if (out.size === 0) bail(`${rel(TOKENS)} declares no --terrain-* tokens`);
  return out;
}

/** The counts the tokens.css header comment claims, so the prose can be checked against the code. */
function claimedCounts(css) {
  const light = css.match(/TERRAIN PALETTE, LIGHT\s*—\s*(\d+)\s+distinct values in\s+(\d+)\s+slots/);
  if (!light) {
    bail(
      `the header of ${rel(TOKENS)} no longer states the light palette count in the form ` +
        `"TERRAIN PALETTE, LIGHT — N distinct values in M slots". Either restore it or delete ` +
        `this check; a count nobody can read is a count nobody is keeping.`,
    );
  }
  return { distinct: Number(light[1]), slots: Number(light[2]) };
}

/* ---------------------------------------------------------------------------------------------
   render.ts — the LIGHT and DARK tables.
--------------------------------------------------------------------------------------------- */
function paletteTable(ts, name) {
  const re = new RegExp(`const ${name}\\s*:\\s*readonly string\\[\\]\\s*=\\s*\\[([\\s\\S]*?)\\n\\];`);
  const m = ts.match(re);
  if (!m) {
    bail(
      `could not find \`const ${name}: readonly string[] = [ ... ]\` in ${rel(RENDER)}. ` +
        `The table's shape changed; this lint must be updated to match it rather than skipped.`,
    );
  }
  const body = m[1];
  const entries = [];
  for (const raw of body.split("\n")) {
    const line = raw.replace(/\/\/.*$/, "").trim().replace(/,$/, "");
    if (!line) continue;
    const literal = line.match(/^"(#[0-9a-fA-F]{6})"$/);
    if (literal) {
      entries.push({ kind: "literal", hex: literal[1].toLowerCase() });
      continue;
    }
    const derived = line.match(/^darken\(\s*"(#[0-9a-fA-F]{6})"\s*,\s*([A-Z_][A-Z0-9_]*)\s*\)$/);
    if (derived) {
      entries.push({ kind: "derived", from: derived[1].toLowerCase(), factor: derived[2] });
      continue;
    }
    bail(
      `${rel(RENDER)}: cannot read palette entry \`${line}\` in ${name}. This lint understands a ` +
        `hex literal and \`darken("#hex", CONST)\` and nothing else. A new form means the palette ` +
        `grew a mechanism, which is exactly when someone should look at it.`,
    );
  }
  return entries;
}

function constantValue(ts, name) {
  const m = ts.match(new RegExp(`const ${name}\\s*=\\s*([0-9.]+)\\s*;`));
  if (!m) bail(`${rel(RENDER)} does not define \`const ${name} = <number>;\``);
  return Number(m[1]);
}

/** The same multiply render.ts documents. Duplicated on purpose, and guarded: see below. */
function darken(hex, factor) {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.min(255, Math.round(v * factor)))
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${ch.join("")}`;
}

function paletteSize(ts) {
  const m = ts.match(/PALETTE_SIZE\s*=\s*(\d+)/);
  if (!m) bail(`${rel(STRATA)} does not define \`PALETTE_SIZE = <number>\``);
  return Number(m[1]);
}

/* --------------------------------------------------------------------------------------------- */
const tokensCss = read(TOKENS);
const renderTs = read(RENDER);
const strataTs = read(STRATA);

const tokens = terrainTokens(tokensCss);
const claimed = claimedCounts(tokensCss);
const size = paletteSize(strataTs);

const light = paletteTable(renderTs, "LIGHT");
const dark = paletteTable(renderTs, "DARK");

/* --- 2. slot and distinct counts ------------------------------------------------------------ */
if (light.some((e) => e.kind !== "literal")) {
  note(`${rel(RENDER)}: the LIGHT palette contains a derived entry. Light is §7's list, verbatim.`);
}
if (light.length !== size) {
  note(`${rel(RENDER)}: LIGHT has ${light.length} slots, PALETTE_SIZE is ${size}.`);
}
if (light.length > CAP) {
  note(`${rel(RENDER)}: LIGHT has ${light.length} slots; §7 caps the palette at ${CAP}.`);
}

const lightDistinct = new Set(light.filter((e) => e.kind === "literal").map((e) => e.hex));
if (lightDistinct.size > CAP) {
  note(
    `the light terrain palette has ${lightDistinct.size} distinct colours; §7 caps it at ${CAP}. ` +
      `Cut one, and record which in the header of ${rel(TOKENS)}.`,
  );
}

/* --- 1. tokens.css and render.ts must be the same set --------------------------------------- */
const tokenSet = new Set(tokens.values());
const onlyInRender = [...lightDistinct].filter((h) => !tokenSet.has(h));
const onlyInTokens = [...tokenSet].filter((h) => !lightDistinct.has(h));

if (onlyInRender.length) {
  note(
    `the terrain paints colours that ${rel(TOKENS)} does not declare: ${onlyInRender.join(", ")}. ` +
      `The panels and the picture would visibly disagree.`,
  );
}
if (onlyInTokens.length) {
  const names = onlyInTokens.map(
    (h) => `${h} (${[...tokens].filter(([, v]) => v === h).map(([k]) => k).join(", ")})`,
  );
  note(
    `${rel(TOKENS)} declares --terrain-* colours the renderer never paints: ${names.join(", ")}. ` +
      `A terrain token that is not in the terrain is either a colour to delete or a palette that ` +
      `has drifted.`,
  );
}

/* --- 3. the freed slot stays freed ----------------------------------------------------------- */
const star = tokens.get("--terrain-star");
const sky0 = tokens.get("--terrain-sky-0");
if (star && sky0 && star !== sky0) {
  note(
    `--terrain-star is ${star} and --terrain-sky-0 is ${sky0}. In light theme the star slot must ` +
      `be exactly the zenith sky, so it costs no colour; otherwise the palette is ${lightDistinct.size + 1}.`,
  );
}

/* --- 5. the comment's arithmetic ------------------------------------------------------------- */
if (claimed.distinct !== lightDistinct.size) {
  note(
    `the header of ${rel(TOKENS)} says the light terrain palette has ${claimed.distinct} distinct ` +
      `values; it has ${lightDistinct.size}. Fix the number, not the reader's expectation.`,
  );
}
if (claimed.slots !== light.length) {
  note(
    `the header of ${rel(TOKENS)} says ${claimed.slots} slots; ${rel(RENDER)} has ${light.length}.`,
  );
}

/* --- 4. §7's four literal dark-theme requirements -------------------------------------------- */
const night = constantValue(renderTs, "NIGHT");
const darkHexes = dark.map((e) => (e.kind === "literal" ? e.hex : darken(e.from, night)));
const darkDistinct = new Set(darkHexes);

for (const required of ["#171c24", "#1e242c"]) {
  if (!darkDistinct.has(required)) {
    note(`§7 gives the dark sky as ${required.toUpperCase()}; the DARK table does not contain it.`);
  }
}
// §7: "ore stays." Both ore tones must survive the night unchanged.
for (const ore of ["#be3a12", "#d9682e"]) {
  if (!darkDistinct.has(ore)) {
    note(`§7 says "ore stays"; ${ore.toUpperCase()} is not in the DARK table unchanged.`);
  }
}
if (darkDistinct.size > CAP) {
  note(`the dark terrain palette has ${darkDistinct.size} distinct colours; §7 caps it at ${CAP}.`);
}

/* --------------------------------------------------------------------------------------------- */
if (VERBOSE) {
  console.log(`  light palette : ${lightDistinct.size} distinct in ${light.length} slots`);
  console.log(`  dark  palette : ${darkDistinct.size} distinct in ${dark.length} slots (NIGHT=${night})`);
  console.log(`  tokens.css    : ${tokens.size} --terrain-* tokens, ${tokenSet.size} distinct`);
  console.log(`  ${[...lightDistinct].sort().join(" ")}`);
}

if (findings.length) {
  console.error(`\n  palette-lint: ${findings.length} finding(s)\n`);
  for (const f of findings) console.error(`    - ${f}`);
  console.error(
    `\n  §7 is fixed and is not open to reinterpretation. Change the palette to match the rule,\n` +
      `  or change the rule in docs/SPEC.md with a human's decision recorded in DECISIONS.md.\n`,
  );
  process.exit(1);
}

console.log(
  `  palette-lint: light ${lightDistinct.size}/${CAP} distinct in ${light.length} slots, ` +
    `dark ${darkDistinct.size}/${CAP}; tokens.css and src/terrain/render.ts agree.`,
);
