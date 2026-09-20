# Conventions these components assume

Written by the agent that owns `src/pages/`, `src/components/` (except `configurator/`) and
`auros-web/tools/`.

These files were written before the scaffold existed — no `package.json`, no `astro.config.*`, no
`src/layouts/`, no `src/styles/`, no `src/terrain/` — so each coupling to another agent's work was
written down here as an assumed contract first and then checked against the real thing when it
landed. All of them held: `BaseLayout.astro` takes the props below, `tokens.css` defines the token
names below, and `configurator/Configurator.astro` is the component `src/pages/configure.astro`
mounts. What follows is therefore the contract as it stands, not a guess.


## 1. The layout

Every page renders through `src/components/PageShell.astro`, and `PageShell` is the **only** file
that imports from `src/layouts/`. It expects:

```astro
<!-- src/layouts/BaseLayout.astro -->
Props: { title: string; description: string; layer?: "sky"|"surface"|"topsoil"|"stratum-1"|"stratum-2"|"bedrock" }
Renders: <html>, <head>, the terrain canvas, the skip link, nav, <slot />, footer, theme toggle.
```

If the layout ends up named something else, or takes different props, change `PageShell.astro`
and nothing else moves. If it is absent at build time, `PageShell` falls back to a plain
document so the pages still build and still read — deliberately ugly, never silently broken.

## 2. Design tokens

`src/styles/` owns the token values. These components never hard-code a colour without a token
in front of it: every use is `var(--token, <fallback>)`, and the fallback is a §7 palette value.
So the site renders correctly-coloured before the token file lands, and adopts the real tokens
the moment it does.

| Token | Fallback (light) | Used for |
|---|---|---|
| `--ink` | `#24231F` | body text |
| `--ink-muted` | `#5A4E40` | secondary text, captions |
| `--ink-console` | `#E2DDD0` | text on the console panel |
| `--panel` | `#F4F1EA` | the opaque panel body text sits on (§7) |
| `--panel-2` | `#E6E0D2` | the second panel tone, insets |
| `--panel-deep` | `#24231F` | the build console's panel |
| `--rule` | `#8A7358` | the 1px hairline, the only divider (§7) |
| `--ore` | `#BE3A12` | layer-boundary marks, the ILLUSTRATION flag |
| `--ore-2` | `#D9682E` | the second ore tone |
| `--focus` | `#BE3A12` light / `#D9682E` dark | the focus ring; it flips in dark so it keeps 3:1 |
| `--page-bg` | `#EFE6D4` | the page behind the panels |
| `--font-display` | Instrument Serif | headings only, **400 only — this face has no bold** |
| `--font-ui` | IBM Plex Sans | UI and prose |
| `--font-mono` | IBM Plex Mono | anything factual: prices, config, logs, paths |

**Ore is never text, and it is not every mark either.** Measured, not assumed: `#BE3A12` on the
dark panel `#1E242C` is 2.83:1 and `#D9682E` is 4.39:1 — both under 4.5:1 — so text is
`--ink` / `--ink-muted` / `--ink-console`. Ore is also not used for a mark that WCAG 1.4.11
governs: a link underline and an interactive border have to clear 3:1 in both themes, `--ore-2`
misses that on `--panel-2` at 2.67:1, and `--rule` clears it everywhere (3.41:1 to 3.91:1), so
those use `--rule`. Ore stays on decoration — the layer-boundary marks and the ILLUSTRATION flag.
`tools/contrast.mjs` re-measures all of this against what `src/styles/` actually defines, page by
built page, and fails the build if a governed pair comes in under AA.

Dark theme is the styles agent's to define. These components assume it redefines the same token
names under `@media (prefers-color-scheme: dark)` and `[data-theme="dark"]`, and never that a
component needs its own dark rules.

## 3. §7 rules these components hold themselves to

No gradients. No drop shadows. Border radius ceiling 3px. The 1px hairline is the only divider.
All body text sits on an opaque panel. Nothing animates except the build console, which is
streaming a real fact, and a value in the replacement-cost arithmetic, which is also one.
Instrument Serif is never given a weight above 400 and never synthesised bold.

## 4. Content collections

Pages route from `src/content/` by `order` and `id`, never by filename, and no prose is copied
into a template. Lookups live in `src/components/content.ts`. The config uses the collection API
in `src/content/config.ts`; whoever owns `astro.config.*` has to make that config load — with
Astro 7 that means either the content-layer `loader` form or the legacy-collections flag. Not
my file, but the pages do not build without it.

## 5. The Worker endpoints these components call

| Component | Method + path | State if it is not there |
|---|---|---|
| `BuildConsole` | `GET /api/build/stream` (SSE, `text/event-stream`) | says there is no build to show |
| `NoScriptFallback` | none — `mailto:` only | n/a |

`BuildConsole` takes the path as a prop, so the Worker agent renaming the route is a prop change.
It sends `Last-Event-ID` on reconnect (the Cloudflare runtime drops in-flight requests on a
runtime update) and it treats "endpoint missing", "endpoint erroring" and "no build running" as
the same honest outcome: it says so. It has no code path that can invent a line of output.
