const initialState = {
  basemap: 'positron',
  terrainEnabled: false,
  hillshadeEnabled: true,
  startPoint: null,
  endPoint: null,
  directLine: null,
  lineDistanceMeters: null,
  sampleCount: null,
  profileData: null,
  hoverSampleIndex: null,
  isLoading: false,
  status: 'Bereit',
  error: null,
};

function cloneState(state) {
  return {
    ...state,
    startPoint: state.startPoint ? { ...state.startPoint } : null,
    endPoint: state.endPoint ? { ...state.endPoint } : null,
    directLine: state.directLine
      ? {
          ...state.directLine,
          coordinates: state.directLine.coordinates.map((coordinate) => [...coordinate]),
        }
      : null,
    profileData: state.profileData
      ? {
          ...state.profileData,
          samples: state.profileData.samples.map((sample) => ({ ...sample })),
          elevations: [...state.profileData.elevations],
          stats: { ...state.profileData.stats },
        }
      : null,
  };
}

function formatStatus(state) {
  if (state.isLoading) {
    return 'Lade Profil';
  }

  if (state.error) {
    return state.error;
  }

  if (!state.startPoint && !state.endPoint) {
    return 'Bereit';
  }

  if (state.startPoint && !state.endPoint) {
    return 'Warte auf Ziel';
  }

  return 'Linie bereit';
}

export function createAppState() {
  let state = cloneState(initialState);
  const listeners = new Set();

  const notify = () => {
    const nextState = cloneState(state);
    listeners.forEach((listener) => listener(nextState));
  };

  const update = (updater) => {
    state = updater(cloneState(state));
    state.status = formatStatus(state);
    notify();
  };

  return {
    getState() {
      return cloneState(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(cloneState(state));
      return () => listeners.delete(listener);
    },
    setBasemap(basemap) {
      update((currentState) => ({
        ...currentState,
        basemap,
      }));
    },
    setTerrainEnabled(terrainEnabled) {
      update((currentState) => ({
        ...currentState,
        terrainEnabled,
      }));
    },
    setHillshadeEnabled(hillshadeEnabled) {
      update((currentState) => ({
        ...currentState,
        hillshadeEnabled,
      }));
    },
    setPoints({ startPoint, endPoint, directLine, lineDistanceMeters, sampleCount }) {
      update((currentState) => ({
        ...currentState,
        startPoint,
        endPoint,
        directLine,
        lineDistanceMeters,
        sampleCount,
        profileData: null,
        hoverSampleIndex: null,
        isLoading: false,
        error: null,
      }));
    },
    resetPoints() {
      update((currentState) => ({
        ...currentState,
        startPoint: null,
        endPoint: null,
        directLine: null,
        lineDistanceMeters: null,
        sampleCount: null,
        profileData: null,
        hoverSampleIndex: null,
        isLoading: false,
        error: null,
      }));
    },
    setLoading(isLoading) {
      update((currentState) => ({
        ...currentState,
        isLoading,
        error: isLoading ? null : currentState.error,
      }));
    },
    setProfileData(profileData) {
      update((currentState) => ({
        ...currentState,
        profileData,
        sampleCount: profileData?.samples.length ?? currentState.sampleCount,
        hoverSampleIndex: null,
        isLoading: false,
        error: null,
      }));
    },
    setHoverSampleIndex(hoverSampleIndex) {
      update((currentState) => {
        if (currentState.hoverSampleIndex === hoverSampleIndex) {
          return currentState;
        }

        return {
          ...currentState,
          hoverSampleIndex,
        };
      });
    },
    setError(message) {
      update((currentState) => ({
        ...currentState,
        hoverSampleIndex: null,
        isLoading: false,
        error: message,
      }));
    },
  };
}