export function buildLineState(startPoint, endPoint) {
  if (!startPoint || !endPoint) {
    return {
      directLine: null,
      lineDistanceMeters: null,
      sampleCount: null,
    };
  }

  const lineDistanceMeters = distanceBetweenPoints(startPoint, endPoint);
  const sampleCount = calculateSampleCount(lineDistanceMeters);

  return {
    directLine: {
      coordinates: [
        [startPoint.lng, startPoint.lat],
        [endPoint.lng, endPoint.lat],
      ],
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

function calculateSampleCount(distanceMeters, spacingMeters = 40, maxSamples = 320) {
  return Math.max(2, Math.min(maxSamples, Math.ceil(distanceMeters / spacingMeters) + 1));
}

function interpolate(startValue, endValue, ratio) {
  return startValue + (endValue - startValue) * ratio;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}