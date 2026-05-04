import { renderHeightgraph } from './heightgraph.js?v=20260504b';

export function setupProfileView(appState) {
  let lastState = appState.getState();
  let resizeFrame = null;
  const canvas = document.getElementById('heightgraph-canvas');

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

  canvas.addEventListener('mousemove', (event) => {
    const state = appState.getState();
    if (!state.profileData) {
      return;
    }

    const hoverSampleIndex = renderHeightgraph.getHoverIndex(state.profileData, canvas, event);
    appState.setHoverSampleIndex(hoverSampleIndex);
  });

  canvas.addEventListener('mouseleave', () => {
    appState.setHoverSampleIndex(null);
  });
}

function updateProfileState(state) {
  const note = document.getElementById('routing-note');
  const empty = document.getElementById('profile-empty');
  const summary = document.getElementById('profile-summary');
  const canvasShell = document.getElementById('profile-canvas-shell');

  if (note) {
    const shouldHideNote = Boolean(state.startPoint || state.endPoint || state.profileData || state.isLoading || state.error);
    note.hidden = shouldHideNote;
    note.style.display = shouldHideNote ? 'none' : '';
  }

  if (state.isLoading) {
    empty.textContent = 'Mapterhorn-Daten werden geladen...';
    empty.hidden = false;
    summary.hidden = true;
    canvasShell.hidden = true;
    return;
  }

  if (!state.profileData) {
    empty.textContent = state.error || '';
    empty.hidden = !state.error;
    summary.hidden = true;
    canvasShell.hidden = true;
    return;
  }

  empty.hidden = true;
  summary.hidden = false;
  canvasShell.hidden = false;

  document.getElementById('distance-summary').textContent = formatDistance(state.profileData.stats.distanceMeters);
  document.getElementById('ascent-summary').textContent = formatHeight(state.profileData.stats.ascentMeters);
  document.getElementById('descent-summary').textContent = formatHeight(state.profileData.stats.descentMeters);
  document.getElementById('min-summary').textContent = formatHeight(state.profileData.stats.minElevation);
  document.getElementById('max-summary').textContent = formatHeight(state.profileData.stats.maxElevation);

  renderHeightgraph(state.profileData, state.hoverSampleIndex);
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