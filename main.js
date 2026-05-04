import { createAppState } from './js/state/appState.js';
import { initMap } from './js/map/initMap.js';
import { setupPointSelection } from './js/map/pointSelection.js';
import { setupProfileView } from './js/profile/profileView.js';
import { createMapterhornClient } from './js/elevation/mapterhornClient.js';
import { setupDirectProfileController } from './js/elevation/directProfileController.js';
import { setupContextMenu } from './js/ui/contextMenu.js';
import { setupPhotonGeocoder } from './js/utils/geocoder.js';

const appState = createAppState();
const mapApi = initMap(appState);
const mapterhornClient = createMapterhornClient();

setupPointSelection(mapApi.map, appState, mapApi);
setupProfileView(appState);
setupDirectProfileController(appState, mapterhornClient);
setupContextMenu(mapApi.map, appState);
setupPhotonGeocoder(mapApi.map);

const resetButton = document.getElementById('reset-points');
const basemapButtons = Array.from(document.querySelectorAll('.basemap-btn'));
const terrainToggle = document.getElementById('toggle-terrain');
const hillshadeToggle = document.getElementById('toggle-hillshade');
const mapSettingsToggle = document.getElementById('map-settings-toggle');
const mapSettingsPanel = document.getElementById('map-settings-panel');
const mapSettingsPanelToggle = document.getElementById('map-settings-panel-toggle');
const routingPanel = document.getElementById('routing-panel');
const routingPanelToggle = document.getElementById('routing-panel-toggle');

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

routingPanelToggle.addEventListener('click', () => {
  const nextCollapsed = routingPanel.classList.toggle('is-collapsed');
  routingPanelToggle.setAttribute('aria-expanded', String(!nextCollapsed));
  routingPanelToggle.setAttribute('title', nextCollapsed ? 'Panel erweitern' : 'Panel minimieren');
});

syncMapSettingsToggleState(mapSettingsPanel.classList.contains('is-collapsed'));

appState.subscribe((state) => {
  basemapButtons.forEach((button) => {
    button.classList.toggle('selected', button.dataset.map === state.basemap);
  });
  terrainToggle.checked = state.terrainEnabled;
  hillshadeToggle.checked = state.hillshadeEnabled;
});