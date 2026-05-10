import { applySelection, removeWaypointSelection, toPoint, updateWaypointSelection } from './pointSelection.js';
import { showWaypointContextMenu } from '../ui/waypointContextMenu.js';
import { createEliBasemapController } from './eliBasemapController.js';
import { createBuildingLayerController } from './buildingLayerController.js';

const BASEMAPS = {
  positron: {
    kind: 'vector',
    style: 'https://tiles.openfreemap.org/styles/positron',
  },
  dark: {
    kind: 'vector',
    style: 'https://tiles.openfreemap.org/styles/dark',
  },
  osm: {
    kind: 'raster',
    sourceId: 'osm-carto-source',
    layerId: 'osm-carto-layer',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: '© OpenStreetMap contributors',
  },
  satellite: {
    kind: 'raster',
    sourceId: 'esri-imagery-source',
    layerId: 'esri-imagery-layer',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution: 'Tiles © Esri',
  },
  'eli-local': {
    kind: 'dynamic-raster',
  },
};

const DEFAULT_SKY_STYLE = {
  'sky-color': '#199EF3',
  'sky-horizon-blend': 0.7,
  'horizon-color': '#f0f8ff',
  'horizon-fog-blend': 0.8,
  'fog-color': '#2c7fb8',
  'fog-ground-blend': 0.9,
  'atmosphere-blend': [
    'interpolate',
    ['linear'],
    ['zoom'],
    0,
    1,
    12,
    0,
  ],
};

const SKY_STYLES = {
  dark: {
    'sky-color': '#17152c',
    'sky-horizon-blend': 0.8,
    'horizon-color': '#100d36',
    'horizon-fog-blend': 0.8,
    'fog-color': '#282454',
    'fog-ground-blend': 0.85,
  },
};

const SKY_SYNC_TIMEOUT_KEY = '__hiloSkySyncTimeout';
const SKY_SYNC_STATE_KEY = '__hiloSkySyncState';
const SKY_APPLIED_STATE_KEY = '__hiloSkyAppliedState';
const STYLE_SWITCH_PENDING_KEY = '__hiloStyleSwitchPending';
const STYLE_REHYDRATE_TIMEOUT_KEY = '__hiloStyleRehydrateTimeout';
const TERRAIN_SOURCE_MAXZOOM = 18;
const CUSTOM_RUNTIME_LAYER_IDS = new Set([
  'osm-carto-layer',
  'esri-imagery-layer',
  'eli-local-imagery-layer',
  'hilo-3d-buildings',
  'selection-line',
  'selection-line-buildings',
  'selection-line-hit',
  'hillshade-layer',
]);

function buildFeatureCollection(features = []) {
  return {
    type: 'FeatureCollection',
    features,
  };
}

function getDirectLineKey(directLine) {
  if (!directLine?.coordinates?.length) {
    return '';
  }

  return directLine.coordinates.map((coordinate) => coordinate.join(',')).join('|');
}

function buildOverBuildingLineFeatures(profileData) {
  const samples = profileData?.samples;
  const offsets = profileData?.buildingOffsets;
  if (!samples?.length || !offsets?.length || samples.length < 2) {
    return [];
  }

  const features = [];
  let currentCoords = null;

  for (let index = 0; index < samples.length - 1; index += 1) {
    const overBuilding = (offsets[index] > 0) || (offsets[index + 1] > 0);
    if (overBuilding) {
      if (!currentCoords) {
        currentCoords = [[samples[index].lng, samples[index].lat]];
      }
      currentCoords.push([samples[index + 1].lng, samples[index + 1].lat]);
    } else if (currentCoords) {
      if (currentCoords.length >= 2) {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: currentCoords },
          properties: {},
        });
      }
      currentCoords = null;
    }
  }

  if (currentCoords && currentCoords.length >= 2) {
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: currentCoords },
      properties: {},
    });
  }

  return features;
}

