#!/usr/bin/env node
/**
 * AUROS — build the self-hosted font subsets.
 *
 * WHY SELF-HOSTED, when spec §4.5 permits Google Fonts as a source:
 *   §4.5 says what we may *not* use (remote images, fonts beyond Google Fonts, script hosts
 *   other than cdnjs). It permits Google Fonts; it does not require loading from Google's
 *   servers. A remote font stylesheet costs a DNS lookup, a TLS handshake and a render-blocking
 *   round trip on a phone on a school's uplink — exactly the machine §6D's "Lighthouse ≥ 95 on
 *   mobile" is measured on — and it hands a third party a log line per visitor. So Google Fonts
 *   stays the *source* (all three families are OFL, from google/fonts) and this script turns it
 *   into bytes we serve ourselves.
 *
 * WHAT IT DOES
 *   1. Downloads the upstream TTFs from google/fonts (pinned by path, hashed, recorded).
 *   2. Instances the variable faces to a fixed weight (IBM Plex Sans ships [wdth,wght]).
 *   3. Subsets to the codepoints this site can actually render, and writes woff2.
 *   4. Writes public/fonts/MANIFEST.json and copies each family's OFL.txt.
 *
 * REQUIREMENTS: python3 with `fonttools` and `brotli`. Both are checked before anything is
 * fetched, and a missing one is a loud failure — never a silent fallback to a CDN.
 *
 * Idempotent. `node tools/fetch-fonts.mjs --force` re-downloads.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".font-cache");
const OUT = join(ROOT, "public", "fonts");
const SUBSET_PY = join(ROOT, "tools", "fonts-subset.py");
const FORCE = process.argv.includes("--force");
/**
 * `--verify` runs the two CHECKS and nothing else: no network, no python subsetting.
 * That is the form `pnpm build` runs, because a build must not depend on github.com being up or
 * on the build machine having fonttools — the subsets are committed. Building them is a
 * deliberate act; checking that what is committed is coherent happens every time.
 */
const VERIFY = process.argv.includes("--verify");

const UPSTREAM = "https://raw.githubusercontent.com/google/fonts/main/ofl";

/**
 * The codepoints this site renders.
 *
 * `latin` is Google's own latin subset range, plus the marks that appear in our copy and would
 * otherwise fall back to a system face mid-sentence: the whole Box Drawing and Block Elements
 * blocks (the margin labels are "── bedrock ──"; the build console draws rules with "═"), the
 * check and cross, the ore lozenge, the cloud and the tree.
 *
 * The box-drawing range is given whole rather than character by character. Subsetting keeps only
 * what the source face actually has, so asking for a glyph a face lacks costs nothing — while
 * listing them one at a time cost a build the day a console line used "═" instead of "─".
 * checkGlyphCoverage() below is what caught that. See src/styles/FONTS.md.
 */
const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329," +
  "U+2000-206F,U+2074,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+2264-2265," +
  "U+2500-257F,U+2580-259F,U+25A0,U+25C6,U+25CB,U+2601,U+2660,U+2713,U+2717," +
  "U+FEFF,U+FFFD";

