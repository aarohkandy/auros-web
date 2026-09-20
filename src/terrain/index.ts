/**
 * AUROS — terrain renderer, public surface.
 *
 * A layout needs one line:
 *
 *   <script>import "../terrain";</script>
 *
 * That import mounts the terrain by itself. Everything else exported here is for the page to
 * *read*: `TERRAIN_EVENT` carries the measured generation time and memory footprint, and
 * `STRATA` / `boundaryRows` let the margin labels be positioned against the boundaries the
 * renderer actually drew rather than against a guess.
 *
 * Nothing here runs without JavaScript, deliberately. See `parallax.ts`.
 */

export { mountTerrain, TERRAIN_EVENT, type TerrainEventDetail } from "./parallax.ts";
export {
  STRATA,
  ORE_SEAMS,
  PX,
  PALETTE_SIZE,
  boundaryRows,
  stratum,
  stratumAtDepth,
  type Stratum,
  type StratumId,
} from "./strata.ts";
export {
  BLOCK_PX,
  WORLD_HEIGHT,
  WORLD_SEED,
  WORLD_WIDTH,
  generateClouds,
  generateTerrain,
  type TerrainBuffer,
} from "./terrain.ts";
export { FALLBACK_BACKGROUND, PALETTES, paint, type Theme } from "./render.ts";
