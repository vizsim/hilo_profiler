export function buildProfileStats(samples, elevations) {
  const validElevations = elevations.filter((value) => Number.isFinite(value));
  let ascentMeters = 0;
  let descentMeters = 0;

  for (let index = 1; index < elevations.length; index += 1) {
    const previous = elevations[index - 1];
    const current = elevations[index];

    if (!Number.isFinite(previous) || !Number.isFinite(current)) {
      continue;
    }

    const delta = current - previous;
    if (delta > 0) {
      ascentMeters += delta;
    } else {
      descentMeters += Math.abs(delta);
    }
  }

  return {
    distanceMeters: samples[samples.length - 1]?.distanceMeters ?? 0,
    ascentMeters,
    descentMeters,
    minElevation: validElevations.length ? Math.min(...validElevations) : Number.NaN,
    maxElevation: validElevations.length ? Math.max(...validElevations) : Number.NaN,
  };
}