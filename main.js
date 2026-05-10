import { createAppState } from './js/state/appState.js';
import { initMap } from './js/map/initMap.js';
import { setupPointSelection } from './js/map/pointSelection.js';
import { setupProfileView } from './js/profile/profileView.js?v=20260504c';
import { createMapterhornClient } from './js/elevation/mapterhornClient.js';
import { createBuildingProfileSampler } from './js/elevation/buildingProfileSampler.js';
import { setupDirectProfileController } from './js/elevation/directProfileController.js';
import { setupContextMenu } from './js/ui/contextMenu.js';
import { setupPhotonGeocoder } from './js/utils/geocoder.js';

const BUILDING_SUPPORTED_BASEMAPS = new Set(['positron', 'dark', 'osm', 'satellite', 'eli-local']);

const appState = createAppState();
const mapApi = initMap(appState);
const mapterhornClient = createMapterhornClient();
const buildingProfileSampler = createBuildingProfileSampler();

setupPointSelection(mapApi.map, appState, mapApi);
setupProfileView(appState);
setupDirectProfileController(appState, mapterhornClient, buildingProfileSampler);
setupContextMenu(mapApi.map, appState);
setupPhotonGeocoder(mapApi.map);

const resetButton = document.getElementById('reset-points');
const basemapButtons = Array.from(document.querySelectorAll('.basemap-btn'));
const terrainToggle = document.getElementById('toggle-terrain');
const hillshadeToggle = document.getElementById('toggle-hillshade');
const buildingToggle = document.getElementById('toggle-buildings');
const buildingSourceButtons = Array.from(document.querySelectorAll('[data-building-source]'));
const buildingSourceStatus = document.getElementById('building-source-status');
const mapSettingsToggle = document.getElementById('map-settings-toggle');
const mapSettingsPanel = document.getElementById('map-settings-panel');
const mapSettingsPanelToggle = document.getElementById('map-settings-panel-toggle');
const routingNote = document.getElementById('routing-note');
const eliBasemapButton = document.getElementById('eli-basemap-button');
const eliBasemapButtonMeta = document.getElementById('eli-basemap-button-meta');
const eliBasemapButtonDetail = document.getElementById('eli-basemap-button-detail');
const eliBasemapMenu = document.getElementById('eli-basemap-menu');
const routingPanel = document.getElementById('routing-panel');
const routingPanelToggle = document.getElementById('routing-panel-toggle');
let latestUiState = appState.getState();

basemapButtons.forEach((button) => {
  button.addEventListener('click', () => {
    appState.setBasemap(button.dataset.map);
  });
});

resetButton.addEventListener('click', () => {
  appState.resetPoints();
});

terrainToggle.addEventListener('change', (event) => {
  appState.setTerrainEnabled(event.target.checked);
});

hillshadeToggle.addEventListener('change', (event) => {
  appState.setHillshadeEnabled(event.target.checked);
});

buildingToggle.addEventListener('change', (event) => {
  appState.setBuildingsEnabled(event.target.checked);
});

buildingSourceButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (button.disabled) {
      return;
    }

    appState.setBuildingSource(button.dataset.buildingSource);
    appState.setBuildingsEnabled(true);
  });
});

const syncMapSettingsToggleState = (collapsed) => {
  mapSettingsToggle.setAttribute('aria-expanded', String(!collapsed));
  mapSettingsToggle.setAttribute('title', collapsed ? 'Basemap-Panel erweitern' : 'Basemap-Panel minimieren');
  mapSettingsPanelToggle.setAttribute('aria-expanded', String(!collapsed));
  mapSettingsPanelToggle.setAttribute('title', collapsed ? 'Panel erweitern' : 'Panel minimieren');
};

const toggleMapSettingsPanel = () => {
  const nextCollapsed = mapSettingsPanel.classList.toggle('is-collapsed');
  syncMapSettingsToggleState(nextCollapsed);
};

mapSettingsToggle.addEventListener('click', toggleMapSettingsPanel);
mapSettingsPanelToggle.addEventListener('click', toggleMapSettingsPanel);

eliBasemapButton.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  event.stopPropagation();

  const { localImagery } = appState.getState();
  if (!localImagery?.choices || localImagery.choices.length < 2) {
    hideEliBasemapMenu();
    return;
  }

  showEliBasemapMenu(localImagery, event.clientX, event.clientY);
});

routingPanelToggle.addEventListener('click', () => {
  const nextCollapsed = routingPanel.classList.toggle('is-collapsed');
  routingPanelToggle.setAttribute('aria-expanded', String(!nextCollapsed));
  routingPanelToggle.setAttribute('title', nextCollapsed ? 'Panel erweitern' : 'Panel minimieren');
});

const updateBuildingSourceStatus = () => {
  if (!buildingSourceStatus) {
    return;
  }

  const buildingsSupported = BUILDING_SUPPORTED_BASEMAPS.has(latestUiState.basemap);
  if (!latestUiState.buildingsEnabled) {
    buildingSourceStatus.hidden = true;
    return;
  }

  buildingSourceStatus.hidden = false;

  if (!buildingsSupported) {
    buildingSourceStatus.textContent = 'Mit dieser Karte nicht verfuegbar.';
    return;
  }

  buildingSourceStatus.textContent = mapApi.map.getZoom() >= 14 ? 'Gebäude sichtbar.' : 'Ab Zoom 14 sichtbar.';
};

