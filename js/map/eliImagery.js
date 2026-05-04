const ELI_URL = 'https://osmlab.github.io/editor-layer-index/imagery.geojson';

const SUPPORTED_TYPES = new Set(['tms', 'wms']);
const UNSUPPORTED_SOURCE_REASONS = {
  'LSA-DOP20': 'Wegen fehlender CORS-Header des Anbieters im Browser nicht darstellbar.',
};
const DEFAULT_OPTIONS = {
  categories: ['photo'],
  countries: ['DE'],
  excludeOsmExplicit: true,
};

let imageryCachePromise = null;

export async function loadEliImagery(options = {}) {
  if (!imageryCachePromise) {
    imageryCachePromise = fetchImageryIndex({ ...DEFAULT_OPTIONS, ...options });
  }

  return imageryCachePromise;
}

export function getAvailableImageryAt(features, lng, lat) {
  return features.filter((feature) => {
    if (!feature.geometry) {
      return true;
    }

    if (!feature.bbox || !bboxContains(feature.bbox, lng, lat)) {
      return false;
    }

    return geometryContainsLngLat(feature.geometry, lng, lat);
  });
}

export function selectBestImagery(features) {
  if (!features.length) {
    return null;
  }

  return [...features].sort(compareImagery).at(0);
}

export function toMapLibreRasterConfig(feature) {
  const properties = feature?.properties;

  if (!properties || !SUPPORTED_TYPES.has(properties.type)) {
    return null;
  }

  if (properties.type === 'tms') {
    const tiles = expandSwitchUrls(properties.url)
      .map((url) => url.replace(/\{zoom\}/g, '{z}'));

    const isTmsScheme = tiles.some((url) => url.includes('{-y}'));

    return {
      tiles: tiles.map((url) => url.replace(/\{-y\}/g, '{y}')),
      scheme: isTmsScheme ? 'tms' : 'xyz',
      tileSize: 256,
      minzoom: properties.min_zoom ?? 0,
      maxzoom: properties.max_zoom ?? 22,
      attribution: buildAttribution(properties),
    };
  }

  if (properties.type === 'wms') {
    const url = properties.url
      .replace(/\{proj\}/g, 'EPSG:3857')
      .replace(/\{width\}/g, '256')
      .replace(/\{height\}/g, '256')
      .replace(/\{bbox\}/g, '{bbox-epsg-3857}')
      .replace(/\{zoom\}/g, '{z}');

    return {
      tiles: [url],
      tileSize: 256,
      minzoom: properties.min_zoom ?? 0,
      maxzoom: properties.max_zoom ?? 22,
      attribution: buildAttribution(properties),
    };
  }

  return null;
}

export function buildImagerySummary(activeFeature, availableCount, errorMessage = '') {
  if (errorMessage) {
    return {
      loading: false,
      availableCount: 0,
      isAvailable: false,
      name: 'Lokales DOP derzeit nicht verfuegbar',
      details: errorMessage,
    };
  }

  if (!activeFeature) {
    return {
      loading: false,
      availableCount,
      isAvailable: false,
      name: 'Kein lokales DOP fuer diese Position',
      details: availableCount ? `${availableCount} Luftbildquelle(n) gefunden, aber keine wird aktuell unterstuetzt.` : 'Bewege die Karte in einen Bereich mit verfuegbaren Luftbildern.',
    };
  }

  const properties = activeFeature.properties;
  const dateLabel = formatDateRange(properties.start_date, properties.end_date);
  const zoomLabel = properties.max_zoom ? `bis Zoom ${properties.max_zoom}` : '';
  const typeLabel = properties.type ? properties.type.toUpperCase() : '';
  const parts = [dateLabel, zoomLabel, typeLabel].filter(Boolean);

  return {
    loading: false,
    availableCount,
    isAvailable: true,
    name: properties.name,
    details: parts.join(' · ') || 'Lokales Luftbild aus dem Editor Layer Index',
    attribution: buildAttributionText(properties),
    licenseUrl: properties.license_url ?? '',
  };
}

export function getStaticUnavailableReason(feature) {
  return UNSUPPORTED_SOURCE_REASONS[feature?.properties?.id] || '';
}

async function fetchImageryIndex(options) {
  const response = await fetch(ELI_URL);
  if (!response.ok) {
    throw new Error(`ELI-Download fehlgeschlagen (${response.status})`);
  }

  const collection = await response.json();
  return collection.features
    .filter((feature) => isSupportedFeature(feature, options))
    .map((feature) => enrichFeature(feature));
}