export function initMap(appState) {
  let latestState = appState.getState();
  let lastBasemap = latestState.basemap;
  let lineHoverRegistered = false;
  let markerState = {
    start: null,
    end: null,
    waypoints: [],
    startKey: '',
    endKey: '',
    waypointKey: '',
  };
  const map = new maplibregl.Map({
    container: 'map',
    style: BASEMAPS[lastBasemap].style,
    center: [10.4515, 51.1657],
    zoom: 5.7,
    minZoom: 3,
    maxZoom: 18,
    maxPitch: 80,
  });
  let buildingLayerController;
  const eliBasemapController = createEliBasemapController(map, appState, {
    onRasterLayerVisibilityChange: () => {
      applyHostStyleLayerVisibility(map, latestState);
      buildingLayerController?.applyForState(latestState);
    },
  });
  buildingLayerController = createBuildingLayerController(map, appState);

  map.addControl(new maplibregl.NavigationControl(), 'bottom-left');
  registerMissingStyleImageFallbacks(map);

  let hoverMarker = null;

  map.on('load', () => {
    eliBasemapController.refreshForCurrentCenter();
  });

  map.on('moveend', () => {
    eliBasemapController.refreshForCurrentCenter();
  });

  map.on('error', (event) => {
    eliBasemapController.handleMapError(event);
  });

  map.on('style.load', () => {
    map[SKY_APPLIED_STATE_KEY] = null;
    const skyDelay = map[STYLE_SWITCH_PENDING_KEY] ? 300 : 0;
    hydrateStyleState(map, latestState, eliBasemapController, buildingLayerController, { skyDelay });
    map[STYLE_SWITCH_PENDING_KEY] = false;
    if (!lineHoverRegistered && map.getLayer('selection-line-hit')) {
      registerLineHoverHandlers(map, appState);
      lineHoverRegistered = true;
    }
    scheduleStyleRehydrateRetry(map, latestState, eliBasemapController, buildingLayerController);
  });

  appState.subscribe((state) => {
    const previousState = latestState;
    const basemapChanged = state.basemap !== lastBasemap;
    const directLineChanged = getDirectLineKey(state.directLine) !== getDirectLineKey(previousState.directLine);
    const visualStateChanged = basemapChanged
      || state.terrainEnabled !== previousState.terrainEnabled
      || state.hillshadeEnabled !== previousState.hillshadeEnabled;
    const localImagerySelectionChanged = basemapChanged || state.localImagery?.selectedId !== previousState.localImagery?.selectedId;
    const buildingStateChanged = basemapChanged
      || state.terrainEnabled !== previousState.terrainEnabled
      || state.buildingsEnabled !== previousState.buildingsEnabled
      || state.buildingSource !== previousState.buildingSource;
    const profileDataChanged = state.profileData !== previousState.profileData;
    latestState = state;
    eliBasemapController.updateState(state);
    const source = map.getSource('selection-line');
    if (source && directLineChanged) {
      source.setData(
        buildFeatureCollection(
          state.directLine
            ? [
                {
                  type: 'Feature',
                  geometry: {
                    type: 'LineString',
                    coordinates: state.directLine.coordinates,
                  },
                  properties: {},
                },
              ]
            : []
        )
      );
    }

    const buildingsLineSource = map.getSource('selection-line-buildings');
    if (buildingsLineSource && (profileDataChanged || directLineChanged)) {
      buildingsLineSource.setData(
        buildFeatureCollection(
          state.directLine ? buildOverBuildingLineFeatures(state.profileData) : []
        )
      );
    }

    markerState = syncPointMarkers(map, markerState, state, appState);

    updateHoverMarker(map, state, hoverMarker, (nextMarker) => {
      hoverMarker = nextMarker;
    });

    if (basemapChanged && BASEMAPS[state.basemap]?.kind === 'vector') {
      clearScheduledSkyState(map);
      map[STYLE_SWITCH_PENDING_KEY] = true;
      eliBasemapController.prepareForStyleChange();
      buildingLayerController.prepareForStyleChange();
      map.setStyle(BASEMAPS[state.basemap].style, { diff: false });
    } else {
      if (visualStateChanged) {
        restoreMapVisualState(map, state);
      }
      if (localImagerySelectionChanged) {
        eliBasemapController.applyForState(state);
      }
      if (buildingStateChanged) {
        buildingLayerController.applyForState(state);
      }
    }

    lastBasemap = state.basemap;

    document.getElementById('status-badge').textContent = state.status;
  });

  return { map };
}

function hydrateStyleState(map, state, eliBasemapController, buildingLayerController, options = {}) {
  ensureMapArtifacts(map, state);
  restoreMapVisualState(map, state, options);
  eliBasemapController.onStyleLoaded();
  eliBasemapController.applyForState(state);
  buildingLayerController.onStyleLoaded();
  buildingLayerController.applyForState(state);
}

function scheduleStyleRehydrateRetry(map, state, eliBasemapController, buildingLayerController) {
  clearStyleRehydrateRetry(map);

  const retryHydration = () => {
    if (!map.getStyle()) {
      return;
    }

    hydrateStyleState(map, state, eliBasemapController, buildingLayerController);
    map[STYLE_REHYDRATE_TIMEOUT_KEY] = null;
  };

  map.once('idle', retryHydration);
  map[STYLE_REHYDRATE_TIMEOUT_KEY] = setTimeout(retryHydration, 700);
}

