const BUILDING_LAYER_ID = 'hilo-3d-buildings';
const BUILDING_SOURCES = {
  osm: {
    supportedBasemaps: ['positron', 'dark'],
    layer: {
      source: 'openmaptiles',
      'source-layer': 'building',
      type: 'fill-extrusion',
      minzoom: 14,
      paint: {
        'fill-extrusion-color': 'hsl(35, 8%, 85%)',
        'fill-extrusion-height': {
          property: 'render_height',
          type: 'identity',
        },
        'fill-extrusion-base': {
          property: 'render_min_height',
          type: 'identity',
        },
        'fill-extrusion-opacity': 0.8,
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

    if (map.getLayer(BUILDING_LAYER_ID)) {
      return;
    }

    map.addLayer(
      {
        id: BUILDING_LAYER_ID,
        ...sourceConfig.layer,
      },
      findFirstSymbolLayerId(map)
    );
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

function findFirstSymbolLayerId(map) {
  const layers = map.getStyle()?.layers || [];
  const symbolLayer = layers.find((layer) => layer.type === 'symbol');
  return symbolLayer?.id;
}