syncMapSettingsToggleState(mapSettingsPanel.classList.contains('is-collapsed'));
updateBuildingSourceStatus();

mapApi.map.on('zoom', updateBuildingSourceStatus);

appState.subscribe((state) => {
  latestUiState = state;
  if (routingNote) {
    const showRoutingNote = !state.startPoint && !state.endPoint && !state.profileData && !state.isLoading && !state.error;
    routingNote.hidden = !showRoutingNote;
    routingNote.style.display = showRoutingNote ? '' : 'none';
  }

  basemapButtons.forEach((button) => {
    button.classList.toggle('selected', button.dataset.map === state.basemap);
  });

  const localImagery = state.localImagery;
  eliBasemapButton.classList.toggle('is-unavailable', !localImagery?.isAvailable);
  eliBasemapButton.setAttribute(
    'title',
    localImagery?.choices?.length > 1
      ? 'Lokales DOP aktivieren. Rechtsklick für Auswahl.'
      : 'Lokales DOP aktivieren'
  );
  if (localImagery?.loading) {
    eliBasemapButtonMeta.textContent = 'Suche Verfügbarkeit ...';
    eliBasemapButtonDetail.textContent = 'ELI wird geladen.';
  } else if (localImagery?.isAvailable) {
    eliBasemapButtonMeta.textContent = localImagery.availableCount > 1
      ? `${localImagery.availableCount} Treffer · ${localImagery.name}`
      : localImagery.name;
    eliBasemapButtonDetail.textContent = localImagery.availableCount > 1
      ? `${localImagery.details} · Rechtsklick für Auswahl`
      : localImagery.details;
  } else if (localImagery?.choices?.some((choice) => choice.unavailableReason)) {
    eliBasemapButtonMeta.textContent = localImagery.name || 'Lokales DOP';
    eliBasemapButtonDetail.textContent = localImagery.details || 'Wegen CORS nicht darstellbar.';
  } else {
    eliBasemapButtonMeta.textContent = 'Aktuell kein lokales DOP';
    eliBasemapButtonDetail.textContent = localImagery?.details || 'Bewege die Karte in einen Bereich mit verfügbaren Luftbildern.';
  }

  if ((localImagery?.choices?.length || 0) < 2) {
    hideEliBasemapMenu();
  }

  terrainToggle.checked = state.terrainEnabled;
  hillshadeToggle.checked = state.hillshadeEnabled;
  buildingToggle.checked = state.buildingsEnabled;

  buildingSourceButtons.forEach((button) => {
    button.classList.toggle('selected', button.dataset.buildingSource === state.buildingSource);
  });

  updateBuildingSourceStatus();
});

function showEliBasemapMenu(localImagery, clientX, clientY) {
  if (!eliBasemapMenu) {
    return;
  }

  renderEliBasemapMenu(localImagery);
  eliBasemapMenu.classList.remove('hidden');

  const menuWidth = eliBasemapMenu.offsetWidth || 260;
  const menuHeight = eliBasemapMenu.offsetHeight || 220;
  const left = Math.min(clientX, window.innerWidth - menuWidth - 8);
  const top = Math.min(clientY, window.innerHeight - menuHeight - 8);

  eliBasemapMenu.style.left = `${Math.max(8, left)}px`;
  eliBasemapMenu.style.top = `${Math.max(8, top)}px`;

  setTimeout(() => {
    document.addEventListener('click', handleEliBasemapOutsideInteraction, true);
    document.addEventListener('contextmenu', handleEliBasemapOutsideInteraction, true);
  }, 0);
}

function renderEliBasemapMenu(localImagery) {
  eliBasemapMenu.replaceChildren();

  localImagery.choices.forEach((choice) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'context-menu-item eli-basemap-choice';
    if (choice.id === localImagery.selectedId) {
      button.classList.add('is-active');
    }
    if (choice.failed || choice.unavailableReason) {
      button.classList.add('is-disabled');
      button.disabled = true;
    }

    const name = document.createElement('span');
    name.className = 'eli-basemap-choice-name';
    name.textContent = choice.name;

    const meta = document.createElement('span');
    meta.className = 'eli-basemap-choice-meta';
    meta.textContent = choice.unavailableReason || choice.details;

    button.append(name, meta);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (choice.failed || choice.unavailableReason) {
        return;
      }
      hideEliBasemapMenu();
      appState.setLocalImagerySelection(choice.id);
      appState.setBasemap('eli-local');
    });

    eliBasemapMenu.append(button);
  });
}

function handleEliBasemapOutsideInteraction(event) {
  if (eliBasemapMenu && !eliBasemapMenu.contains(event.target) && event.target !== eliBasemapButton) {
    hideEliBasemapMenu();
  }
}

function hideEliBasemapMenu() {
  if (!eliBasemapMenu) {
    return;
  }

  eliBasemapMenu.classList.add('hidden');
  document.removeEventListener('click', handleEliBasemapOutsideInteraction, true);
  document.removeEventListener('contextmenu', handleEliBasemapOutsideInteraction, true);
}