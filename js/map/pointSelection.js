import { buildLineState, distanceBetweenPoints } from '../elevation/lineSampling.js';

function toPoint(lngLat) {
  return {
    lng: Number(lngLat.lng.toFixed(6)),
    lat: Number(lngLat.lat.toFixed(6)),
  };
}

function pickReplacementTarget(state, nextPoint) {
  const startDistance = distanceBetweenPoints(state.startPoint, nextPoint);
  const endDistance = distanceBetweenPoints(state.endPoint, nextPoint);

  return startDistance <= endDistance ? 'start' : 'end';
}

function syncReadouts(state) {
  document.getElementById('start-readout').textContent = formatPointLabel(state.startPoint);
  document.getElementById('end-readout').textContent = formatPointLabel(state.endPoint);
  document.getElementById('line-readout').textContent = state.lineDistanceMeters
    ? `${formatDistance(state.lineDistanceMeters)} direkte Distanz`
    : 'Warten auf zwei Punkte';
}

function formatPointLabel(point) {
  if (!point) {
    return 'Noch nicht gesetzt';
  }

  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}

function formatDistance(distanceMeters) {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  return `${(distanceMeters / 1000).toFixed(2)} km`;
}

export function setupPointSelection(map, appState) {
  map.on('click', (event) => {
    const nextPoint = toPoint(event.lngLat);
    const state = appState.getState();

    let startPoint = state.startPoint;
    let endPoint = state.endPoint;

    if (!startPoint) {
      startPoint = nextPoint;
    } else if (!endPoint) {
      endPoint = nextPoint;
    } else {
      const replacementTarget = pickReplacementTarget(state, nextPoint);
      if (replacementTarget === 'start') {
        startPoint = nextPoint;
      } else {
        endPoint = nextPoint;
      }
    }

    applySelection(appState, startPoint, endPoint);
  });

  appState.subscribe((state) => {
    syncReadouts(state);
  });
}

export function applySelection(appState, startPoint, endPoint) {
  const lineState = buildLineState(startPoint, endPoint);
  appState.setPoints({
    startPoint,
    endPoint,
    directLine: lineState.directLine,
    lineDistanceMeters: lineState.lineDistanceMeters,
    sampleCount: lineState.sampleCount,
  });
}