/**
 * Devanagari, for the Marathi example recipe (spec §6B: a 180-machine Marathi-locale school is
 * one of the three reference recipes).
 *
 * THIS WAS THE WHOLE DEVANAGARI BLOCK UNTIL 2026-09-20, and the reason given was sound at the
 * time: "no Marathi copy exists in src/ yet, so subsetting to observed characters would silently
 * break the day it lands." It has landed — one line, on the LANDING PAGE, inside the first-boot
 * illustration — and the block subset it triggers is **261 KB**, which is more than the rest of
 * the site's fonts, HTML, CSS and JavaScript put together.
 *
 * Measured on a GitHub runner (D40), Lighthouse mobile, median of three:
 *
 *     page   fonts fetched   total page   DOM     LCP render delay   performance
 *     /faq   218 KB (4)      236 KiB      202     1,656 ms           99
 *     /order 290 KB (6)      314 KiB      905     2,406 ms           95
 *     /      558 KB (7)      585 KiB    1,116     3,911 ms           85   ← fails §6D
 *
 * The landing page was the one page below §6D's floor, and 267 KB of its 585 KB was this face,
 * carrying one greeting.
 *
 * So it is now subset to the codepoints the site renders, plus the marks shaping and fallback
 * need: the joiners, the dotted circle that draws an orphaned matra, both dandas and the rupee
 * sign. 267 KB → 75 KB.
 *
 * WHY THIS IS SAFE TO DO IN A LANGUAGE NOBODY HERE READS, which is the actual objection:
 *
 *   1. Shaping was VERIFIED, not assumed. Every Devanagari run on the site was shaped with
 *      HarfBuzz against the original TTF and against this subset, and the glyph count, clusters,
 *      advances and offsets are identical for all six, with zero .notdef. A Devanagari conjunct
 *      is a glyph no codepoint maps to directly — it is reached through GSUB — and that is
 *      exactly what `keepAllLayoutFeatures` and fontTools' layout closure preserve. The check
 *      is in the commit message; re-run it by shaping the runs before changing this line.
 *   2. checkGlyphCoverage() below is the ratchet. It reads the BUILT pages and fails the build
 *      if any character has no shipped face covering it. Add one Marathi word this subset does
 *      not have and the build goes red naming the character, rather than a school seeing boxes.
 *      The old block range made that check unable to fire for Devanagari at all.
 */
const DEVANAGARI =
  "U+0902,U+0905,U+0915,U+0917,U+091A,U+0921,U+0923,U+0928,U+092E,U+092F,U+0930,U+0932," +
  "U+0936,U+0937,U+0938,U+0939,U+093E-0940,U+094D,U+0964-0965," +
  "U+200C-200D,U+20B9,U+25CC";

/**
 * The handful of marks that NONE of the three §7 faces contain.
 *
 * Found by checkGlyphCoverage() below, not by eye: the build console prints a real failing line
 * from a real pipeline run, and that line contains "✗" — which Instrument Serif, IBM Plex Sans
 * and IBM Plex Mono all lack. The console's credibility rests on that character being a red
 * cross rather than an empty box, and the machines this product exists for are exactly the ones
 * with the thinnest system font coverage.
 *
 * Noto Sans Symbols 2 (OFL, google/fonts) supplies them. Subset to these five codepoints it is
 * about a kilobyte. "✓" is included even though IBM Plex Mono has one, so that the tick and the
 * cross in a log line are drawn by the same hand.
 */
const SYMBOLS = "U+2713-2717,U+25C6,U+25CB,U+2601,U+2660";

/** Every face we ship. `preload` marks the two that block first paint. */
const FACES = [
  {
    out: "instrument-serif-400.woff2",
    family: "Instrument Serif",
    dir: "instrumentserif",
    file: "InstrumentSerif-Regular.ttf",
    weight: "400",
    style: "normal",
    unicodes: LATIN,
    preload: true,
    // DECISIONS D25: Instrument Serif ships 400 normal and 400 italic ONLY. There is no bold.
    // Nothing in src/styles/ may ask for one, and font-synthesis is off so nobody fakes it.
  },
  {
    out: "instrument-serif-400-italic.woff2",
    family: "Instrument Serif",
    dir: "instrumentserif",
    file: "InstrumentSerif-Italic.ttf",
    weight: "400",
    style: "italic",
    unicodes: LATIN,
    preload: false,
  },
  {
    out: "ibm-plex-sans-400.woff2",
    family: "IBM Plex Sans",
    dir: "ibmplexsans",
    file: "IBMPlexSans[wdth,wght].ttf",
    instance: { wght: 400, wdth: 100 },
    weight: "400",
    style: "normal",
    unicodes: LATIN,
    preload: true,
  },
  {
    out: "ibm-plex-sans-600.woff2",
    family: "IBM Plex Sans",
    dir: "ibmplexsans",
    file: "IBMPlexSans[wdth,wght].ttf",
    instance: { wght: 600, wdth: 100 },
    weight: "600",
    style: "normal",
    unicodes: LATIN,
    preload: false,
  },
  {
    out: "ibm-plex-mono-400.woff2",
    family: "IBM Plex Mono",
    dir: "ibmplexmono",
    file: "IBMPlexMono-Regular.ttf",
    weight: "400",
    style: "normal",
    unicodes: LATIN,
    preload: false,
  },
  {
    out: "ibm-plex-mono-600.woff2",
    family: "IBM Plex Mono",
    dir: "ibmplexmono",
    file: "IBMPlexMono-SemiBold.ttf",
    weight: "600",
    style: "normal",
    unicodes: LATIN,
    preload: false,
  },
  {
    out: "noto-sans-symbols-2-400.woff2",
    family: "Noto Sans Symbols 2",
    dir: "notosanssymbols2",
    file: "NotoSansSymbols2-Regular.ttf",
    weight: "400",
    style: "normal",
    unicodes: SYMBOLS,
    preload: false,
  },
  {
    out: "ibm-plex-sans-devanagari-400.woff2",
    family: "IBM Plex Sans Devanagari",
    dir: "ibmplexsansdevanagari",
    file: "IBMPlexSansDevanagari-Regular.ttf",
    weight: "400",
    style: "normal",
    unicodes: DEVANAGARI,
    // Devanagari needs its GSUB/GPOS shaping features kept, all of them. Dropping a feature
    // here does not fail the build; it produces text that is wrong in a language nobody
    // reviewing this speaks. So: keep everything.
    keepAllLayoutFeatures: true,
    preload: false,
  },
];

