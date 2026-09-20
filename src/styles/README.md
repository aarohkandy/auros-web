# `src/styles/` — the design system

Spec §7 is **fixed and not open to reinterpretation**. These files implement it. Where §7 was
internally inconsistent, the resolution is written down where the code is, not in a side document.

## The files, in load order

`src/layouts/Base.astro` imports these three, in this order, before any component's scoped styles.

| File | What it owns |
| --- | --- |
| `tokens.css` | Every colour, size, space and face on the site. **Nothing else declares a hex.** |
| `fonts.css` | The `@font-face` rules for the self-hosted subsets in `public/fonts/`. |
| `base.css` | Reset, §7's ink rules, type defaults, focus, motion policy, layout primitives. |

Two documents sit beside them:

- `a11y-audit.md` — **generated.** Do not edit; the next `node tools/contrast.mjs --write` overwrites it.
- `FONTS.md` — why the fonts are self-hosted, what is subset, and what is honestly missing.

## Four gates, and each one can go red

`pnpm build` runs all four. None of them is a comment.

| Gate | Command | What it stops |
| --- | --- | --- |
| Palette | `node tools/palette-lint.mjs` | `tokens.css` and `src/terrain/render.ts` disagreeing; the terrain palette going over §7's 18; the counts written in `tokens.css`'s header drifting from the tokens under them. |
| Ink | `node tools/ink-lint.mjs` | A gradient, a drop shadow, a radius over 3px, a divider thicker than a hairline, a panel token with an alpha channel. |
| Contrast | `node tools/contrast.mjs` | Any text/panel pair under WCAG AA, measured over the **built** HTML with the real cascade. |
| Fonts | `node tools/fetch-fonts.mjs --verify` | `fonts.css` declaring a `unicode-range` narrower than what was subset (a glyph shipped and unusable); a committed subset edited by hand; a character on a built page that no shipped face contains. |

## The three rules that are easy to break by accident

1. **Ore is never a glyph.** `#BE3A12` on the dark panel measures 2.83:1. Ore is a border, a
   background, a rule or a mark. `--ore` and `--focus` flip tone with the theme for that reason;
   `--ore-deep` does not, because `--panel-deep` is dark in both themes. See the note in
   `tokens.css`.
2. **Instrument Serif has no bold** (DECISIONS D25). `--weight-display` is 400, `font-synthesis`
   is `none`, and a heading that needs more presence gets more size, not more weight.
3. **All body text sits on an opaque panel.** That is what makes the terrain safe to put behind
   everything, and it is why the contrast audit's coverage equals the site's text rather than most
   of it.

## Working on a dark surface

`--panel-deep` (the build console, a syntax-highlighted code block) is dark in **both** themes, so
the ink and the ore that were measured against a dark background are not the ones `:root` holds.
`base.css` remaps the tokens for that subtree:

```css
.tone-deep, .on-deep, pre.astro-code {
  --ink: var(--ink-console);
  --ink-muted: var(--ink-muted-deep);
  --ore: var(--ore-deep);
  --focus: var(--ore-deep);
}
```

So a component inside a deep panel writes `var(--ink)` and `var(--ore)` as it would anywhere else
and gets the right value. Nothing needs its own dark rules.

## Layout primitives

`base.css` defines four, and everything on the site is one of them or inside one:

- `.wrap` — the page gutter. 16px at phone width, 32px from 48rem up. Max 72rem.
- `.measure` — the reading column, `var(--measure)` (38rem) and no wider.
- `.stack` — a vertical rhythm; `--stack-space` overrides it locally.
- `.with-margin-label` — a 14rem rail plus content at 64rem up, stacked below that. This is what
  makes §7's "labelled in the margin as they pass it" literal.

Plus `.stratum-section` for the block padding that gives the scroll enough distance for the terrain
behind it to actually change.

## Components this layer provides

| Component | Note |
| --- | --- |
| `Panel.astro` | The opaque surface. Owned by the content agent; the tones map to the tokens above. |
| `Rule.astro` | The hairline — the only divider. `decorative` defaults to true. |
| `MonoValue.astro` | A fact, in IBM Plex Mono, with tabular figures and an optional label. |
| `Stratum.astro` | The margin label. **Forwards to `StratumLabel.astro`**, which is the one implementation; see that file's header. |
| `SkipLink.astro` | Off-screen, never `display: none`, target is `<main tabindex="-1">`. |
| `ThemeToggle.astro` | Three states: match system, light, dark. Hidden until the inline script proves scripting is on. |
