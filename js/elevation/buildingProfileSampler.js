import Protobuf from 'https://esm.sh/pbf@4.0.1';
import { VectorTile } from 'https://esm.sh/@mapbox/vector-tile@2.0.3';
import { lonLatToTileSample } from './terrarium.js';

const BUILDING_TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
const BUILDING_TILE_SIZE = 512;
const BUILDING_TILE_ZOOM = 14;
const BUILDING_SOURCE_LAYER = 'building';
const DEFAULT_BUILDING_HEIGHT = 12;

export function createBuildingProfileSampler() {
  const tileCache = new Map();
  let tileTemplatePromise = null;

  return {
    async sampleProfile(samples) {
      const buildingOffsets = await Promise.all(
        samples.map((sample) => sampleBuildingOffsetAtPoint(sample.lng, sample.lat))
      );

      return {
        buildingOffsets,
      };
    },
  };

  async function sampleBuildingOffsetAtPoint(lng, lat) {
    const { tileX, tileY } = lonLatToTileSample(lng, lat, BUILDING_TILE_ZOOM, BUILDING_TILE_SIZE);
    const buildings = await getBuildingsForTile(tileX, tileY);

    for (const building of buildings) {
      if (!containsLngLat(building.bounds, lng, lat)) {
        continue;
      }

      if (geometryContainsPoint(building.geometry, lng, lat)) {
        return building.height;
      }
    }

    return 0;
  }

  async function getBuildingsForTile(tileX, tileY) {
    const cacheKey = `${BUILDING_TILE_ZOOM}/${tileX}/${tileY}`;
    if (!tileCache.has(cacheKey)) {
      tileCache.set(cacheKey, loadTileBuildings(BUILDING_TILE_ZOOM, tileX, tileY));
    }

    return tileCache.get(cacheKey);
  }

  async function loadTileBuildings(zoom, tileX, tileY) {
    const tileUrlTemplate = await getTileUrlTemplate();
    const tileUrl = tileUrlTemplate
      .replace('{z}', String(zoom))
      .replace('{x}', String(tileX))
      .replace('{y}', String(tileY));

    const response = await fetch(tileUrl);
    if (!response.ok) {
      return [];
    }

    const tile = new VectorTile(new Protobuf(new Uint8Array(await response.arrayBuffer())));
    const layer = tile.layers[BUILDING_SOURCE_LAYER];
    if (!layer) {
      return [];
    }

    const buildings = [];
    for (let index = 0; index < layer.length; index += 1) {
      const feature = layer.feature(index);
      const geojson = feature.toGeoJSON(tileX, tileY, zoom);
      const height = getBuildingHeight(geojson.properties);

      if (!(height > 0)) {
        continue;
      }

      buildings.push({
        geometry: geojson.geometry,
        bounds: getGeometryBounds(geojson.geometry),
        height,
      });
    }

    return buildings;
  }

  async function getTileUrlTemplate() {
    if (!tileTemplatePromise) {
      tileTemplatePromise = fetch(BUILDING_TILEJSON_URL)
        .then((response) => {
          if (!response.ok) {
            throw new Error('OpenFreeMap TileJSON konnte nicht geladen werden.');
          }

          return response.json();
        })
        .then((tileJson) => tileJson.tiles?.[0] || '')
        .then((tileTemplate) => {
          if (!tileTemplate) {
            throw new Error('OpenFreeMap TileJSON enthaelt kein Tiles-Template.');
          }

          return tileTemplate;
        });
    }

    return tileTemplatePromise;
  }
}

function getBuildingHeight(properties = {}) {
  const renderHeight = toFiniteNumber(properties.render_height);
  const renderMinHeight = toFiniteNumber(properties.render_min_height) ?? 0;
  return Math.max(renderHeight ?? DEFAULT_BUILDING_HEIGHT, renderMinHeight, 0);
}

function toFiniteNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function containsLngLat(bounds, lng, lat) {
  if (!bounds) {
    return false;
  }

  return lng >= bounds.minLng && lng <= bounds.maxLng && lat >= bounds.minLat && lat <= bounds.maxLat;
}

function getGeometryBounds(geometry) {
  const bounds = {
    minLng: Number.POSITIVE_INFINITY,
    minLat: Number.POSITIVE_INFINITY,
    maxLng: Number.NEGATIVE_INFINITY,
    maxLat: Number.NEGATIVE_INFINITY,
  };

  visitGeometryCoordinates(geometry, (lng, lat) => {
    bounds.minLng = Math.min(bounds.minLng, lng);
    bounds.minLat = Math.min(bounds.minLat, lat);
    bounds.maxLng = Math.max(bounds.maxLng, lng);
    bounds.maxLat = Math.max(bounds.maxLat, lat);
  });

  return bounds;
}

function visitGeometryCoordinates(geometry, visitor) {
  if (!geometry) {
    return;
  }

  if (geometry.type === 'Polygon') {
    geometry.coordinates.flat().forEach(([lng, lat]) => visitor(lng, lat));
    return;
  }

  if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.flat(2).forEach(([lng, lat]) => visitor(lng, lat));
  }
}

function geometryContainsPoint(geometry, lng, lat) {
  if (!geometry) {
    return false;
  }

  if (geometry.type === 'Polygon') {
    return polygonContainsPoint(geometry.coordinates, lng, lat);
  }

  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon) => polygonContainsPoint(polygon, lng, lat));
  }

  return false;
}

function polygonContainsPoint(rings, lng, lat) {
  if (!rings.length || !pointInRing(rings[0], lng, lat)) {
    return false;
  }

  return !rings.slice(1).some((ring) => pointInRing(ring, lng, lat));
}

function pointInRing(ring, lng, lat) {
  let isInside = false;

  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index, index += 1) {
    const [currentLng, currentLat] = ring[index];
    const [previousLng, previousLat] = ring[previousIndex];
    const intersects = ((currentLat > lat) !== (previousLat > lat))
      && (lng < ((previousLng - currentLng) * (lat - currentLat)) / ((previousLat - currentLat) || Number.EPSILON) + currentLng);

    if (intersects) {
      isInside = !isInside;
    }
  }

  return isInside;
}