function clearStyleRehydrateRetry(map) {
  if (map[STYLE_REHYDRATE_TIMEOUT_KEY]) {
    clearTimeout(map[STYLE_REHYDRATE_TIMEOUT_KEY]);
    map[STYLE_REHYDRATE_TIMEOUT_KEY] = null;
  }
}

function registerMissingStyleImageFallbacks(map) {
  map.on('styleimagemissing', (event) => {
    const circleMatch = /^circle-(\d+)$/.exec(event.id || '');
    if (!circleMatch || map.hasImage(event.id)) {
      return;
    }

    const diameter = Number.parseInt(circleMatch[1], 10);
    if (!Number.isFinite(diameter) || diameter <= 0) {
      return;
    }

    map.addImage(event.id, createCircleStyleImage(diameter));
  });
}

function createCircleStyleImage(diameter) {
  const canvas = document.createElement('canvas');
  canvas.width = diameter;
  canvas.height = diameter;

  const context = canvas.getContext('2d');
  context.clearRect(0, 0, diameter, diameter);
  context.fillStyle = 'rgba(212, 214, 216, 0.9)';
  context.beginPath();
  context.arc(diameter / 2, diameter / 2, Math.max(1, diameter / 2 - 1), 0, Math.PI * 2);
  context.fill();

  return context.getImageData(0, 0, diameter, diameter);
}

function createPointMarker(point, kind, onDragEnd, label = '') {
  const element = document.createElement('div');
  element.className = `point-marker ${kind}`;
  element.style.cursor = 'grab';

  if (label) {
    element.textContent = label;
  }

  const marker = new maplibregl.Marker({ element, anchor: 'bottom', draggable: true }).setLngLat([point.lng, point.lat]);

  marker.on('dragstart', () => {
    element.style.cursor = 'grabbing';
  });

  marker.on('dragend', () => {
    element.style.cursor = 'grab';
    onDragEnd(marker.getLngLat());
  });

  return marker;
}

function ensureMapArtifacts(map, state) {
  if (!map.getSource('selection-line')) {
    map.addSource('selection-line', {
      type: 'geojson',
      data: buildFeatureCollection(),
    });
  }

  if (!map.getSource('selection-line-buildings')) {
    map.addSource('selection-line-buildings', {
      type: 'geojson',
      data: buildFeatureCollection(),
    });
  }

  if (!map.getSource('terrain-dem')) {
    map.addSource('terrain-dem', {
      type: 'raster-dem',
      url: 'https://tiles.mapterhorn.com/tilejson.json',
      tileSize: 512,
      maxzoom: TERRAIN_SOURCE_MAXZOOM,
      encoding: 'terrarium',
      attribution: '© Mapterhorn',
    });
  }

  if (!map.getSource('hillshade-dem')) {
    map.addSource('hillshade-dem', {
      type: 'raster-dem',
      url: 'https://tiles.mapterhorn.com/tilejson.json',
      tileSize: 512,
      maxzoom: TERRAIN_SOURCE_MAXZOOM,
      encoding: 'terrarium',
      attribution: '© Mapterhorn',
    });
  }

  ensureRasterBasemapLayers(map);

  if (!map.getLayer('selection-line')) {
    map.addLayer({
      id: 'selection-line',
      type: 'line',
      source: 'selection-line',
      paint: {
        'line-color': '#145e4b',
        'line-width': 4,
        'line-opacity': 0.88,
      },
    });
  }

  if (!map.getLayer('hillshade-layer')) {
    map.addLayer(
      {
        id: 'hillshade-layer',
        type: 'hillshade',
        source: 'hillshade-dem',
        layout: {
          visibility: state.hillshadeEnabled ? 'visible' : 'none',
        },
        paint: {
          'hillshade-exaggeration': 0.35,
          'hillshade-illumination-anchor': 'map',
        },
      },
      'selection-line'
    );
  }

  if (!map.getLayer('selection-line-buildings')) {
    map.addLayer({
      id: 'selection-line-buildings',
      type: 'line',
      source: 'selection-line-buildings',
      paint: {
        'line-color': '#d97706',
        'line-width': 4,
        'line-opacity': 0.95,
      },
    });
  }

  if (!map.getLayer('selection-line-hit')) {
    map.addLayer({
      id: 'selection-line-hit',
      type: 'line',
      source: 'selection-line',
      paint: {
        'line-color': '#000000',
        'line-opacity': 0.01,
        'line-width': 18,
      },
    });
  }

  const refreshedSource = map.getSource('selection-line');
  if (refreshedSource) {
    refreshedSource.setData(
      buildFeatureCollection(
        state.directLine
          ? [
              {
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: state.directLine.coordinates,
                },
                properties: {},
              },
            ]
          : []
      )
    );
  }

  const refreshedBuildingsLineSource = map.getSource('selection-line-buildings');
  if (refreshedBuildingsLineSource) {
    refreshedBuildingsLineSource.setData(
      buildFeatureCollection(
        state.directLine ? buildOverBuildingLineFeatures(state.profileData) : []
      )
    );
  }

}