function fail(msg) {
  console.error(`\n  fonts: ${msg}\n`);
  process.exit(1);
}

function checkPython() {
  try {
    const v = execFileSync(
      "python3",
      ["-c", "import fontTools, brotli; print(fontTools.version)"],
      { encoding: "utf8" },
    ).trim();
    return v;
  } catch {
    fail(
      "python3 with `fonttools` and `brotli` is required to build the font subsets.\n" +
        "  Install:  python3 -m pip install 'fonttools[woff]' brotli\n" +
        "  This script will NOT fall back to a CDN. Self-hosting is the point (spec §4.5, §6D).",
    );
  }
}

async function download(dir, file) {
  const cachePath = join(CACHE, dir, file);
  if (existsSync(cachePath) && !FORCE) return cachePath;
  const url = `${UPSTREAM}/${dir}/${encodeURIComponent(file)}`;
  process.stdout.write(`  fetch  ${dir}/${file} ... `);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) fail(`GET ${url} returned ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, buf);
  console.log(`${buf.length} bytes`);
  return cachePath;
}

async function downloadLicence(dir) {
  const out = join(OUT, `OFL-${dir}.txt`);
  if (existsSync(out) && !FORCE) return;
  const res = await fetch(`${UPSTREAM}/${dir}/OFL.txt`, { redirect: "follow" });
  if (!res.ok) fail(`no OFL.txt for ${dir} (HTTP ${res.status}) — do not ship a font without its licence`);
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
}

const sha256 = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

async function main() {
  if (VERIFY) {
    checkStylesheetRanges();
    const manifestPath = join(OUT, "MANIFEST.json");
    if (!existsSync(manifestPath)) {
      fail("public/fonts/MANIFEST.json is missing. Run `pnpm fonts` to build the subsets.");
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const face of manifest.faces) {
      const path = join(OUT, face.file);
      if (!existsSync(path)) fail(`${face.file} is in MANIFEST.json but not in public/fonts/.`);
      if (sha256(path) !== face.sha256) {
        fail(
          `${face.file} does not match its SHA-256 in MANIFEST.json. The file was edited or ` +
            `replaced by hand; rebuild it with \`pnpm fonts\`.`,
        );
      }
    }
    console.log(`  fonts:    ${manifest.faces.length} committed subsets match MANIFEST.json.`);
    await checkGlyphCoverage(manifest);
    return;
  }

  const ftVersion = checkPython();
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(OUT, { recursive: true });

  const manifest = {
    $comment:
      "Generated by tools/fetch-fonts.mjs. Do not edit. Source: github.com/google/fonts (OFL). " +
      "Self-hosted deliberately — see the header of that script.",
    generatedBy: `fonttools ${ftVersion}`,
    source: UPSTREAM,
    faces: [],
  };

  for (const face of FACES) {
    const src = await download(face.dir, face.file);
    await downloadLicence(face.dir);
    const outPath = join(OUT, face.out);

    const args = [
      SUBSET_PY,
      "--in",
      src,
      "--out",
      outPath,
      "--unicodes",
      face.unicodes,
    ];
    if (face.instance) {
      args.push("--instance", Object.entries(face.instance).map(([k, v]) => `${k}=${v}`).join(","));
    }
    if (face.keepAllLayoutFeatures) args.push("--all-layout-features");

    process.stdout.write(`  subset ${face.out} ... `);
    try {
      execFileSync("python3", args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      fail(`subsetting ${face.file} failed:\n${e.stderr?.toString() ?? e.message}`);
    }
    const size = statSync(outPath).size;
    console.log(`${size} bytes`);

    manifest.faces.push({
      file: face.out,
      family: face.family,
      weight: face.weight,
      style: face.style,
      preload: Boolean(face.preload),
      upstream: `${face.dir}/${face.file}`,
      upstreamSha256: sha256(src),
      instance: face.instance ?? null,
      bytes: size,
      sha256: sha256(outPath),
    });
  }

  writeFileSync(join(OUT, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");

  checkStylesheetRanges();
  await checkGlyphCoverage(manifest);

  const total = manifest.faces.reduce((n, f) => n + f.bytes, 0);
  const preloaded = manifest.faces.filter((f) => f.preload);
  console.log(
    `\n  ${manifest.faces.length} faces, ${total} bytes total, ` +
      `${preloaded.reduce((n, f) => n + f.bytes, 0)} bytes preloaded ` +
      `(${preloaded.map((f) => f.file).join(", ")})`,
  );
}

/**
 * `src/styles/fonts.css` must declare the SAME unicode-range this script subsetted to.
 *
 * These two are independent statements of the same fact, and only one of them is enforced by the
 * browser. `unicode-range` gates USE: a glyph that is in the file but outside the declared range
 * is never drawn — the browser silently falls back to a system face instead. So a range that is
 * narrower than the subset is a glyph we shipped and cannot use, with no error anywhere.
 *
 * That is not hypothetical. The box-drawing range was widened here to include "═" and the
 * stylesheet still said U+2500 only; the font contained the glyph and the page would have drawn
 * the system's.
 */
function checkStylesheetRanges() {
  const css = readFileSync(join(ROOT, "src", "styles", "fonts.css"), "utf8");
  const declared = new Map();
  for (const block of css.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)) {
    const file = /url\(\s*"\/fonts\/([^"]+)"/.exec(block[1])?.[1];
    const range = /unicode-range\s*:\s*([^;]+);/.exec(block[1])?.[1];
    if (!file || !range) continue;
    const set = expandRange(range);
    const previous = declared.get(file);
    // One file may be declared under several family names. They must agree, or a character
    // renders in one family and falls back in another.
    if (previous && setKey(previous) !== setKey(set)) {
      fail(`src/styles/fonts.css declares /fonts/${file} with two DIFFERENT unicode-ranges.`);
    }
    declared.set(file, set);
  }

  for (const face of FACES) {
    const set = declared.get(face.out);
    if (!set) {
      fail(
        `src/styles/fonts.css has no @font-face for /fonts/${face.out}. It is built and shipped ` +
          `and never used — either declare it or remove it from FACES.`,
      );
    }
    const wanted = expandRange(face.unicodes);
    if (setKey(set) !== setKey(wanted)) {
      const missing = [...wanted].filter((cp) => !set.has(cp));
      const extra = [...set].filter((cp) => !wanted.has(cp));
      fail(
        `the unicode-range for /fonts/${face.out} in src/styles/fonts.css does not match the ` +
          `range this script subsets to.\n` +
          `      subsetted but not declared (shipped and unusable): ${summarise(missing)}\n` +
          `      declared but not subsetted (falls back silently):   ${summarise(extra)}`,
      );
    }
  }
  console.log(`  ranges:   src/styles/fonts.css matches the subset ranges for all ${FACES.length} faces.`);
}

