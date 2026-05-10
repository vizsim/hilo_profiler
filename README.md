# HiLo Profiler

<img src="favicon.svg" alt="HiLo Profiler logo" width="72" align="right" />

A small browser-based tool for drawing a route on a map and seeing its
elevation profile — including the buildings the route crosses, painted
on top of the terrain elevation.

Click two points (or use right-click for start, end, and waypoints), and
the app pulls terrain heights from [Mapterhorn](https://mapterhorn.com)
and building footprints from [OpenFreeMap](https://openfreemap.org)
to render a combined profile. Where the line crosses a building, the
profile shows the rooftop height and the on-map route turns orange.

> Status: **experimental** — vendored data sources, no build step, no
> backend. Hosted as a static site.

## Features

- Linear routes between start, end and waypoints (right-click to add)
- Mapterhorn-based terrain elevation profile
- OpenFreeMap-based 3D building extrusion + profile overlay
- Switchable basemaps: Positron, Dark, OSM Carto, Esri Imagery, local DOP
  (via [Editor Layer Index](https://github.com/osmlab/editor-layer-index))
- Toggle for terrain (3D landscape) and hillshade
- Custom WebGL line layer that draws the route on top of the terrain
  with per-segment color (green over open ground, orange over buildings)
- Address search via Photon
- Hover anywhere on the route — both the heightgraph and the map
  highlight the corresponding sample with terrain + building offset

## How it runs

There is no build step. Open `index.html` from any static file server:

```sh
# any of these will do
python3 -m http.server 8000
npx serve
caddy file-server -listen :8000
```

Then visit `http://localhost:8000` and click on the map.

`main.js` is loaded as an ES module so a real HTTP server is required —
opening the file via `file://` will be blocked by the browser.

## Architecture

State lives in a single immutable-by-convention store
(`js/state/appState.js`); subscribers re-render on relevant changes.
The map (MapLibre 5) is driven by the store, and the profile/heightgraph
listens to the same updates.

```
main.js
├── state/appState.js          ── single source of truth
├── map/initMap.js             ── MapLibre setup, hover hit-test
│   ├── customLineLayer.js     ── route as triangles in screen space
│   ├── buildingLayerController.js  ── 3D fill-extrusions
│   ├── eliBasemapController.js     ── local-DOP discovery
│   └── pointSelection.js
├── elevation/
│   ├── mapterhornClient.js          ── DEM tile sampling (z13, ~6 m/px)
│   ├── buildingProfileSampler.js    ── OFM building polygon hit-test
│   ├── directProfileController.js   ── orchestrates the two samplers
│   └── lineSampling.js
├── profile/
│   ├── profileView.js
│   └── heightgraph.js         ── canvas profile chart with offscreen cache
├── ui/contextMenu.js
└── utils/{geocoder,lruPromiseCache}.js
```

A few design notes:

- **Route line is a custom WebGL layer.** Standard line layers in
  MapLibre get occluded by 3D buildings under pitch; ours runs in
  screen space with depth-test off so the line stays on top.
- **Tile clients share an LRU+rejection-evicting cache.** A failed
  fetch evicts the cache key so transient backend hiccups don't
  permanently break sampling.
- **Heightgraph uses an offscreen canvas.** Static layers are
  pre-rendered once and blitted on every hover tick — only the
  hover indicator gets repainted on mousemove.

## Data

| Source | Used for | License |
| --- | --- | --- |
| [Mapterhorn](https://mapterhorn.com) | Terrain elevation tiles (Terrarium-encoded) | © Mapterhorn |
| [OpenFreeMap](https://openfreemap.org) | Vector basemap + building footprints/heights | © OpenStreetMap contributors |
| [OpenStreetMap Carto](https://www.openstreetmap.org) | Raster fallback basemap | © OpenStreetMap contributors |
| [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9) | Satellite basemap | Tiles © Esri |
| [Editor Layer Index](https://github.com/osmlab/editor-layer-index) | Local DOP layer discovery | per provider |
| [Photon](https://photon.komoot.io) | Address search | © Komoot / OpenStreetMap |

## Development

Open the project root, no install needed. Module imports are bare
relative paths; MapLibre is loaded from a CDN `<script>` tag.

`TODO.md` tracks open items by impact and effort. Recent priorities
(performance + correctness) are checked off there.

## License

No license declared yet — treat this as source-available for review
purposes only.
