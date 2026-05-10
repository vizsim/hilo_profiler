// Project a lng/lat to CSS-pixel screen coords using MapLibre's public
// `map.project()`. With terrain enabled this places the result on the
// terrain surface (no floating z-axis offset between line and ground); with
// terrain off it's a plain Mercator projection.
//
// The `output` object is reused across calls to avoid per-call allocations
// in tight loops (hover hit-test, custom line mesh build). `valid` is false
// when the projection blew up — typically samples whose perspective divide
// produced extreme coords because they sit at or behind the camera plane.

const SCREEN_SANITY_BOUND = 100000;

export function projectLngLatToScreen(map, lngLat, output) {
  const result = output || { x: 0, y: 0, valid: false };

  if (typeof map?.project !== 'function') {
    result.x = 0;
    result.y = 0;
    result.valid = false;
    return result;
  }

  const projected = map.project(lngLat);
  const sane = Number.isFinite(projected.x)
    && Number.isFinite(projected.y)
    && Math.abs(projected.x) < SCREEN_SANITY_BOUND
    && Math.abs(projected.y) < SCREEN_SANITY_BOUND;

  if (sane) {
    result.x = projected.x;
    result.y = projected.y;
    result.valid = true;
  } else {
    result.x = 0;
    result.y = 0;
    result.valid = false;
  }
  return result;
}
