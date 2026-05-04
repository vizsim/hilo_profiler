import { renderHeightgraph } from './heightgraph.js';

const EMPTY_MESSAGE = 'Setze zwei Punkte auf der Karte, um das direkte Hoehenprofil zu laden.';

export function setupProfileView(appState) {
  let lastState = appState.getState();
  let resizeFrame = null;

  const render = (state) => {
    lastState = state;
    updateProfileState(state);
  };

  appState.subscribe(render);

  window.addEventListener('resize', () => {
    if (resizeFrame) {
      cancelAnimationFrame(resizeFrame);
    }

    resizeFrame = requestAnimationFrame(() => {
      updateProfileState(lastState);
      resizeFrame = null;
    });
  });
}

function updateProfileState(state) {
  const empty = document.getElementById('profile-empty');
  const summary = document.getElementById('profile-summary');
  const canvasShell = document.getElementById('profile-canvas-shell');

  if (state.isLoading) {
    empty.textContent = 'Mapterhorn-Daten werden geladen...';
    empty.hidden = false;
    summary.hidden = true;
    canvasShell.hidden = true;
    return;
  }

  if (!state.profileData) {
    empty.textContent = state.error || EMPTY_MESSAGE;
    empty.hidden = false;
    summary.hidden = true;
    canvasShell.hidden = true;
    return;
  }

  empty.hidden = true;
  summary.hidden = false;
  canvasShell.hidden = false;

  document.getElementById('distance-summary').textContent = formatDistance(state.profileData.stats.distanceMeters);
  document.getElementById('sample-summary').textContent = `${state.profileData.samples.length}`;
  document.getElementById('ascent-summary').textContent = formatHeight(state.profileData.stats.ascentMeters);
  document.getElementById('descent-summary').textContent = formatHeight(state.profileData.stats.descentMeters);
  document.getElementById('min-summary').textContent = formatHeight(state.profileData.stats.minElevation);
  document.getElementById('max-summary').textContent = formatHeight(state.profileData.stats.maxElevation);

  renderHeightgraph(state.profileData);
}

function formatDistance(distanceMeters) {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  return `${(distanceMeters / 1000).toFixed(2)} km`;
}

function formatHeight(heightMeters) {
  if (!Number.isFinite(heightMeters)) {
    return '-';
  }

  return `${Math.round(heightMeters)} m`;
}