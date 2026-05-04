const BASEMAPS = {
  positron: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

function buildFeatureCollection(features = []) {
  return {
    type: 'FeatureCollection',
    features,
  };
}

export function initMap(appState) {
  let activeBasemap = appState.getState().basemap;
  const map = new maplibregl.Map({
    container: 'map',
    style: BASEMAPS[activeBasemap],
    center: [10.4515, 51.1657],
    zoom: 5.7,
    minZoom: 3,
    maxZoom: 18,
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  let currentMarkers = [];

  map.on('load', () => {
    map.addSource('selection-line', {
      type: 'geojson',
      data: buildFeatureCollection(),
    });

    map.addLayer({
      id: 'selection-line',
      type: 'line',
      source: 'selection-line',
      paint: {
        'line-color': '#145e4b',
        'line-width': 4,
        'line-opacity': 0.88,
      },
    });
  });

  appState.subscribe((state) => {
    const source = map.getSource('selection-line');
    if (source) {
      source.setData(
        buildFeatureCollection(
          state.directLine
            ? [
                {
                  type: 'Feature',
                  geometry: {
                    type: 'LineString',
                    coordinates: state.directLine.coordinates,
                  },
                  properties: {},
                },
              ]
            : []
        )
      );
    }

    currentMarkers.forEach((marker) => marker.remove());
    currentMarkers = [];

    if (state.startPoint) {
      currentMarkers.push(createPointMarker(state.startPoint, 'start').addTo(map));
    }

    if (state.endPoint) {
      currentMarkers.push(createPointMarker(state.endPoint, 'end').addTo(map));
    }

    if (BASEMAPS[state.basemap] && state.basemap !== activeBasemap) {
      activeBasemap = state.basemap;
      map.setStyle(BASEMAPS[state.basemap]);
      map.once('style.load', () => {
        if (!map.getSource('selection-line')) {
          map.addSource('selection-line', {
            type: 'geojson',
            data: buildFeatureCollection(),
          });
        }

        if (!map.getLayer('selection-line')) {
          map.addLayer({
            id: 'selection-line',
            type: 'line',
            source: 'selection-line',
            paint: {
              'line-color': '#145e4b',
              'line-width': 4,
              'line-opacity': 0.88,
            },
          });
        }

        const refreshedSource = map.getSource('selection-line');
        if (refreshedSource && state.directLine) {
          refreshedSource.setData(
            buildFeatureCollection([
              {
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: state.directLine.coordinates,
                },
                properties: {},
              },
            ])
          );
        }
      });
    }

    document.getElementById('status-badge').textContent = state.status;
  });

  return { map };
}

function createPointMarker(point, kind) {
  const element = document.createElement('div');
  element.className = `point-marker ${kind}`;

  return new maplibregl.Marker({ element, anchor: 'bottom' }).setLngLat([point.lng, point.lat]);
}