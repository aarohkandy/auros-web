/**
 * AUROS — mounting, scroll binding, theme, and motion policy.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * THE ONE RULE THIS FILE EXISTS TO KEEP
 * §7: "Render once offscreen; scroll parallax via `transform` only, never redraw."
 *
 * So there are exactly three things that ever change after mount:
 *   1. a `transform` on the world element, as the page scrolls
 *   2. a `transform` on the cloud canvas, driven by a CSS animation, at 2 px/sec
 *   3. a repaint of both canvases when the theme changes — palette only, no regeneration
 *
 * Nothing else. No resize regeneration (the world is a fixed size, so there is nothing to
 * regenerate), no redraw on scroll, no per-frame JavaScript for the clouds.
 *
 * The scroll path prefers a CSS scroll-driven animation, which runs off the main thread
 * entirely and costs nothing per frame. Where that is unsupported it falls back to a passive
 * scroll listener that sets a flag and a rAF callback that reads `window.scrollY` and writes one
 * transform. Every layout quantity it needs — document height, viewport height, travel distance
 * — is computed in a `ResizeObserver`, never in the handler, so the handler cannot force a
 * synchronous layout no matter how fast the user scrolls.
 *
 * REDUCED MOTION
 * §7: "`prefers-reduced-motion`: static render, no parallax." Read carefully, that forbids
 * *relative* motion, which is the thing that causes trouble — a background sliding at a
 * different rate to the text under the reader's eye. It does not ask us to pin the background
 * so that a reader who needs reduced motion is the one reader who never gets to see the
 * architecture the page is about.
 *
 * So the static mode drops the transform binding entirely and positions the world absolutely in
 * the document. The terrain then scrolls with the page at exactly 1:1, like a printed sheet
 * behind the type: zero relative motion, zero animation, zero JavaScript on scroll, and the
 * strata still pass the reader in order. Clouds do not drift. This is an interpretation, and it
 * is written down here so it can be overruled rather than discovered.
 *
 * NO JAVASCRIPT
 * Every element below is created by this file. With scripting off, none of it exists, and the
 * page keeps whatever flat background `src/styles/` gives it. The one rule this file installs
 * outside its own subtree — making `html`/`body` transparent — is gated on a class this file
 * adds at mount, so it cannot apply when this file has not run.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 */

import { FALLBACK_BACKGROUND, PALETTES, type Theme } from "./render.ts";
import { PX, STRATA, boundaryRows } from "./strata.ts";
import {
  BLOCK_PX,
  CLOUD_BAND_HEIGHT,
  CLOUD_PERIOD,
  WORLD_HEIGHT,
  WORLD_SEED,
  WORLD_WIDTH,
} from "./terrain.ts";
import {
  createEngine,
  type Engine,
  type EngineReport,
  type FromWorker,
  type PaintTarget,
} from "./worker.ts";

/** §7 ceiling for cloud drift. Used to derive the animation duration, not to describe it. */
const CLOUD_DRIFT_PX_PER_SEC = 2;

/** Fired on `document` once the terrain is on screen. Detail carries measurements, not claims. */
export const TERRAIN_EVENT = "auros:terrain";

export interface TerrainEventDetail extends EngineReport {
  /** CSS pixels per logical block, after device-pixel-ratio snapping. Nominally 4. */
  readonly cssBlockPx: number;
  readonly devicePixelRatio: number;
  readonly staticMode: boolean;
  readonly scrollTimeline: boolean;
  readonly theme: Theme;
  /** Total wall time from mount to painted, including the deferral. */
  readonly totalMs: number;
  /**
   * What each canvas ACTUALLY renders at, measured off the box the browser gave it, in CSS px per
   * logical block. Both must equal cssBlockPx. They did not: a global `canvas { max-width: 100% }`
   * in base.css clamped the cloud canvas -- which is a period wider than its parent by design --
   * from 2440px to 1480px, so the clouds drew at 2.4262 px/block against the terrain's 4. Nothing
   * looked broken in the source; it was only visible in a measurement. So it is measured.
   */
  readonly measuredBlockPx: { readonly ground: number; readonly clouds: number };
}

let mounted = false;

