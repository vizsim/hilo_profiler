import { samplePathBetweenPoints } from './lineSampling.js';
import { buildProfileStats } from '../profile/profileStats.js';

export function setupDirectProfileController(appState, mapterhornClient, buildingProfileSampler) {
  let lastSelectionKey = '';
  let activeRequestId = 0;

  appState.subscribe(async (state) => {
    const selectionKey = buildSelectionKey(state);

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
      const shouldIncludeBuildings = state.buildingsEnabled && state.buildingSource === 'osm';
      const [terrainResult, buildingResult] = await Promise.all([
        mapterhornClient.sampleProfile(samples),
        shouldIncludeBuildings
          ? buildingProfileSampler.sampleProfile(samples).catch(() => ({
              buildingOffsets: samples.map(() => 0),
            }))
          : Promise.resolve({
              buildingOffsets: samples.map(() => 0),
            }),
      ]);

      if (requestId !== activeRequestId) {
        return;
      }

      const terrainElevations = terrainResult.elevations;
      const buildingOffsets = buildingResult.buildingOffsets;
      const combinedElevations = terrainElevations.map((terrainElevation, index) => {
        if (!Number.isFinite(terrainElevation)) {
          return terrainElevation;
        }

        return terrainElevation + (buildingOffsets[index] || 0);
      });

      const stats = buildProfileStats(samples, combinedElevations);
      appState.setProfileData({
        samples,
        elevations: combinedElevations,
        terrainElevations,
        buildingOffsets,
        stats,
      });
    } catch (error) {
      if (requestId !== activeRequestId) {
        return;
      }

      appState.setError(error.message || 'Das Höhenprofil konnte nicht geladen werden.');
    }
  });
}

function buildSelectionKey(state) {
  const { startPoint, endPoint, waypoints = [], buildingsEnabled, buildingSource } = state;
  if (!startPoint || !endPoint) {
    return '';
  }

  const waypointKey = waypoints.map((waypoint) => `${waypoint.lng},${waypoint.lat}`).join('|');
  return `${startPoint.lng},${startPoint.lat}:${waypointKey}:${endPoint.lng},${endPoint.lat}:${buildingsEnabled}:${buildingSource}`;
}