function isSupportedFeature(feature, options) {
  const properties = feature?.properties ?? {};

  if (!SUPPORTED_TYPES.has(properties.type)) {
    return false;
  }

  if (!options.categories.includes(properties.category)) {
    return false;
  }

  if (options.countries.length && properties.country_code && !options.countries.includes(properties.country_code)) {
    return false;
  }

  if (options.excludeOsmExplicit && properties.permission_osm === 'explicit') {
    return false;
  }

  if (properties.overlay || /\{apikey\}/i.test(properties.url || '')) {
    return false;
  }

  return true;
}

function enrichFeature(feature) {
  const bbox = computeGeometryBbox(feature.geometry);
  return {
    ...feature,
    bbox,
    unsupportedReason: getStaticUnavailableReason(feature),
    rank: buildRank(feature, bbox),
  };
}

function buildRank(feature, bbox) {
  const properties = feature.properties ?? {};
  const endYear = parseYear(properties.end_date);
  const startYear = parseYear(properties.start_date);
  const bboxArea = bbox ? Math.abs((bbox[2] - bbox[0]) * (bbox[3] - bbox[1])) : Number.POSITIVE_INFINITY;

  return {
    isDefault: properties.default ? 1 : 0,
    hasGeometry: feature.geometry ? 1 : 0,
    maxZoom: properties.max_zoom ?? 0,
    endYear,
    startYear,
    bboxArea,
  };
}

function compareImagery(left, right) {
  if (right.rank.isDefault !== left.rank.isDefault) {
    return right.rank.isDefault - left.rank.isDefault;
  }

  if (right.rank.hasGeometry !== left.rank.hasGeometry) {
    return right.rank.hasGeometry - left.rank.hasGeometry;
  }

  if (right.rank.maxZoom !== left.rank.maxZoom) {
    return right.rank.maxZoom - left.rank.maxZoom;
  }

  if (right.rank.endYear !== left.rank.endYear) {
    return right.rank.endYear - left.rank.endYear;
  }

  if (right.rank.startYear !== left.rank.startYear) {
    return right.rank.startYear - left.rank.startYear;
  }

  if (left.rank.bboxArea !== right.rank.bboxArea) {
    return left.rank.bboxArea - right.rank.bboxArea;
  }

  return (left.properties?.name || '').localeCompare(right.properties?.name || '', 'de');
}

function expandSwitchUrls(url) {
  const match = url.match(/\{switch:([^}]+)\}/);
  if (!match) {
    return [url];
  }

  return match[1]
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((subdomain) => url.replace(match[0], subdomain));
}

function buildAttribution(properties) {
  const text = buildAttributionText(properties);
  const url = properties.attribution?.url;
  return url ? `<a href="${url}" target="_blank" rel="noopener">${text}</a>` : text;
}

function buildAttributionText(properties) {
  return properties.attribution?.text ?? properties.name ?? 'Lokales DOP';
}

function formatDateRange(startDate, endDate) {
  if (startDate && endDate && startDate !== endDate) {
    return `${startDate} bis ${endDate}`;
  }

  return endDate || startDate || '';
}

function parseYear(value) {
  if (!value) {
    return -1;
  }

  const match = String(value).match(/\d{4}/);
  return match ? Number(match[0]) : -1;
}

function computeGeometryBbox(geometry) {
  if (!geometry) {
    return null;
  }

  const coordinates = flattenCoordinates(geometry);
  if (!coordinates.length) {
    return null;
  }

  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  coordinates.forEach(([lng, lat]) => {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  });

  return [minLng, minLat, maxLng, maxLat];
}

function flattenCoordinates(geometry) {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.flat();
  }

  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.flat(2);
  }

  return [];
}

function bboxContains(bbox, lng, lat) {
  return lng >= bbox[0] && lng <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

function geometryContainsLngLat(geometry, lng, lat) {
  if (geometry.type === 'Polygon') {
    return polygonContainsLngLat(geometry.coordinates, lng, lat);
  }

  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon) => polygonContainsLngLat(polygon, lng, lat));
  }

  return false;
}

function polygonContainsLngLat(rings, lng, lat) {
  if (!rings.length || !ringContainsLngLat(rings[0], lng, lat)) {
    return false;
  }

  for (let index = 1; index < rings.length; index += 1) {
    if (ringContainsLngLat(rings[index], lng, lat)) {
      return false;
    }
  }

  return true;
}

function ringContainsLngLat(ring, lng, lat) {
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [currentLng, currentLat] = ring[index];
    const [previousLng, previousLat] = ring[previous];
    const intersects = ((currentLat > lat) !== (previousLat > lat))
      && lng < ((previousLng - currentLng) * (lat - currentLat)) / ((previousLat - currentLat) || Number.EPSILON) + currentLng;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}