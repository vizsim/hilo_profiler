const DEFAULT_SAMPLE_SPACING_METERS = 10;
const MIN_SAMPLE_COUNT = 10;
const DENSE_SAMPLING_THRESHOLD_METERS = 2000;
const LONG_DISTANCE_SAMPLE_TARGET = 200;

export function buildLineState(startPoint, endPoint, waypoints = []) {
  const pathPoints = buildPathPoints(startPoint, endPoint, waypoints);

  if (pathPoints.length < 2) {
    return {
      directLine: null,
      lineDistanceMeters: null,
      sampleCount: null,
    };
  }

  const lineDistanceMeters = calculatePathDistance(pathPoints);
  const sampleCount = calculatePathSampleCount(pathPoints);

  return {
    directLine: {
      coordinates: pathPoints.map((point) => [point.lng, point.lat]),
    },
    lineDistanceMeters,
    sampleCount,
  };
}

export function sampleLineBetweenPoints(startPoint, endPoint, options = {}) {
  const distanceMeters = distanceBetweenPoints(startPoint, endPoint);
  const sampleCount = calculateSampleCount(distanceMeters, options.spacingMeters, options.maxSamples);

  return Array.from({ length: sampleCount }, (_, index) => {
    const ratio = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    return {
      lng: interpolate(startPoint.lng, endPoint.lng, ratio),
      lat: interpolate(startPoint.lat, endPoint.lat, ratio),
      distanceMeters: distanceMeters * ratio,
    };
  });
}

export function samplePathBetweenPoints(startPoint, endPoint, waypoints = [], options = {}) {
  const pathPoints = buildPathPoints(startPoint, endPoint, waypoints);
  if (pathPoints.length < 2) {
    return [];
  }

  const samples = [];
  let traversedDistance = 0;

  for (let index = 0; index < pathPoints.length - 1; index += 1) {
    const segmentStart = pathPoints[index];
    const segmentEnd = pathPoints[index + 1];
    const segmentDistance = distanceBetweenPoints(segmentStart, segmentEnd);
    const segmentSampleCount = calculateSampleCount(segmentDistance, options.spacingMeters, options.maxSamples);

    for (let sampleIndex = 0; sampleIndex < segmentSampleCount; sampleIndex += 1) {
      if (index > 0 && sampleIndex === 0) {
        continue;
      }

      const ratio = segmentSampleCount === 1 ? 0 : sampleIndex / (segmentSampleCount - 1);
      samples.push({
        lng: interpolate(segmentStart.lng, segmentEnd.lng, ratio),
        lat: interpolate(segmentStart.lat, segmentEnd.lat, ratio),
        distanceMeters: traversedDistance + segmentDistance * ratio,
      });
    }

    traversedDistance += segmentDistance;
  }

  return samples;
}

export function buildPathPoints(startPoint, endPoint, waypoints = []) {
  return [startPoint, ...waypoints, endPoint].filter(Boolean);
}

function calculatePathDistance(pathPoints) {
  let totalDistance = 0;

  for (let index = 0; index < pathPoints.length - 1; index += 1) {
    totalDistance += distanceBetweenPoints(pathPoints[index], pathPoints[index + 1]);
  }

  return totalDistance;
}

function calculatePathSampleCount(pathPoints, spacingMeters = DEFAULT_SAMPLE_SPACING_METERS, maxSamples = 320) {
  let totalSamples = 0;

  for (let index = 0; index < pathPoints.length - 1; index += 1) {
    const segmentDistance = distanceBetweenPoints(pathPoints[index], pathPoints[index + 1]);
    totalSamples += calculateSampleCount(segmentDistance, spacingMeters, maxSamples);
  }

  return Math.max(2, totalSamples - (pathPoints.length - 2));
}

export function distanceBetweenPoints(pointA, pointB) {
  if (!pointA || !pointB) {
    return Number.POSITIVE_INFINITY;
  }

  const earthRadiusMeters = 6371008.8;
  const lat1 = toRadians(pointA.lat);
  const lat2 = toRadians(pointB.lat);
  const latDelta = toRadians(pointB.lat - pointA.lat);
  const lngDelta = toRadians(pointB.lng - pointA.lng);

  const haversine =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) * Math.sin(lngDelta / 2);

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function calculateSampleCount(distanceMeters, spacingMeters = DEFAULT_SAMPLE_SPACING_METERS, maxSamples = 320) {
  const effectiveSpacingMeters = resolveSpacingMeters(distanceMeters, spacingMeters);
  const targetSampleCount = Math.ceil(distanceMeters / effectiveSpacingMeters) + 1;
  return Math.max(2, Math.min(maxSamples, Math.max(MIN_SAMPLE_COUNT, targetSampleCount)));
}

function resolveSpacingMeters(distanceMeters, spacingMeters) {
  if (distanceMeters <= DENSE_SAMPLING_THRESHOLD_METERS) {
    return spacingMeters;
  }

  return Math.max(spacingMeters, distanceMeters / LONG_DISTANCE_SAMPLE_TARGET);
}

function interpolate(startValue, endValue, ratio) {
  return startValue + (endValue - startValue) * ratio;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}