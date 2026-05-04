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

const basemapSelect = document.getElementById('basemap-select');
const resetButton = document.getElementById('reset-points');

basemapSelect.addEventListener('change', (event) => {
  appState.setBasemap(event.target.value);
});

resetButton.addEventListener('click', () => {
  appState.resetPoints();
});

appState.subscribe((state) => {
  basemapSelect.value = state.basemap;
});