/**
 * Put the terrain on the page. Idempotent — calling it twice is a no-op, which matters because
 * this module auto-mounts and a layout may also call it explicitly.
 */
export function mountTerrain(): void {
  if (mounted) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;
  mounted = true;

  const t0 = performance.now();

  // ── Device pixel ratio ──────────────────────────────────────────────────────────────────
  // The canvas holds one device pixel per block and CSS scales it up. For the blocks to stay
  // crisp, one block must land on a whole number of device pixels, so the nominal 4 CSS px is
  // snapped to the nearest integer device size and converted back. At DPR 1, 1.5, 2 and 3 this
  // is exactly 4 CSS px; at an unusual ratio such as 1.1 it becomes 3.64 CSS px, which is a
  // rounding no one can see and is the difference between hard block edges and mush.
  const dpr = window.devicePixelRatio || 1;
  const deviceBlock = Math.max(1, Math.round(BLOCK_PX * dpr));
  const cssBlock = deviceBlock / dpr;

  // ── Window into the world ───────────────────────────────────────────────────────────────
  // The world is always WORLD_WIDTH blocks so the picture is the same everywhere (§7: "it is
  // the brand"). A narrow viewport holds a centred crop of it, generated directly rather than
  // cropped afterwards, so a phone never allocates a 3840px-wide canvas.
  //
  // The crop is sized to the widest the *device* could ever present, not to the window as it is
  // right now: the longer screen edge covers rotation, and a maximised window cannot exceed the
  // screen. That is what lets "render once" be literally true — there is no resize path that
  // regenerates anything, because there is no resize that can outgrow the buffer.
  //
  // It is also the fix for a real failure found in the browser harness: mounted inside a pane
  // that had not been laid out yet, `innerWidth` read 0 and the whole world came out two blocks
  // wide. `screen` is never zero, and the floor underneath it means no arrangement of a hidden
  // or zero-size viewport can produce a degenerate canvas.
  const screenEdge = typeof screen !== "undefined" ? Math.max(screen.width, screen.height) : 0;
  const widest = Math.max(window.innerWidth || 0, screenEdge, 400);
  const windowWidth = Math.min(WORLD_WIDTH, Math.ceil(widest / cssBlock) + 2);
  const x0 = Math.floor((WORLD_WIDTH - windowWidth) / 2);

  const worldCssWidth = windowWidth * cssBlock;
  const worldCssHeight = WORLD_HEIGHT * cssBlock;
  const cloudCssWidth = (windowWidth + CLOUD_PERIOD) * cssBlock;
  const cloudCssHeight = CLOUD_BAND_HEIGHT * cssBlock;
  const driftDistance = CLOUD_PERIOD * cssBlock;
  const driftSeconds = driftDistance / CLOUD_DRIFT_PX_PER_SEC;

  // ── Motion and theme policy ─────────────────────────────────────────────────────────────
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");
  const staticMode = reduceMotion.matches;

  const readTheme = (): Theme => {
    const override = document.documentElement.dataset.theme;
    if (override === "dark" || override === "light") return override;
    return darkScheme.matches ? "dark" : "light";
  };
  let theme = readTheme();

  const scrollTimeline =
    !staticMode &&
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("animation-timeline: scroll()");

  // ── DOM ─────────────────────────────────────────────────────────────────────────────────
  const host =
    document.querySelector<HTMLElement>("[data-auros-terrain]") ??
    document.body.insertBefore(document.createElement("div"), document.body.firstChild);
  host.setAttribute("data-auros-terrain", "");
  host.setAttribute("aria-hidden", "true");
  host.id = host.id || "auros-terrain";

  const world = document.createElement("div");
  world.className = "auros-terrain__world";

  const terrainCanvas = document.createElement("canvas");
  terrainCanvas.className = "auros-terrain__ground";

  const cloudCanvas = document.createElement("canvas");
  cloudCanvas.className = "auros-terrain__clouds";

  world.append(terrainCanvas, cloudCanvas);
  host.append(world);

  document.documentElement.classList.add("auros-terrain-active");
  if (staticMode) host.dataset.motion = "static";

  // ── Styles ──────────────────────────────────────────────────────────────────────────────
  // Injected from JavaScript so that the no-script page never has them, and scoped under
  // `.auros-terrain-active` so the flat background in `src/styles/` stays authoritative until
  // the moment there is something to put in front of it.
  const style = document.createElement("style");
  style.id = "auros-terrain-style";
  style.textContent = css({
    staticMode,
    scrollTimeline,
    worldCssWidth,
    worldCssHeight,
    cloudCssWidth,
    cloudCssHeight,
    driftDistance,
    driftSeconds,
  });
  document.head.appendChild(style);

  applyThemeVars(theme);
  publishBoundaries(cssBlock);

  // ── Deferral ────────────────────────────────────────────────────────────────────────────
  // Generation is tens of milliseconds of arithmetic. It must not be part of getting text on
  // the screen, so it is queued for the first idle period with a timeout so it still happens on
  // a permanently busy page. The canvases are already in the DOM and already the right size, so
  // nothing reflows when the pixels arrive.
  const defer = (fn: () => void) => {
    const ric = (window as unknown as {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    }).requestIdleCallback;
    if (ric) ric(fn, { timeout: 2000 });
    else window.setTimeout(fn, 120);
  };

  let engine: Engine | undefined;
  let worker: Worker | undefined;

  const finish = (report: EngineReport) => {
    host.dataset.ready = "true";
    const measuredBlockPx = {
      ground: terrainCanvas.getBoundingClientRect().width / windowWidth,
      clouds: cloudCanvas.getBoundingClientRect().width / (windowWidth + CLOUD_PERIOD),
    };
    // A canvas that is not drawing at the block size it was built for is not a rendering nicety --
    // §7 fixes the logical block at 4 CSS px, and two different block sizes in one picture is the
    // background disagreeing with itself. This cannot be caught by reading the stylesheet this
    // module writes, because the rule that broke it lives in a different file and applies to every
    // canvas on the site. So it is asserted against the measurement, out loud, once.
    for (const [which, value] of Object.entries(measuredBlockPx)) {
      if (Math.abs(value - cssBlock) > 0.01) {
        console.warn(
          `auros/terrain: the ${which} canvas renders at ${value.toFixed(4)} CSS px per block, not ` +
            `${cssBlock}. Something outside this module is resizing it — check for a global rule on ` +
            `\`canvas\` (base.css has max-width:100%, which this module overrides with max-width:none).`,
        );
      }
    }
    const detail: TerrainEventDetail = {
      ...report,
      measuredBlockPx,
      cssBlockPx: cssBlock,
      devicePixelRatio: dpr,
      staticMode,
      scrollTimeline,
      theme,
      totalMs: performance.now() - t0,
    };
    document.dispatchEvent(new CustomEvent(TERRAIN_EVENT, { detail }));
  };

  defer(() => {
    const common = {
      theme,
      windowWidth,
      x0,
      seed: WORLD_SEED,
      worldWidth: WORLD_WIDTH,
      worldHeight: WORLD_HEIGHT,
      cloudPeriod: CLOUD_PERIOD,
      cloudHeight: CLOUD_BAND_HEIGHT,
    };

    const canOffscreen =
      typeof Worker !== "undefined" &&
      typeof OffscreenCanvas !== "undefined" &&
      typeof terrainCanvas.transferControlToOffscreen === "function";

    if (canOffscreen) {
      try {
        worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
        const t = terrainCanvas.transferControlToOffscreen();
        const c = cloudCanvas.transferControlToOffscreen();
        worker.onmessage = (event: MessageEvent<FromWorker>) => {
          const msg = event.data;
          if (msg.type === "ready") finish(msg.report);
          else if (msg.type === "error") console.warn("auros/terrain:", msg.message);
        };
        worker.postMessage({ type: "init", terrain: t, clouds: c, ...common }, [t, c]);
        return;
      } catch {
        // A blocked Worker (a strict CSP, a bundler that did not emit the chunk) is not a
        // reason to have no background. Fall through and do it here.
        worker = undefined;
      }
    }

    try {
      engine = createEngine({
        ...common,
        terrain: terrainCanvas as unknown as PaintTarget,
        clouds: cloudCanvas as unknown as PaintTarget,
      });
      finish(engine.report);
    } catch (err) {
      // Last resort: leave the flat background in place and say why, once.
      document.documentElement.classList.remove("auros-terrain-active");
      host.remove();
      console.warn("auros/terrain: falling back to a flat background —", err);
    }
  });

  // ── Theme ───────────────────────────────────────────────────────────────────────────────
  // A repaint, never a regeneration. The index buffers are already in memory on whichever
  // thread painted them.
  const onThemeChange = () => {
    const next = readTheme();
    if (next === theme) return;
    theme = next;
    applyThemeVars(theme);
    if (worker) worker.postMessage({ type: "theme", theme } satisfies { type: "theme"; theme: Theme });
    else engine?.setTheme(theme);
  };
  darkScheme.addEventListener("change", onThemeChange);
  new MutationObserver(onThemeChange).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  // ── Scroll ──────────────────────────────────────────────────────────────────────────────
  if (staticMode) return; // nothing binds; the world is absolutely positioned and just scrolls

  // Declared before either path touches them: `measure()` is hoisted, these are not.
  let travel = 0;
  let invRange = 0;
  let ticking = false;

  function measure(): void {
    const viewport = window.innerHeight;
    const docHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body?.scrollHeight ?? 0,
    );
    travel = Math.max(0, worldCssHeight - viewport);
    const range = Math.max(1, docHeight - viewport);
    invRange = 1 / range;
    host.style.setProperty("--auros-terrain-travel", `${travel}px`);
  }

  function tick(): void {
    ticking = false;
    // The only read in the handler is the scroll offset, taken inside the rAF callback where
    // style and layout are already settled. There is no `getBoundingClientRect`, no `offset*`,
    // no `getComputedStyle` on this path — every layout quantity was measured in `measure()`.
    const p = window.scrollY * invRange;
    const clamped = p < 0 ? 0 : p > 1 ? 1 : p;
    const y = -(travel * clamped);
    world.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
  }

  if (scrollTimeline) {
    // The animation is declared in the injected stylesheet and driven by the compositor, so
    // there is no scroll listener and no rAF at all on this path. `--auros-terrain-travel` is
    // the only thing that changes, and only when the document resizes.
    measure();
    new ResizeObserver(measure).observe(document.documentElement);
    return;
  }

  measure();
  new ResizeObserver(measure).observe(document.documentElement);
  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(tick);
    },
    { passive: true },
  );
  tick();
}

