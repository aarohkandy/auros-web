# Fonts

Spec §7 fixes three typefaces and the reason for them:

> Display: **Instrument Serif**. UI: **IBM Plex Sans**. Anything factual — specs, prices, config,
> logs: **IBM Plex Mono**. The collision of editorial serif against 16-bit terrain is the whole
> identity. **Do not "harmonise" them by making the type pixelated too** — that collapses it into a
> game landing page.

All three are SIL Open Font License. They are **self-hosted**, as subset `woff2` files in
`public/fonts/`, built by `node tools/fetch-fonts.mjs` from `github.com/google/fonts`.

---

## Why self-hosted, when §4.5 permits Google Fonts

§4.5 is a list of things the site may **not** use — remote images, fonts beyond Google Fonts, a
script host other than cdnjs. It permits Google Fonts as a source. It does not require loading them
from Google's servers, and there are three reasons not to:

1. **It costs Lighthouse points**, and §6D sets a hard floor of **≥ 95 on mobile**. A remote
   stylesheet is a DNS lookup, a TLS handshake and a render-blocking round trip *before* the browser
   even learns which font files it needs — then a second round trip to another origin to fetch them.
   Self-hosted, the `@font-face` rules arrive in the page's own CSS and the two critical faces are
   already preloading from the same connection.
2. **It is a third party on every page load.** The customer here is a school. Handing a log line
   per visitor to another company, on a site whose argument is that we are replaceable and that
   nothing phones home, is a small contradiction we do not need to make.
3. **It is one fewer thing that can be down.** The site is static and served from one origin. A
   remote font host is a second origin that can fail, be blocked by a school firewall, or be slow
   on the connection our customers actually have.

`tools/fetch-fonts.mjs` **will not fall back to a CDN**. If the build machine lacks `python3` with
`fonttools` and `brotli`, it fails loudly and says what to install.

---

## What ships

Eight faces, 606,532 bytes on disk in total. `unicode-range` means a page downloads only the
faces it has characters for: **103,024 bytes** are preloaded and the rest arrive only on demand.
These figures are copied from `public/fonts/MANIFEST.json`, which the build writes; if they
disagree with it, the manifest is right.

| File | Family | Weight | Bytes | Preloaded |
| --- | --- | --- | --- | --- |
| `instrument-serif-400.woff2` | Instrument Serif | 400 | 48,136 | **yes** |
| `instrument-serif-400-italic.woff2` | Instrument Serif | 400 italic | 50,404 | no |
| `ibm-plex-sans-400.woff2` | IBM Plex Sans | 400 | 54,888 | **yes** |
| `ibm-plex-sans-600.woff2` | IBM Plex Sans | 600 | 54,864 | no |
| `ibm-plex-mono-400.woff2` | IBM Plex Mono | 400 | 60,024 | no |
| `ibm-plex-mono-600.woff2` | IBM Plex Mono | 600 | 63,340 | no |
| `noto-sans-symbols-2-400.woff2` | Noto Sans Symbols 2 | 400 | 7,348 | no |
| `ibm-plex-sans-devanagari-400.woff2` | IBM Plex Sans Devanagari | 400 | 267,528 | no |

Exact bytes and the SHA-256 of every file, plus the SHA-256 of the upstream TTF each was cut from,
are in `public/fonts/MANIFEST.json`. Each family's `OFL.txt` ships beside them.

**Only two faces are preloaded**, and that restraint is the point: preloading a face the first
screen does not use is a request competing with one it does. The Devanagari face in particular must
stay lazy — it is 261 KB, larger than everything else combined.

**Measured, and it corrects an earlier claim in this file.** The landing page *does* fetch the
Devanagari face, because `copy.ts` prints the Marathi school's real first-boot message
(`नमस्कार! काही अडचण असल्यास शिक्षकांना सांगा.`). That is `unicode-range` working: the face is
fetched where Devanagari is rendered and nowhere else. "An English reader never downloads it" was
written here before anyone opened a browser, and it was wrong.

---

## Instrument Serif has no bold

DECISIONS **D25**, from upstream research: *"Instrument Serif ships 400 normal and 400 italic only
— there is no bold. Any design calling for a bold display weight has to be redrawn, not faked with
synthetic bold."*

Two things enforce that:

- `--weight-display: 400` in `tokens.css`, and every heading rule uses it.
- `font-synthesis: none` on `body` in `base.css`, so a browser asked for a weight the face does not
  have draws the weight it does have rather than smearing the outlines.

If a heading needs more presence, it gets more size or more space. It does not get more weight.

---

## Subsetting

Two ranges, both declared in `fonts.css` as `unicode-range`:

**Latin** — Google's own `latin` subset range, plus the whole Box Drawing and Block Elements
blocks and a handful of named marks (`✓ ✗ ◆ ○ ☁ ♠ → ← ≥ ≤`).

