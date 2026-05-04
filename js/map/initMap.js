import { applySelection, removeWaypointSelection, toPoint, updateWaypointSelection } from './pointSelection.js';
import { showWaypointContextMenu } from '../ui/waypointContextMenu.js';
import { createEliBasemapController } from './eliBasemapController.js';

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

function buildFeatureCollection(features = []) {
  return {
    type: 'FeatureCollection',
    features,
  };
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
  });
  const eliBasemapController = createEliBasemapController(map, appState);

  map.addControl(new maplibregl.NavigationControl(), 'top-right');

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
    ensureMapArtifacts(map, latestState);
    applyDisplayedBasemap(map, latestState);
    eliBasemapController.onStyleLoaded();
    if (!lineHoverRegistered && map.getLayer('selection-line-hit')) {
      registerLineHoverHandlers(map, appState);
      lineHoverRegistered = true;
    }
  });

  appState.subscribe((state) => {
    const basemapChanged = state.basemap !== lastBasemap;
    latestState = state;
    eliBasemapController.updateState(state);
    const source = map.getSource('selection-line');
    if (source) {
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

    markerState = syncPointMarkers(map, markerState, state, appState);

    updateHoverMarker(map, state, hoverMarker, (nextMarker) => {
      hoverMarker = nextMarker;
    });

    applyTerrainState(map, state);

    if (basemapChanged && BASEMAPS[state.basemap]?.kind === 'vector') {
      eliBasemapController.prepareForStyleChange();
      map.setStyle(BASEMAPS[state.basemap].style);
    } else {
      applyDisplayedBasemap(map, state);
      eliBasemapController.applyForState(state);
    }

    lastBasemap = state.basemap;

    document.getElementById('status-badge').textContent = state.status;
  });

  return { map };
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

  if (!map.getSource('terrain-dem')) {
    map.addSource('terrain-dem', {
      type: 'raster-dem',
      url: 'https://tiles.mapterhorn.com/tilejson.json',
      tileSize: 512,
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
        source: 'terrain-dem',
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

  applyDisplayedBasemap(map, state);
  applyTerrainState(map, state);
}

function applyTerrainState(map, state) {
  if (map.getLayer('hillshade-layer')) {
    map.setLayoutProperty('hillshade-layer', 'visibility', state.hillshadeEnabled ? 'visible' : 'none');
  }

  if (map.getSource('terrain-dem')) {
    map.setTerrain(state.terrainEnabled ? { source: 'terrain-dem', exaggeration: 1 } : null);

    if (state.terrainEnabled && map.getPitch() < 35) {
      map.easeTo({ pitch: 55, duration: 700 });
    }
  }
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
  if (!state.profileData || state.hoverSampleIndex === null) {
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