function restoreMapVisualState(map, state, options = {}) {
  applyDisplayedBasemap(map, state);
  applyHostStyleLayerVisibility(map, state);
  applyTerrainState(map, state, options);
}

function applyHostStyleLayerVisibility(map, state) {
  const style = map.getStyle();
  if (!style?.layers?.length) {
    return;
  }

  const hideHostStyleLayers = state.basemap === 'eli-local' && Boolean(map.getLayer('eli-local-imagery-layer'));

  style.layers.forEach((layer) => {
    if (CUSTOM_RUNTIME_LAYER_IDS.has(layer.id)) {
      return;
    }

    map.setLayoutProperty(layer.id, 'visibility', hideHostStyleLayers ? 'none' : 'visible');
  });
}

function applyTerrainState(map, state, options = {}) {
  if (map.getLayer('hillshade-layer')) {
    map.setLayoutProperty('hillshade-layer', 'visibility', state.hillshadeEnabled ? 'visible' : 'none');
  }

  if (map.getSource('terrain-dem')) {
    map.setTerrain(state.terrainEnabled ? { source: 'terrain-dem', exaggeration: 1 } : null);

    if (state.terrainEnabled && map.getPitch() < 50 && !map.isMoving()) {
      map.easeTo({ pitch: 60, duration: 700 });
    } else if (!state.terrainEnabled && map.getPitch() > 60 && !map.isMoving()) {
      map.easeTo({ pitch: 0, duration: 500 });
    }
  }

  scheduleSkyState(map, state, options.skyDelay ?? 0);
}

function scheduleSkyState(map, state, delay = 0) {
  if (typeof map.setSky !== 'function') {
    return;
  }

  map[SKY_SYNC_STATE_KEY] = {
    terrainEnabled: state.terrainEnabled,
    basemap: state.basemap,
    retriesRemaining: 24,
  };

  clearScheduledSkyState(map);

  const tryApplySky = () => {
    const pendingState = map[SKY_SYNC_STATE_KEY];
    if (!pendingState) {
      return;
    }

    if (!map.isStyleLoaded()) {
      if (pendingState.retriesRemaining <= 0) {
        return;
      }

      pendingState.retriesRemaining -= 1;
      map[SKY_SYNC_TIMEOUT_KEY] = setTimeout(tryApplySky, 250);
      return;
    }

    map[SKY_SYNC_TIMEOUT_KEY] = null;
    if (pendingState !== map[SKY_SYNC_STATE_KEY]) {
      return;
    }

    const nextAppliedSkyState = pendingState.terrainEnabled ? pendingState.basemap : 'off';
    if (map[SKY_APPLIED_STATE_KEY] === nextAppliedSkyState) {
      return;
    }

    map[SKY_APPLIED_STATE_KEY] = nextAppliedSkyState;
    map.setSky(pendingState.terrainEnabled ? getSkyStyleForBasemap(pendingState.basemap) : undefined);
  };

  map[SKY_SYNC_TIMEOUT_KEY] = setTimeout(tryApplySky, Math.max(0, delay));
}

function clearScheduledSkyState(map) {
  if (map[SKY_SYNC_TIMEOUT_KEY]) {
    clearTimeout(map[SKY_SYNC_TIMEOUT_KEY]);
    map[SKY_SYNC_TIMEOUT_KEY] = null;
  }
}

function getSkyStyleForBasemap(basemap) {
  return SKY_STYLES[basemap] ?? DEFAULT_SKY_STYLE;
}

function applyDisplayedBasemap(map, state) {
  Object.entries(BASEMAPS).forEach(([key, config]) => {
    if (config.kind !== 'raster' || !map.getLayer(config.layerId)) {
      return;
    }

    map.setLayoutProperty(config.layerId, 'visibility', state.basemap === key ? 'visible' : 'none');
  });
}

