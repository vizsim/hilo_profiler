import { applySelection } from './pointSelection.js';

const BASEMAPS = {
  positron: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
  osm: createRasterStyle({
    id: 'osm-carto',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: '© OpenStreetMap contributors',
  }),
  satellite: createRasterStyle({
    id: 'esri-imagery',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution: 'Tiles © Esri',
  }),
};

function buildFeatureCollection(features = []) {
  return {
    type: 'FeatureCollection',
    features,
  };
}

export function initMap(appState) {
  let activeBasemap = appState.getState().basemap;
  let latestState = appState.getState();
  let lineHoverRegistered = false;
  let markerState = {
    start: null,
    end: null,
    startKey: '',
    endKey: '',
  };
  const map = new maplibregl.Map({
    container: 'map',
    style: BASEMAPS[activeBasemap],
    center: [10.4515, 51.1657],
    zoom: 5.7,
    minZoom: 3,
    maxZoom: 18,
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  let hoverMarker = null;

  map.on('style.load', () => {
    ensureMapArtifacts(map, latestState);
    if (!lineHoverRegistered && map.getLayer('selection-line-hit')) {
      registerLineHoverHandlers(map, appState);
      lineHoverRegistered = true;
    }
  });

  appState.subscribe((state) => {
    latestState = state;
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

    if (BASEMAPS[state.basemap] && state.basemap !== activeBasemap) {
      activeBasemap = state.basemap;
      map.setStyle(BASEMAPS[state.basemap]);
    }

    document.getElementById('status-badge').textContent = state.status;
  });

  return { map };
}

function createPointMarker(point, kind, onDragEnd) {
  const element = document.createElement('div');
  element.className = `point-marker ${kind}`;
  element.style.cursor = 'grab';

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

  if (!map.getLayer('hillshade-layer')) {
    const firstSymbolLayerId = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
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
      firstSymbolLayerId
    );
  }

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
        appState.getState().endPoint
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
        { lng: Number(lngLat.lng.toFixed(6)), lat: Number(lngLat.lat.toFixed(6)) }
      );
    }).addTo(map);
    markerState.endKey = endKey;
  }

  return markerState;
}

function createRasterStyle({ id, tiles, attribution }) {
  return {
    version: 8,
    name: id,
    sources: {
      [id]: {
        type: 'raster',
        tiles,
        tileSize: 256,
        attribution,
      },
    },
    layers: [
      {
        id: `${id}-background`,
        type: 'background',
        paint: {
          'background-color': '#dde4eb',
        },
      },
      {
        id: `${id}-raster`,
        type: 'raster',
        source: id,
      },
    ],
  };
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