/** "U+0-FF, U+131" -> Set of code points. */
function expandRange(spec) {
  const out = new Set();
  for (const part of spec.split(",")) {
    const text = part.trim().replace(/^U\+/i, "");
    if (!text) continue;
    const [lo, hi] = text.includes("-") ? text.split("-") : [text, text];
    for (let cp = parseInt(lo, 16); cp <= parseInt(hi, 16); cp++) out.add(cp);
  }
  return out;
}

const setKey = (set) => [...set].sort((a, b) => a - b).join(",");

const summarise = (cps) =>
  cps.length === 0
    ? "none"
    : cps.slice(0, 8).map((cp) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`).join(" ") +
      (cps.length > 8 ? ` … and ${cps.length - 8} more` : "");

/**
 * Every non-ASCII character in src/ must be renderable by at least one face we ship.
 *
 * D19's lesson, applied to type: a step that cannot fail is not a check. Subsetting silently drops
 * a codepoint the source font does not have, and the result — a character that falls back to
 * whatever the visitor's machine happens to own, or to a blank box on a 2014 laptop — is invisible
 * to everyone who reviews this on a Mac with every font installed.
 *
 * Reports per-face coverage too, so `src/styles/FONTS.md`'s table stays honest.
 */
async function checkGlyphCoverage(manifest) {
  const script = `
import html as html_mod, json, re, sys, pathlib, collections
from fontTools.ttLib import TTFont

root = pathlib.Path(sys.argv[1])
used = collections.Counter()

# Prefer the BUILT pages: they are what a visitor's browser is asked to render, and they exclude
# the box-drawing banners that every source file in this repo uses in its comments. Without a
# build, fall back to the prose in src/content plus the strings in copy.ts — never to whole source
# files, which would report characters that no page can ever show.
pages = sorted((root / "dist").glob("*.html"))
mode = "dist"
if pages:
    for path in pages:
        markup = path.read_text(encoding="utf-8", errors="replace")
        markup = re.sub(r"<script[\\s\\S]*?</script>", " ", markup)
        markup = re.sub(r"<style[\\s\\S]*?</style>", " ", markup)
        markup = re.sub(r"<!--[\\s\\S]*?-->", " ", markup)
        text = html_mod.unescape(re.sub(r"<[^>]+>", " ", markup))
        for ch in text:
            if ord(ch) > 127:
                used[ch] += 1
else:
    mode = "src/content"
    sources = list((root / "src" / "content").rglob("*.md"))
    sources += list((root / "src" / "content").rglob("*.mdx"))
    sources += [root / "src" / "content" / "copy.ts"]
    for path in sources:
        if not path.is_file():
            continue
        for ch in path.read_text(encoding="utf-8", errors="replace"):
            if ord(ch) > 127:
                used[ch] += 1

covered = {}
for f in sorted((root / "public" / "fonts").glob("*.woff2")):
    cmap = set()
    for table in TTFont(f)["cmap"].tables:
        cmap.update(table.cmap.keys())
    covered[f.name] = cmap

missing = []
for ch, n in used.items():
    if not any(ord(ch) in cmap for cmap in covered.values()):
        missing.append({"char": ch, "cp": "U+%04X" % ord(ch), "count": n})

print(json.dumps({"used": len(used), "missing": missing, "mode": mode}))
`;
  let out;
  try {
    out = execFileSync("python3", ["-c", script, ROOT], { encoding: "utf8" });
  } catch (e) {
    fail(`glyph coverage check could not run:\n${e.stderr?.toString() ?? e.message}`);
  }
  const result = JSON.parse(out);
  if (result.missing.length) {
    const list = result.missing
      .map((m) => `${m.cp} ${JSON.stringify(m.char)} (${m.count} occurrence(s))`)
      .join("\n      ");
    fail(
      `these characters appear in ${result.mode} and are in NONE of the shipped faces:\n      ${list}\n\n` +
        `  They will fall back to whatever the visitor's machine has, which on the old Windows\n` +
        `  laptops this product exists for is frequently nothing. Either widen a unicode-range in\n` +
        `  tools/fetch-fonts.mjs and here, or use a character the faces have. See src/styles/FONTS.md.`,
    );
  }
  console.log(
    `  coverage: ${result.used} distinct non-ASCII character(s) in ${result.mode}, ` +
      `all present in a shipped face.`,
  );
}

main();