function updateHoverMarker(map, state, currentMarker, setMarker) {
  if (
    !state.profileData ||
    state.hoverSampleIndex === null ||
    state.hoverSampleIndex === 0 ||
    state.hoverSampleIndex === state.profileData.samples.length - 1
  ) {
    if (currentMarker) {
      currentMarker.remove();
      setMarker(null);
    }
    return;
  }

  const sample = state.profileData.samples[state.hoverSampleIndex];
  if (!sample) {
    return;
  }

  if (!currentMarker) {
    const element = document.createElement('div');
    element.className = 'hover-sample-marker';
    const marker = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat([sample.lng, sample.lat]).addTo(map);
    setMarker(marker);
    return;
  }

  currentMarker.setLngLat([sample.lng, sample.lat]);
}

function syncPointMarkers(map, markerState, state, appState) {
  const startKey = state.startPoint ? `${state.startPoint.lng},${state.startPoint.lat}` : '';
  const endKey = state.endPoint ? `${state.endPoint.lng},${state.endPoint.lat}` : '';
  const waypointKey = state.waypoints.map((waypoint) => `${waypoint.lng},${waypoint.lat}`).join('|');

  if (!startKey && markerState.start) {
    markerState.start.remove();
    markerState.start = null;
    markerState.startKey = '';
  }

  if (!endKey && markerState.end) {
    markerState.end.remove();
    markerState.end = null;
    markerState.endKey = '';
  }

  if (startKey && startKey !== markerState.startKey) {
    if (markerState.start) {
      markerState.start.remove();
    }
    markerState.start = createPointMarker(state.startPoint, 'start', (lngLat) => {
      applySelection(
        appState,
        { lng: Number(lngLat.lng.toFixed(6)), lat: Number(lngLat.lat.toFixed(6)) },
        appState.getState().endPoint,
        appState.getState().waypoints
      );
    }).addTo(map);
    markerState.startKey = startKey;
  }

  if (endKey && endKey !== markerState.endKey) {
    if (markerState.end) {
      markerState.end.remove();
    }
    markerState.end = createPointMarker(state.endPoint, 'end', (lngLat) => {
      applySelection(
        appState,
        appState.getState().startPoint,
        { lng: Number(lngLat.lng.toFixed(6)), lat: Number(lngLat.lat.toFixed(6)) },
        appState.getState().waypoints
      );
    }).addTo(map);
    markerState.endKey = endKey;
  }

  if (waypointKey !== markerState.waypointKey) {
    markerState.waypoints.forEach((marker) => marker.remove());
    markerState.waypoints = state.waypoints.map((waypoint, index) => {
      const marker = createPointMarker(
        waypoint,
        'waypoint',
        (lngLat) => {
          updateWaypointSelection(appState, index, toPoint(lngLat));
        },
        `${index + 1}`
      ).addTo(map);

      const markerElement = marker.getElement();
      markerElement.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        showWaypointContextMenu(marker, index, event, () => {
          removeWaypointSelection(appState, index);
        });
      });

      return marker;
    });
    markerState.waypointKey = waypointKey;
  }

  return markerState;
}
function findNearestSampleIndex(samples, lngLat) {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  samples.forEach((sample, index) => {
    const deltaLng = sample.lng - lngLat.lng;
    const deltaLat = sample.lat - lngLat.lat;
    const distance = deltaLng * deltaLng + deltaLat * deltaLat;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

function ensureRasterBasemapLayers(map) {
  Object.values(BASEMAPS).forEach((config) => {
    if (config.kind !== 'raster') {
      return;
    }

    if (!map.getSource(config.sourceId)) {
      map.addSource(config.sourceId, {
        type: 'raster',
        tiles: config.tiles,
        tileSize: 256,
        attribution: config.attribution,
      });
    }

    if (!map.getLayer(config.layerId)) {
      map.addLayer({
        id: config.layerId,
        type: 'raster',
        source: config.sourceId,
        layout: {
          visibility: 'none',
        },
      });
    }
  });
}

function registerLineHoverHandlers(map, appState) {
  map.on('mouseenter', 'selection-line-hit', () => {
    map.getCanvas().style.cursor = 'pointer';
  });

  map.on('mouseleave', 'selection-line-hit', () => {
    map.getCanvas().style.cursor = '';
    appState.setHoverSampleIndex(null);
  });

  map.on('mousemove', 'selection-line-hit', (event) => {
    const state = appState.getState();
    if (!state.profileData?.samples?.length) {
      return;
    }

    appState.setHoverSampleIndex(findNearestSampleIndex(state.profileData.samples, event.lngLat));
  });
}