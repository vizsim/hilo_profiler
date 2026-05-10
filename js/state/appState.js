const initialState = {
  basemap: 'positron',
  buildingsEnabled: false,
  buildingSource: 'osm',
  localImagery: {
    loading: true,
    availableCount: 0,
    isAvailable: false,
    selectedId: '',
    name: 'Suche lokales DOP ...',
    details: 'ELI wird geladen.',
    attribution: '',
    licenseUrl: '',
    choices: [],
  },
  terrainEnabled: false,
  hillshadeEnabled: true,
  startPoint: null,
  endPoint: null,
  waypoints: [],
  directLine: null,
  lineDistanceMeters: null,
  sampleCount: null,
  profileData: null,
  hoverSampleIndex: null,
  isLoading: false,
  status: 'Bereit',
  error: null,
};

const UNCHANGED = Symbol('unchanged');

function cloneState(state) {
  return {
    ...state,
    localImagery: state.localImagery
      ? {
          ...state.localImagery,
          choices: (state.localImagery.choices || []).map((choice) => ({ ...choice })),
        }
      : null,
    startPoint: state.startPoint ? { ...state.startPoint } : null,
    endPoint: state.endPoint ? { ...state.endPoint } : null,
    waypoints: state.waypoints.map((waypoint) => ({ ...waypoint })),
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

function areLocalImageryStatesEqual(left, right) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  if (
    left.loading !== right.loading
    || left.availableCount !== right.availableCount
    || left.isAvailable !== right.isAvailable
    || left.selectedId !== right.selectedId
    || left.name !== right.name
    || left.details !== right.details
    || left.attribution !== right.attribution
    || left.licenseUrl !== right.licenseUrl
  ) {
    return false;
  }

  const leftChoices = left.choices || [];
  const rightChoices = right.choices || [];
  if (leftChoices.length !== rightChoices.length) {
    return false;
  }

  return leftChoices.every((choice, index) => {
    const nextChoice = rightChoices[index];
    return nextChoice
      && choice.id === nextChoice.id
      && choice.name === nextChoice.name
      && choice.details === nextChoice.details
      && choice.failed === nextChoice.failed
      && choice.unavailableReason === nextChoice.unavailableReason;
  });
}

export function createAppState() {
  let state = cloneState(initialState);
  const listeners = new Set();

  const notify = () => {
    const nextState = cloneState(state);
    listeners.forEach((listener) => listener(nextState));
  };

  const update = (updater) => {
    const nextState = updater(cloneState(state));
    if (nextState === UNCHANGED) {
      return;
    }

    state = nextState;
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
    setLocalImageryStatus(localImagery) {
      update((currentState) => {
        const nextLocalImagery = {
          ...currentState.localImagery,
          ...localImagery,
        };

        if (areLocalImageryStatesEqual(currentState.localImagery, nextLocalImagery)) {
          return UNCHANGED;
        }

        return {
          ...currentState,
          localImagery: nextLocalImagery,
        };
      });
    },
    setLocalImagerySelection(selectedId) {
      const currentChoice = state.localImagery?.choices?.find((choice) => choice.id === selectedId);

      update((currentState) => {
        if (currentState.localImagery?.selectedId === selectedId) {
          return UNCHANGED;
        }

        return {
          ...currentState,
          localImagery: {
            ...currentState.localImagery,
            selectedId,
            ...(currentChoice
              ? {
                  isAvailable: true,
                  name: currentChoice.name,
                  details: currentChoice.details,
                }
              : {}),
          },
        };
      });
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
    setBuildingsEnabled(buildingsEnabled) {
      update((currentState) => ({
        ...currentState,
        buildingsEnabled,
      }));
    },
    setBuildingSource(buildingSource) {
      update((currentState) => ({
        ...currentState,
        buildingSource,
      }));
    },
    setPoints({ startPoint, endPoint, waypoints = [], directLine, lineDistanceMeters, sampleCount }) {
      update((currentState) => ({
        ...currentState,
        startPoint,
        endPoint,
        waypoints,
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
        waypoints: [],
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
          return UNCHANGED;
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