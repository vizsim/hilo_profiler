import { buildLineState, distanceBetweenPoints } from '../elevation/lineSampling.js';

export function toPoint(lngLat) {
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
  document.getElementById('line-readout').textContent = formatLineLabel(state);
}

function formatLineLabel(state) {
  if (!state.lineDistanceMeters) {
    return 'Warten auf zwei Punkte';
  }

  if (!state.waypoints.length) {
    return `${formatDistance(state.lineDistanceMeters)} direkte Distanz`;
  }

  return `${formatDistance(state.lineDistanceMeters)} ueber ${state.waypoints.length} Zwischenpunkte`;
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

    applySelection(appState, startPoint, endPoint, state.waypoints);
  });

  appState.subscribe((state) => {
    syncReadouts(state);
  });
}

export function applySelection(appState, startPoint, endPoint, waypoints = []) {
  const lineState = buildLineState(startPoint, endPoint, waypoints);
  appState.setPoints({
    startPoint,
    endPoint,
    waypoints,
    directLine: lineState.directLine,
    lineDistanceMeters: lineState.lineDistanceMeters,
    sampleCount: lineState.sampleCount,
  });
}

export function addWaypointSelection(appState, waypoint, insertIndex) {
  const state = appState.getState();
  const waypoints = [...state.waypoints];

  if (Number.isInteger(insertIndex)) {
    waypoints.splice(insertIndex, 0, waypoint);
  } else {
    waypoints.push(waypoint);
  }

  applySelection(appState, state.startPoint, state.endPoint, waypoints);
}

export function updateWaypointSelection(appState, waypointIndex, nextWaypoint) {
  const state = appState.getState();
  const waypoints = state.waypoints.map((waypoint, index) => (index === waypointIndex ? nextWaypoint : waypoint));
  applySelection(appState, state.startPoint, state.endPoint, waypoints);
}

export function removeWaypointSelection(appState, waypointIndex) {
  const state = appState.getState();
  const waypoints = state.waypoints.filter((_, index) => index !== waypointIndex);
  applySelection(appState, state.startPoint, state.endPoint, waypoints);
}

export function setStartSelection(appState, startPoint) {
  const state = appState.getState();
  applySelection(appState, startPoint, state.endPoint, state.waypoints);
}

export function setEndSelection(appState, endPoint) {
  const state = appState.getState();
  applySelection(appState, state.startPoint, endPoint, state.waypoints);
}