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

// One-shot deep clone of `initialState` so the constant is never aliased into
// the live state tree (in case anyone ever pushes into a nested array). All
// runtime updates use the immutable spread pattern below — listeners are
// expected to treat the state they receive as read-only.
function buildInitialState() {
  return {
    ...initialState,
    localImagery: {
      ...initialState.localImagery,
      choices: initialState.localImagery.choices.map((choice) => ({ ...choice })),
    },
    waypoints: initialState.waypoints.map((waypoint) => ({ ...waypoint })),
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
  // The state tree is immutable-by-convention: every setter below builds a
  // new state object via spread (`{ ...currentState, ... }`) and never
  // mutates the previous one. Listeners receive the live reference and must
  // treat it as read-only — this lets consumers do cheap reference-equality
  // checks on nested fields like `state.profileData` to detect actual
  // changes (vs. unrelated notifications such as hover updates).
  let state = buildInitialState();
  const listeners = new Set();

  const notify = () => {
    listeners.forEach((listener) => listener(state));
  };

  const update = (updater) => {
    const nextState = updater(state);
    if (nextState === UNCHANGED) {
      return;
    }

    state = nextState;
    state.status = formatStatus(state);
    notify();
  };

  return {
    getState() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
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