// ── CSS ───────────────────────────────────────────────────────────────────────────────────

interface CssOptions {
  staticMode: boolean;
  scrollTimeline: boolean;
  worldCssWidth: number;
  worldCssHeight: number;
  cloudCssWidth: number;
  cloudCssHeight: number;
  driftDistance: number;
  driftSeconds: number;
}

function css(o: CssOptions): string {
  const shell = o.staticMode
    ? `position:absolute;top:0;left:0;right:0;height:${o.worldCssHeight}px;`
    : `position:fixed;inset:0;`;

  // `contain: strict` on a fixed, 6400px-tall subtree is what keeps it out of the page's layout
  // and paint work entirely. Without it, a full-height canvas participates in every
  // invalidation the document has.
  return `
.auros-terrain-active body { background-color: transparent; }
.auros-terrain-active { background-color: var(--auros-terrain-deep); }
[data-auros-terrain] {
  ${shell}
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
  contain: strict;
  background-color: var(--auros-terrain-fallback);
}
.auros-terrain__world {
  position: absolute;
  top: 0;
  left: 50%;
  width: ${o.worldCssWidth}px;
  height: ${o.worldCssHeight}px;
  margin-left: ${-o.worldCssWidth / 2}px;
  ${o.staticMode ? "" : "will-change: transform;"}
}
.auros-terrain__ground,
.auros-terrain__clouds {
  position: absolute;
  top: 0;
  left: 0;
  display: block;
  /* THE GLOBAL MEDIA RESET DOES NOT APPLY TO THESE TWO.
     base.css has \`img, picture, svg, canvas, video { max-width: 100% }\`, which is right for content
     images and wrong for a canvas whose whole design is to be WIDER THAN ITS PARENT. The cloud
     canvas is one full cloud period wider than the world by construction, so max-width:100%
     clamped it every time: specified 2440px, used 1480px at a 1024px viewport. The terrain then
     drew at exactly 4 CSS px per block and the clouds at 2.4262, in the same picture -- and a
     non-integer block size defeats image-rendering:pixelated, so the clouds were also resampled.
     The drift keyframe translates by one period measured at 4px/block, so with no slack left past
     the world width the canvas walked off the right-hand edge: 54% of the sky had no cloud canvas
     over it near the end of the cycle. Motion that reports nothing, which §7 forbids.
     Asserted at mount by assertBlockSize(), so a future global rule cannot do this again. */
  max-width: none;
  max-height: none;
  /* crisp-edges first as the fallback; pixelated is the value §7 names and it must be the one
     that wins wherever it is understood. Declared the other way round, browsers that support
     both -- which is now most of them -- silently take crisp-edges. Measured in the harness. */
  image-rendering: crisp-edges;
  image-rendering: pixelated;
}
.auros-terrain__ground { width: ${o.worldCssWidth}px; height: ${o.worldCssHeight}px; }
.auros-terrain__clouds { width: ${o.cloudCssWidth}px; height: ${o.cloudCssHeight}px; }
${
  o.staticMode
    ? ""
    : `
.auros-terrain__clouds {
  animation: auros-cloud-drift ${o.driftSeconds}s linear infinite;
  will-change: transform;
}
@keyframes auros-cloud-drift {
  from { transform: translate3d(0, 0, 0); }
  to   { transform: translate3d(${-o.driftDistance}px, 0, 0); }
}`
}
${
  o.scrollTimeline
    ? `
.auros-terrain__world {
  animation: auros-terrain-descend linear both;
  animation-timeline: scroll(root block);
}
@keyframes auros-terrain-descend {
  from { transform: translate3d(0, 0, 0); }
  to   { transform: translate3d(0, calc(-1 * var(--auros-terrain-travel, 0px)), 0); }
}`
    : ""
}
@media (prefers-reduced-motion: reduce) {
  .auros-terrain__clouds, .auros-terrain__world { animation: none !important; }
}
`;
}

