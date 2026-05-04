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
  const routingNote = document.getElementById('routing-note');

  if (routingNote) {
    const showRoutingNote = !state.startPoint && !state.endPoint;
    routingNote.hidden = !showRoutingNote;
    routingNote.style.display = showRoutingNote ? '' : 'none';
  }
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