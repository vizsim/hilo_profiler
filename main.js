import { createAppState } from './js/state/appState.js';
import { initMap } from './js/map/initMap.js';
import { setupPointSelection } from './js/map/pointSelection.js';
import { setupProfileView } from './js/profile/profileView.js';
import { createMapterhornClient } from './js/elevation/mapterhornClient.js';
import { setupDirectProfileController } from './js/elevation/directProfileController.js';

const appState = createAppState();
const mapApi = initMap(appState);
const mapterhornClient = createMapterhornClient();

setupPointSelection(mapApi.map, appState, mapApi);
setupProfileView(appState);
setupDirectProfileController(appState, mapterhornClient);

const resetButton = document.getElementById('reset-points');
const basemapButtons = Array.from(document.querySelectorAll('.basemap-btn'));
const terrainToggle = document.getElementById('toggle-terrain');
const hillshadeToggle = document.getElementById('toggle-hillshade');
const mapSettingsToggle = document.getElementById('map-settings-toggle');
const mapSettingsPanel = document.getElementById('map-settings-panel');

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

mapSettingsToggle.addEventListener('click', () => {
  const nextCollapsed = mapSettingsPanel.classList.toggle('is-collapsed');
  mapSettingsToggle.setAttribute('aria-expanded', String(!nextCollapsed));
});

appState.subscribe((state) => {
  basemapButtons.forEach((button) => {
    button.classList.toggle('selected', button.dataset.map === state.basemap);
  });
  terrainToggle.checked = state.terrainEnabled;
  hillshadeToggle.checked = state.hillshadeEnabled;
});