// ── Custom properties ─────────────────────────────────────────────────────────────────────

/**
 * Publish the flat-background colours so the styles agent can key off them, and so the deep
 * colour below the world's bottom edge continues the bedrock instead of cutting to white.
 */
function applyThemeVars(theme: Theme): void {
  const root = document.documentElement.style;
  root.setProperty("--auros-terrain-fallback", FALLBACK_BACKGROUND[theme]);
  root.setProperty("--auros-terrain-deep", PALETTES[theme][PX.ROCK_4]!);
}

/**
 * Publish where each stratum's boundary actually is.
 *
 * §7 says each stratum is "labelled in the margin as they pass it". A label positioned by eye
 * against a procedurally generated boundary is a label that is wrong on some viewport, so the
 * renderer states its own geometry and the margin can be positioned against it:
 *
 *   --auros-stratum-bedrock-at : 0.775      fraction of the world, for scroll-linked placement
 *   --auros-stratum-bedrock-y  : 4960px     offset from the top of the world
 *
 * These are the nominal boundaries, not the noise-displaced ones, because a label should change
 * at a stable position rather than wherever this column's rock happened to land.
 */
function publishBoundaries(cssBlock: number): void {
  const rows = boundaryRows(WORLD_HEIGHT);
  const root = document.documentElement.style;
  root.setProperty("--auros-terrain-world-height", `${WORLD_HEIGHT * cssBlock}px`);
  root.setProperty("--auros-terrain-block", `${cssBlock}px`);
  for (const s of STRATA) {
    root.setProperty(`--auros-stratum-${s.id}-at`, `${s.top}`);
    root.setProperty(`--auros-stratum-${s.id}-y`, `${rows[s.id] * cssBlock}px`);
  }
}

// Auto-mount. The layout only has to load this module; it may also call `mountTerrain()`
// itself, and calling it twice does nothing.
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mountTerrain(), { once: true });
  } else {
    mountTerrain();
  }
}
