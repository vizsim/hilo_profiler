import { buildImagerySummary, getAvailableImageryAt, getStaticUnavailableReason, loadEliImagery, selectBestImagery, toMapLibreRasterConfig } from './eliImagery.js';

const ELI_SOURCE_ID = 'eli-local-imagery-source';
const ELI_LAYER_ID = 'eli-local-imagery-layer';
const ELI_BASEMAP_KEY = 'eli-local';
const ELI_ERROR_REASONS = {
  cors: 'Quelle vom Anbieter per CORS blockiert.',
  network: 'Quelle konnte nicht geladen werden.',
};

export function createEliBasemapController(map, appState) {
  let imageryFeatures = [];
  let availableFeatures = [];
  let activeFeatureId = '';
  let latestState = appState.getState();
  let ready = false;
  let styleTransitionPending = false;
  const failedFeatureIds = new Set();

  const resolveActiveFeature = (selectedId) => {
    const viableFeatures = availableFeatures.filter((feature) => !failedFeatureIds.has(getFeatureId(feature)) && !feature.unsupportedReason);

    if (!viableFeatures.length) {
      return null;
    }

    if (selectedId) {
      const selectedFeature = viableFeatures.find((feature) => getFeatureId(feature) === selectedId);
      if (selectedFeature) {
        return selectedFeature;
      }
    }

    return selectBestImagery(viableFeatures);
  };

  const refreshForCurrentCenter = async () => {
    const center = map.getCenter();
    if (!ready) {
      appState.setLocalImageryStatus({
        loading: true,
        availableCount: 0,
        isAvailable: false,
        name: 'Suche lokales DOP ...',
        details: 'ELI wird geladen.',
      });
    }

    try {
      if (!ready) {
        imageryFeatures = await loadEliImagery();
        ready = true;
      }

      availableFeatures = getAvailableImageryAt(imageryFeatures, center.lng, center.lat);
      const activeFeature = resolveActiveFeature(latestState.localImagery?.selectedId);
      appState.setLocalImageryStatus(buildLocalImageryState(activeFeature, availableFeatures, failedFeatureIds));

      if (latestState.basemap === ELI_BASEMAP_KEY) {
        syncBasemap(activeFeature);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ELI konnte nicht geladen werden.';
      availableFeatures = [];
      appState.setLocalImageryStatus({
        ...buildImagerySummary(null, 0, message),
        selectedId: '',
        choices: [],
      });
      if (latestState.basemap === ELI_BASEMAP_KEY) {
        clearBasemap();
      }
    }
  };

  const applyForState = (state) => {
    latestState = state;

    if (styleTransitionPending) {
      if (state.basemap !== ELI_BASEMAP_KEY) {
        activeFeatureId = '';
      }
      return;
    }

    if (state.basemap !== ELI_BASEMAP_KEY) {
      clearBasemap();
      return;
    }

    const activeFeature = resolveActiveFeature(state.localImagery?.selectedId);
    if (!activeFeature) {
      clearBasemap();
      return;
    }

    syncBasemap(activeFeature);
  };

  const syncBasemap = (feature) => {
    if (styleTransitionPending || !map.getStyle()) {
      return;
    }

    if (!feature) {
      clearBasemap();
      return;
    }

    const nextFeatureId = feature.properties?.id || feature.properties?.name || '';
    if (nextFeatureId === activeFeatureId && map.getLayer(ELI_LAYER_ID) && map.getSource(ELI_SOURCE_ID)) {
      ensureVisible();
      return;
    }

    const rasterConfig = toMapLibreRasterConfig(feature);
    if (!rasterConfig) {
      clearBasemap();
      return;
    }

    clearBasemap();
    map.addSource(ELI_SOURCE_ID, {
      type: 'raster',
      tiles: rasterConfig.tiles,
      tileSize: rasterConfig.tileSize,
      attribution: rasterConfig.attribution,
      minzoom: rasterConfig.minzoom,
      maxzoom: rasterConfig.maxzoom,
      ...(rasterConfig.scheme ? { scheme: rasterConfig.scheme } : {}),
    });
    map.addLayer({
      id: ELI_LAYER_ID,
      type: 'raster',
      source: ELI_SOURCE_ID,
      layout: {
        visibility: 'visible',
      },
    }, map.getLayer('hillshade-layer') ? 'hillshade-layer' : 'selection-line');
    activeFeatureId = nextFeatureId;
  };

  const ensureVisible = () => {
    if (map.getLayer(ELI_LAYER_ID)) {
      map.setLayoutProperty(ELI_LAYER_ID, 'visibility', 'visible');
    }
  };

  const clearBasemap = () => {
    if (!map.getStyle()) {
      activeFeatureId = '';
      return;
    }

    if (map.getLayer(ELI_LAYER_ID)) {
      map.removeLayer(ELI_LAYER_ID);
    }
    if (map.getSource(ELI_SOURCE_ID)) {
      map.removeSource(ELI_SOURCE_ID);
    }
    activeFeatureId = '';
  };

  return {
    key: ELI_BASEMAP_KEY,
    refreshForCurrentCenter,
    applyForState,
    handleMapError(event) {
      if (styleTransitionPending || latestState.basemap !== ELI_BASEMAP_KEY || !activeFeatureId) {
        return;
      }

      const activeFeature = availableFeatures.find((feature) => getFeatureId(feature) === activeFeatureId);
      if (!activeFeature) {
        return;
      }

      const errorMessage = event?.error?.message || event?.message || '';
      const errorUrl = extractUrlFromError(errorMessage);
      const activeUrl = activeFeature.properties?.url || '';
      const sourceId = event?.sourceId || event?.source?.id || '';

      if (sourceId && sourceId !== ELI_SOURCE_ID) {
        return;
      }

      if (!sourceId && errorUrl && !matchesSourceUrl(activeUrl, errorUrl)) {
        return;
      }

      const reason = classifySourceError(errorMessage);
      if (!reason) {
        return;
      }

      failedFeatureIds.add(activeFeatureId);
      clearBasemap();

      const nextFeature = resolveActiveFeature(latestState.localImagery?.selectedId);
      if (nextFeature) {
        appState.setLocalImageryStatus(buildLocalImageryState(nextFeature, availableFeatures, failedFeatureIds));
        syncBasemap(nextFeature);
        return;
      }

      appState.setLocalImageryStatus(buildLocalImageryState(null, availableFeatures, failedFeatureIds, {
        name: activeFeature.properties?.name || 'Lokales DOP derzeit nicht verfuegbar',
        details: ELI_ERROR_REASONS[reason],
      }));
    },
    prepareForStyleChange() {
      styleTransitionPending = true;
      clearBasemap();
    },
    updateState(state) {
      latestState = state;
    },
    onStyleLoaded() {
      styleTransitionPending = false;
      if (latestState.basemap === ELI_BASEMAP_KEY) {
        refreshForCurrentCenter();
      }
    },
    clearBasemap,
  };
}

function getFeatureId(feature) {
  return feature?.properties?.id || feature?.properties?.name || '';
}

function describeFeature(feature) {
  const properties = feature?.properties || {};
  const dateLabel = formatDateLabel(properties.start_date, properties.end_date);
  const zoomLabel = properties.max_zoom ? `bis Zoom ${properties.max_zoom}` : '';
  const typeLabel = properties.type ? properties.type.toUpperCase() : '';
  return [dateLabel, zoomLabel, typeLabel].filter(Boolean).join(' · ') || 'Lokales Luftbild';
}

function formatDateLabel(startDate, endDate) {
  if (startDate && endDate && startDate !== endDate) {
    return `${startDate} bis ${endDate}`;
  }

  return endDate || startDate || '';
}

function classifySourceError(message) {
  const normalizedMessage = String(message || '').toLowerCase();

  if (!normalizedMessage || normalizedMessage.includes('err_aborted')) {
    return '';
  }

  if (normalizedMessage.includes('cors') || normalizedMessage.includes('access-control-allow-origin')) {
    return 'cors';
  }

  if (normalizedMessage.includes('networkerror') || normalizedMessage.includes('failed to fetch') || normalizedMessage.includes('ajaxerror')) {
    return 'network';
  }

  return '';
}

function extractUrlFromError(message) {
  const match = String(message || '').match(/https?:\/\/\S+/);
  return match ? match[0] : '';
}

function matchesSourceUrl(sourceUrl, errorUrl) {
  if (!sourceUrl || !errorUrl) {
    return false;
  }

  try {
    const source = new URL(sourceUrl.replace('{proj}', 'EPSG:3857').replace('{bbox}', '0,0,1,1').replace('{width}', '256').replace('{height}', '256'));
    const target = new URL(errorUrl);
    return source.origin === target.origin && source.pathname === target.pathname;
  } catch {
    return false;
  }
}

function buildLocalImageryState(activeFeature, availableFeatures, failedFeatureIds, override = null) {
  const viableFeatures = availableFeatures.filter((feature) => !failedFeatureIds.has(getFeatureId(feature)) && !feature.unsupportedReason);
  const blockedFeatures = availableFeatures.filter((feature) => feature.unsupportedReason);
  const failedFeatures = availableFeatures.filter((feature) => failedFeatureIds.has(getFeatureId(feature)));

  if (override) {
    return {
      loading: false,
      availableCount: availableFeatures.length,
      isAvailable: false,
      selectedId: '',
      name: override.name,
      details: override.details,
      choices: buildChoices(availableFeatures, failedFeatureIds),
    };
  }

  if (activeFeature) {
    return {
      ...buildImagerySummary(activeFeature, availableFeatures.length),
      selectedId: getFeatureId(activeFeature),
      choices: buildChoices(availableFeatures, failedFeatureIds),
    };
  }

  if (!availableFeatures.length) {
    return {
      ...buildImagerySummary(null, 0),
      selectedId: '',
      choices: [],
    };
  }

  if (!viableFeatures.length && blockedFeatures.length && !failedFeatures.length) {
    const blockedFeature = blockedFeatures[0];
    return {
      loading: false,
      availableCount: availableFeatures.length,
      isAvailable: false,
      selectedId: '',
      name: blockedFeature.properties?.name || 'Lokales DOP verfuegbar',
      details: blockedFeature.unsupportedReason,
      choices: buildChoices(availableFeatures, failedFeatureIds),
    };
  }

  return {
    ...buildImagerySummary(null, availableFeatures.length),
    selectedId: '',
    choices: buildChoices(availableFeatures, failedFeatureIds),
  };
}

function buildChoices(availableFeatures, failedFeatureIds) {
  return availableFeatures.map((feature) => ({
    id: getFeatureId(feature),
    name: feature.properties?.name || 'Unbenannte Quelle',
    details: describeFeature(feature),
    failed: failedFeatureIds.has(getFeatureId(feature)),
    unavailableReason: feature.unsupportedReason || '',
  }));
}