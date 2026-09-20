/**
 * AUROS — the generation engine, and its Worker wiring.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * Two exports, deliberately in one file.
 *
 * `createEngine()` is the whole job: generate the index buffers, paint them once, and hold the
 * indices so a theme switch is a repaint. It touches a canvas but never the document, so it
 * runs identically on a Worker thread and on the main thread.
 *
 * The bottom of the file wires that engine to `self.onmessage`, but only when this module is
 * actually executing as a Worker. `parallax.ts` imports `createEngine` directly for the
 * fallback path, and the guard is what stops that import from installing a message handler on
 * the window.
 *
 * WHY THE FALLBACK EXISTS
 * `OffscreenCanvas` is not universal, and `transferControlToOffscreen` is the part that lags.
 * Generation is a few tens of milliseconds, so the fallback is not a crisis — but it is a few
 * tens of milliseconds of blocked main thread, which is why `parallax.ts` defers it past first
 * paint rather than racing it.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 */

import { paint, paintToCanvas, type Theme } from "./render";
import {
  CLOUD_BAND_HEIGHT,
  CLOUD_PERIOD,
  WORLD_HEIGHT,
  WORLD_SEED,
  WORLD_WIDTH,
  generateClouds,
  generateTerrain,
  type CloudBuffer,
  type TerrainBuffer,
} from "./terrain";

/** Anything with a 2D context. An `OffscreenCanvas` in a Worker, a `<canvas>` on main. */
export type PaintTarget = {
  width: number;
  height: number;
  getContext(id: "2d"): (CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) | null;
};

export interface EngineInit {
  terrain: PaintTarget;
  clouds: PaintTarget;
  theme: Theme;
  /** Window width in blocks. The world is always `WORLD_WIDTH`; this is how much of it we hold. */
  windowWidth: number;
  /** Leftmost world column of the window. `parallax.ts` centres it. */
  x0: number;
  seed?: number;
  worldWidth?: number;
  worldHeight?: number;
  cloudPeriod?: number;
  cloudHeight?: number;
}

/** Everything measured, nothing claimed. Surfaced on the `auros:terrain` event. */
export interface EngineReport {
  readonly generateMs: number;
  readonly paintMs: number;
  /** Bytes of canvas backing store, terrain + clouds, at 4 bytes per block. */
  readonly canvasBytes: number;
  /** Bytes of retained index buffers — what a theme switch repaints from. */
  readonly indexBytes: number;
  readonly terrainWidth: number;
  readonly terrainHeight: number;
  readonly cloudWidth: number;
  readonly cloudHeight: number;
  readonly cloudPeriod: number;
  /** §7 ceiling is 0.02. */
  readonly oreFraction: number;
  /** Distinct palette indices present in the terrain buffer. */
  readonly distinctIndices: number;
  readonly usedOffscreen: boolean;
}

export interface Engine {
  readonly report: EngineReport;
  /** Repaint both canvases under a different palette. Returns the repaint time in ms. */
  setTheme(theme: Theme): number;
}

const now = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

export function createEngine(init: EngineInit): Engine {
  const seed = init.seed ?? WORLD_SEED;
  const worldWidth = init.worldWidth ?? WORLD_WIDTH;
  const worldHeight = init.worldHeight ?? WORLD_HEIGHT;
  const cloudPeriod = init.cloudPeriod ?? CLOUD_PERIOD;
  const cloudHeight = init.cloudHeight ?? CLOUD_BAND_HEIGHT;

  const t0 = now();
  const terrain: TerrainBuffer = generateTerrain({
    seed,
    worldWidth,
    worldHeight,
    width: init.windowWidth,
    x0: init.x0,
  });
  const clouds: CloudBuffer = generateClouds({
    seed,
    width: init.windowWidth,
    height: cloudHeight,
    period: cloudPeriod,
    x0: init.x0,
  });
  const generateMs = now() - t0;

  init.terrain.width = terrain.width;
  init.terrain.height = terrain.height;
  init.clouds.width = clouds.width;
  init.clouds.height = clouds.height;

  const terrainCtx = init.terrain.getContext("2d");
  const cloudCtx = init.clouds.getContext("2d");
  if (!terrainCtx || !cloudCtx) throw new Error("auros/terrain: no 2d context");

  // Held so a theme switch never regenerates noise (§7). This is the entire reason the
  // generator emits indices rather than pixels.
  let terrainRgba: Uint8ClampedArray | undefined;
  let cloudRgba: Uint8ClampedArray | undefined;

  function repaint(theme: Theme): number {
    const t = now();
    terrainRgba = paintToCanvas(terrainCtx!, terrain, theme, terrainRgba);
    cloudRgba = paintToCanvas(cloudCtx!, clouds, theme, cloudRgba);
    return now() - t;
  }

  const paintMs = repaint(init.theme);

  const canvasBytes = (terrain.width * terrain.height + clouds.width * clouds.height) * 4;
  const indexBytes = terrain.indices.length + clouds.indices.length;

  return {
    report: {
      generateMs,
      paintMs,
      canvasBytes,
      indexBytes,
      terrainWidth: terrain.width,
      terrainHeight: terrain.height,
      cloudWidth: clouds.width,
      cloudHeight: clouds.height,
      cloudPeriod: clouds.period,
      oreFraction: terrain.stats.oreFraction,
      distinctIndices: terrain.stats.distinctIndices,
      usedOffscreen: typeof OffscreenCanvas !== "undefined" && init.terrain instanceof OffscreenCanvas,
    },
    setTheme: repaint,
  };
}

// ── Worker protocol ───────────────────────────────────────────────────────────────────────

export type ToWorker =
  | ({ type: "init"; terrain: OffscreenCanvas; clouds: OffscreenCanvas } & Omit<
      EngineInit,
      "terrain" | "clouds"
    >)
  | { type: "theme"; theme: Theme };

export type FromWorker =
  | { type: "ready"; report: EngineReport }
  | { type: "repainted"; ms: number }
  | { type: "error"; message: string };

/**
 * True only inside a dedicated Worker. `importScripts` is the cheapest reliable tell that works
 * without pulling in webworker lib declarations that fight the DOM ones.
 */
const IN_WORKER =
  typeof self !== "undefined" &&
  typeof (self as unknown as { document?: unknown }).document === "undefined" &&
  typeof (self as unknown as { importScripts?: unknown }).importScripts === "function";

if (IN_WORKER) {
  const scope = self as unknown as {
    onmessage: ((e: { data: ToWorker }) => void) | null;
    postMessage: (m: FromWorker) => void;
  };
  let engine: Engine | undefined;

  scope.onmessage = (event) => {
    const msg = event.data;
    try {
      if (msg.type === "init") {
        engine = createEngine(msg as unknown as EngineInit);
        scope.postMessage({ type: "ready", report: engine.report });
      } else if (msg.type === "theme" && engine) {
        scope.postMessage({ type: "repainted", ms: engine.setTheme(msg.theme) });
      }
    } catch (err) {
      scope.postMessage({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };
}

// Keeps `paint` reachable for consumers that want to render without a canvas (tests, an SSR
// smoke check). Re-exported here rather than made a second import site in `parallax.ts`.
export { paint };
