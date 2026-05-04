import { samplePathBetweenPoints } from './lineSampling.js';
import { buildProfileStats } from '../profile/profileStats.js';

export function setupDirectProfileController(appState, mapterhornClient) {
  let lastSelectionKey = '';
  let activeRequestId = 0;

  appState.subscribe(async (state) => {
    const selectionKey = buildSelectionKey(state.startPoint, state.endPoint, state.waypoints);

    if (selectionKey === lastSelectionKey) {
      return;
    }

    lastSelectionKey = selectionKey;

    if (!state.startPoint || !state.endPoint) {
      return;
    }

    const requestId = activeRequestId + 1;
    activeRequestId = requestId;

    try {
      appState.setLoading(true);
      const samples = samplePathBetweenPoints(state.startPoint, state.endPoint, state.waypoints);
      const result = await mapterhornClient.sampleProfile(samples);

      if (requestId !== activeRequestId) {
        return;
      }

      const stats = buildProfileStats(samples, result.elevations);
      appState.setProfileData({
        samples,
        elevations: result.elevations,
        stats,
      });
    } catch (error) {
      if (requestId !== activeRequestId) {
        return;
      }

      appState.setError(error.message || 'Das Hoehenprofil konnte nicht geladen werden.');
    }
  });
}

function buildSelectionKey(startPoint, endPoint, waypoints = []) {
  if (!startPoint || !endPoint) {
    return '';
  }

  const waypointKey = waypoints.map((waypoint) => `${waypoint.lng},${waypoint.lat}`).join('|');
  return `${startPoint.lng},${startPoint.lat}:${waypointKey}:${endPoint.lng},${endPoint.lat}`;
}