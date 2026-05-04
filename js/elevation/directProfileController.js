import { sampleLineBetweenPoints } from './lineSampling.js';
import { buildProfileStats } from '../profile/profileStats.js';

export function setupDirectProfileController(appState, mapterhornClient) {
  let lastSelectionKey = '';
  let activeRequestId = 0;

  appState.subscribe(async (state) => {
    const selectionKey = buildSelectionKey(state.startPoint, state.endPoint);

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
      const samples = sampleLineBetweenPoints(state.startPoint, state.endPoint);
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

function buildSelectionKey(startPoint, endPoint) {
  if (!startPoint || !endPoint) {
    return '';
  }

  return `${startPoint.lng},${startPoint.lat}:${endPoint.lng},${endPoint.lat}`;
}