The box-drawing blocks are requested **whole** rather than character by character, and that is a
correction. They were originally listed one codepoint at a time, from an inventory of `src/`; the
inventory found `─` U+2500 and not `═` U+2550, and the build console draws a rule with `═`. The
coverage check below is what caught it. Subsetting keeps only what the source face actually has,
so asking for a glyph a face lacks costs nothing — while listing them individually costs a build
the first time someone types a different line character.

The box-drawing rule is the most common non-ASCII character on the site, because it is what draws <!-- auros-allow: a count over this repository's own files, produced by the coverage tool printed above. Not a claim about machines, customers or the world. -->
the margin labels: `── bedrock ──`.

**Devanagari** — the Devanagari block, the joiners shaping needs, Devanagari Extended, the rupee
sign and the dotted circle. Subset **by range, not by text**: there is no Marathi copy in `src/`
yet, so subsetting to observed characters would produce a font that silently breaks on the day the
Marathi reference recipe (§6B) lands. All GSUB/GPOS features are retained for this face — dropping
a shaping feature does not fail a build, it produces text that is wrong in a language nobody
reviewing it reads.

### Measured coverage, including what is missing

Read out of the shipped `woff2` files, not off a specimen page:

| Character | Instrument Serif | IBM Plex Sans | IBM Plex Mono |
| --- | --- | --- | --- |
| `─` U+2500 box rule | absent | absent | **present** |
| `═` U+2550 double rule | absent | absent | **present** |
| `█` U+2588 block | absent | absent | **present** |
| `✓` U+2713 check | absent | **present** | **present** |
| `✗` U+2717 cross | absent | absent | absent → **Noto Sans Symbols 2** |
| `◆` U+25C6 lozenge | absent | absent | absent → **Noto Sans Symbols 2** |
| `§ — · × … − →` | present | present | present |

Three consequences, stated rather than discovered later:

1. **The margin labels and the build console must stay mono.** They are the only place the rules
   and blocks appear, and IBM Plex Mono is the only one of the three faces that has them. That is
   already how `StratumLabel.astro` and `BuildConsole.astro` are written; this is why it has to
   stay that way.
2. **`✗` (U+2717) is in none of the three §7 faces, and the site prints one.** The build console
   streams a real failing line from a real pipeline run, and that line contains `✗`. §6D's whole
   argument for the console is that a red line is better advertising than a green one — which is
   not true if it renders as an empty box on the 2014 laptop this product exists for.

   So a **fourth face ships**: Noto Sans Symbols 2 (OFL, same upstream), subset to five
   codepoints, **7,348 bytes**. It is declared under all three family names and placed last in
   `fonts.css`, so `✓` and `✗` in the same log line are drawn by the same hand.

   This was found by the coverage check, not by looking at the page — on a developer's Mac the
   character renders fine from a system font and nothing looks wrong.
3. **`◆` (U+25C6) and `○` (U+25CB)** are covered by the same symbols face. §7 uses `◆` in its own
   diagram to mark ore at a layer boundary; on the site that mark is normally *drawn* — a border
   or a canvas pixel — rather than typed, but now it renders either way.

`tools/fetch-fonts.mjs` re-checks all of this on every run. It reads the **built pages in `dist/`**
— what a browser is actually asked to render — and fails if a character there is in none of the
shipped faces. It deliberately does not scan whole source files: every file in this repository has
box-drawing banners in its comments, and reporting those would be reporting characters no page can
ever show.

---

## The honest caveat: Devanagari in a monospaced run

**IBM Plex Mono has no Devanagari, and neither does Instrument Serif. There is no monospaced
Devanagari in the Plex family at all.**

So `fonts.css` declares IBM Plex Sans Devanagari under all three family names, scoped by
`unicode-range`. Marathi text therefore renders wherever it appears — including inside a
`recipe.yaml` panel, which is set in mono — but it renders in a **proportional** face. Columns of
Devanagari in a config listing will not align the way Latin columns do.

The alternative was to let Devanagari fall back to whatever the visitor's machine has. On the 2014
Windows laptop that is our customer's actual hardware, that is frequently nothing, and Marathi
renders as a row of empty boxes — on the page whose entire claim is that we ship the customer's own
language. **A proportional face that renders is more honest than a monospaced one that does not.**

If this ever needs fixing properly, the fix is a monospaced Devanagari face with a compatible OFL
licence, not a hack. Until then it is written down here.

---

## Rebuilding

```
pnpm fonts            # idempotent; re-subsets from the cached TTFs
pnpm fonts --force    # re-download from google/fonts first
```

The downloaded TTFs land in `.font-cache/`, which is gitignored. The subsets in `public/fonts/` are
**committed**, so the site builds on a machine with no network and no Python.
