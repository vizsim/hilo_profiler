const BUILDING_SOURCE_ID = 'hilo-buildings-source';
const BUILDING_LAYER_ID = 'hilo-3d-buildings';
const BUILDING_VECTOR_SOURCE_URL = 'https://tiles.openfreemap.org/planet';
const DEFAULT_BUILDING_OPACITY = 0.8;
const DEFAULT_BUILDING_COLOR = 'hsl(35, 8%, 85%)';
const DEFAULT_BUILDING_HEIGHT = 12;
const BUILDING_OPACITY_BY_BASEMAP = {
  'eli-local': 0.8,
};
const BUILDING_TERRAIN_OPACITY_BY_BASEMAP = {
  'eli-local': 0.8,
};
const BUILDING_COLOR_BY_BASEMAP = {
  'eli-local': 'rgba(248, 248, 244, 0.92)',
};
const BUILDING_SOURCES = {
  osm: {
    supportedBasemaps: ['positron', 'dark', 'osm', 'satellite', 'eli-local'],
    layer: {
      source: BUILDING_SOURCE_ID,
      'source-layer': 'building',
      type: 'fill-extrusion',
      minzoom: 14,
      paint: {
        'fill-extrusion-color': DEFAULT_BUILDING_COLOR,
        'fill-extrusion-height': [
          'max',
          [
            'coalesce',
            ['to-number', ['get', 'render_height']],
            DEFAULT_BUILDING_HEIGHT,
          ],
          [
            'coalesce',
            ['to-number', ['get', 'render_min_height']],
            0,
          ],
        ],
        'fill-extrusion-base': [
          'coalesce',
          ['to-number', ['get', 'render_min_height']],
          0,
        ],
        'fill-extrusion-opacity': DEFAULT_BUILDING_OPACITY,
      },
    },
  },
};

export function createBuildingLayerController(map, appState) {
  let latestState = appState.getState();
  let styleTransitionPending = false;

  const applyForState = (state) => {
    latestState = state;

    if (styleTransitionPending || !map.getStyle()) {
      return;
    }

    syncBuildingLayer();
  };

  const syncBuildingLayer = () => {
    if (!map.getStyle()) {
      return;
    }

    const sourceConfig = BUILDING_SOURCES[latestState.buildingSource];
    if (!latestState.buildingsEnabled || !sourceConfig || !sourceConfig.supportedBasemaps.includes(latestState.basemap)) {
      clearBuildingLayer();
      return;
    }

    ensureBuildingSource();

    if (map.getLayer(BUILDING_LAYER_ID)) {
      ensureBuildingLayerOrder();
      syncBuildingPaint();
      return;
    }

    map.addLayer(
      {
        id: BUILDING_LAYER_ID,
        ...sourceConfig.layer,
      },
      findBuildingInsertionLayerId(map)
    );

    ensureBuildingLayerOrder();
    syncBuildingPaint();
  };

  const syncBuildingPaint = () => {
    if (!map.getLayer(BUILDING_LAYER_ID)) {
      return;
    }

    map.setPaintProperty(BUILDING_LAYER_ID, 'fill-extrusion-color', getBuildingColorForBasemap(latestState.basemap));
    map.setPaintProperty(BUILDING_LAYER_ID, 'fill-extrusion-opacity', getBuildingOpacityForState(latestState));
  };

  const ensureBuildingSource = () => {
    if (map.getSource(BUILDING_SOURCE_ID)) {
      return;
    }

    map.addSource(BUILDING_SOURCE_ID, {
      type: 'vector',
      url: BUILDING_VECTOR_SOURCE_URL,
    });
  };

  const ensureBuildingLayerOrder = () => {
    if (!map.getLayer(BUILDING_LAYER_ID)) {
      return;
    }

    const insertionLayerId = findBuildingInsertionLayerId(map);
    if (insertionLayerId && insertionLayerId !== BUILDING_LAYER_ID) {
      map.moveLayer(BUILDING_LAYER_ID, insertionLayerId);
    }
  };

  const clearBuildingLayer = () => {
    if (!map.getStyle()) {
      return;
    }

    if (map.getLayer(BUILDING_LAYER_ID)) {
      map.removeLayer(BUILDING_LAYER_ID);
    }
  };

  return {
    applyForState,
    prepareForStyleChange() {
      styleTransitionPending = true;
      clearBuildingLayer();
    },
    onStyleLoaded() {
      styleTransitionPending = false;
      syncBuildingLayer();
    },
  };
}

function getBuildingOpacityForState(state) {
  if (state.terrainEnabled) {
    return BUILDING_TERRAIN_OPACITY_BY_BASEMAP[state.basemap] ?? BUILDING_OPACITY_BY_BASEMAP[state.basemap] ?? DEFAULT_BUILDING_OPACITY;
  }

  return BUILDING_OPACITY_BY_BASEMAP[state.basemap] ?? DEFAULT_BUILDING_OPACITY;
}

function getBuildingColorForBasemap(basemap) {
  return BUILDING_COLOR_BY_BASEMAP[basemap] ?? DEFAULT_BUILDING_COLOR;
}

function findBuildingInsertionLayerId(map) {
  if (map.getLayer('hillshade-layer')) {
    return 'hillshade-layer';
  }

  if (map.getLayer('selection-line')) {
    return 'selection-line';
  }

  const layers = map.getStyle()?.layers || [];
  const symbolLayer = layers.find((layer) => layer.type === 'symbol');
  return symbolLayer?.id;
}