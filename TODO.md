# TODO — Branch `buildings`

Letztes Update: 2026-05-10
Sortiert nach Impact (high → low), bei gleichem Impact nach Aufwand (S → L).

Skala

- **Impact**: high / medium / low
- **Aufwand**: S (≤30 min) · M (30 min – 2 h) · L (>2 h)

---

## Top 5 Hebel

### 1. [high | M] Custom-line-layer manueller Projektions-Pfad ist toter Code in MapLibre 5.24 ✅

- [x] **Wo**: [js/map/customLineLayer.js](js/map/customLineLayer.js), neu: [js/map/screenProjection.js](js/map/screenProjection.js); Hover-Hit-Test in [js/map/initMap.js](js/map/initMap.js) zieht nach
- **Problem**: `transform.pixelMatrix` und `transform.locationCoordinate` existieren in MapLibre 5.24 nicht — der `hasManualProjection`-Branch lief nie, der Layer fiel auf `map.project` zurück und mit aktivem Terrain zigzagte die Linie wieder dem Gelände nach. `valid`-Buffer-Logik mit w-Check war effektiv unbenutzt.
- **Fix**: Die neue MapLibre-5-Projektions-API gefunden via Source-Recherche (`v5.24.0/src/geo/projection/mercator_transform.ts`): `transform.mercatorMatrix` (public getter) + `maplibregl.MercatorCoordinate.fromLngLat()` (global verfügbar). Im customLineLayer-Hot-Path inline angewandt: `mercatorMatrix * mercatorCoord` → clip-space, `w > ε`-Check → NDC → Pixel via `transform.width/height`. Hover-Hit-Test nutzt jetzt einen gemeinsamen `projectLngLatToScreen`-Helper (mit Fallback auf `map.project` bei unbekannter MapLibre-Version), damit klick-bare Zone und sichtbare Linie auch unter Terrain identisch positioniert sind.

### 2. [medium | S] State-Setter ohne Equality-Check feuern unnötige Notifies

- [ ] **Wo**: [main.js:65-74](main.js#L65-L74), [js/state/appState.js:152-222](js/state/appState.js#L152-L222)
- **Problem**: Klick auf den OSM-Building-Source-Button ruft `setBuildingSource('osm')` und `setBuildingsEnabled(true)` auch wenn beides schon aktiv ist → Notify durchläuft alle Subscriber. Auch andere Setter (`setBasemap`, `setTerrainEnabled`, etc.) haben keinen Check. Mit dem cloneState-Fix (alt #4) ist der Pro-Notify-Schaden klein, aber Subscriber wie `directProfileController` müssen trotzdem ihren Selection-Key vergleichen.
- **Fix**: In allen Settern vor `update()` den aktuellen Wert mit dem neuen vergleichen. `setHoverSampleIndex` und `setLocalImagerySelection` machen's bereits richtig — Pattern auf alle übertragen.

### 3. [medium | S] `findBuildingInsertionLayerId` scannt linear durch Hunderte Style-Layer

- [ ] **Wo**: [js/map/buildingLayerController.js:161-173](js/map/buildingLayerController.js#L161-L173)
- **Problem**: `style.layers.find(l => l.type === 'symbol')` läuft bei jedem `applyForState`-Tick.
- **Fix**: Result einmal nach `style.load` cachen, bei Style-Switch invalidieren.

### 4. [medium | S] `BUILDING_SUPPORTED_BASEMAPS` an mehreren Stellen redundant

- [ ] **Wo**: [main.js:11](main.js#L11), [js/map/buildingLayerController.js:18](js/map/buildingLayerController.js#L18), implizit in `directProfileController.js`
- **Problem**: Drift-Risiko, neue Basemaps müssen synchron gepflegt werden.
- **Fix**: Single source of truth — z.B. aus `buildingLayerController` exportieren und überall importieren.

### 5. [medium | M] Marker-Diff: alle Waypoints werden bei einem Drag zerstört + neu erstellt

- [ ] **Wo**: [js/map/initMap.js](js/map/initMap.js) (`syncPointMarkers`)
- **Problem**: `waypointKey`-Mismatch nach einem Drag → alle Waypoint-Marker werden `remove()`'d und neu instanziiert (inkl. Listener-Re-Registrierung). Kaum sichtbar bei wenigen Waypoints, wird mit vielen aber teuer.
- **Fix**: Per-Index diffen, nur bei Lng/Lat-Änderung `setLngLat` rufen.

---

## Mittelgewicht

### 6. [medium | M] OFM-Cache-Key bricht bei Antimeridian/Polnähe

- [ ] **Wo**: [js/elevation/buildingProfileSampler.js:27-29](js/elevation/buildingProfileSampler.js#L27-L29), `js/elevation/terrarium.js:5-17`
- **Problem**: Kein Wrap auf `lng`, kein Clamp auf Web-Mercator-Lat-Limit (±85.0511°). Dragging eines Markers in den Pazifik oder Richtung Pol gibt 404 → das LRU evicted die rejected Promise inzwischen wieder (Punkt #3 erledigt) — aber Sampling produziert weiterhin Lücken.
- **Fix**: `lng = ((lng + 180) % 360 + 360) % 360 - 180`, `lat` auf ±85.0511° clampen. Sehr unwichtig für DACH-Use-Case.

### 7. [medium | M] Mapterhorn Z12 vs Building Z14 — Tile-Auflösung dokumentieren ✅

- [x] **Wo**: [js/elevation/mapterhornClient.js](js/elevation/mapterhornClient.js)
- **Problem**: Z12 + 512px-Tiles ≈ 12 m/Pixel auf DACH-Breitengrad — limitierte die effektive Profil-Auflösung, nicht das 10-m-Sample-Spacing. Mehrere Samples landeten oft im selben Terrain-Pixel → Heightgraph zeigte Stufen statt Steigungen.
- **Fix**: `TILE_ZOOM` auf 13 hochgezogen (~6 m/Pixel in DACH) und ausführlich kommentiert. ~4× mehr Tile-Fetches, aber dank LRU-Cache (siehe #3 erledigt) verschmerzbar. Building-Sampler bleibt auf Z14, weil das Building-Layer in OFM auch dort ausgeliefert wird.

---

## Klein / Wartbarkeit

### 8. [low | S] `valid`-Buffer im customLineLayer ist effektiv tot

- [ ] **Wo**: [js/map/customLineLayer.js:65-72](js/map/customLineLayer.js#L65-L72) und überall wo `valid` verwendet wird
- **Problem**: Diente dem manuellen w-Check, der in 5.24 nicht aktiv ist (siehe #1). Im Fallback-Pfad ist `valid` immer `1` außer bei NaN. Erst wenn #1 gefixt ist hat das wieder Substanz — kann bis dahin als Defensive bleiben oder rausgeworfen werden.
- **Fix**: Entweder wegwerfen, oder im Zuge von #1 wieder aktivieren.

### 9. [low | S] `URL.createObjectURL` ohne Revoke im Mapterhorn-Fallback

- [ ] **Wo**: [js/elevation/mapterhornClient.js:72-77](js/elevation/mapterhornClient.js#L72-L77)
- **Problem**: Im non-`createImageBitmap`-Fallback wird ObjectURL erstellt aber nie freigegeben. Auf modernen Browsern dead code, aber leakt sonst.
- **Fix**: `image.onload = () => { URL.revokeObjectURL(image.src); resolve(image); }`

### 10. [low | S] Hex-Validierung still bei Form-Mismatch

- [ ] **Wo**: [js/map/customLineLayer.js:236-247](js/map/customLineLayer.js#L236-L247)
- **Problem**: Akzeptiert nur exakt `#rrggbb`, fällt sonst still auf `[1,1,1]` (weiß) zurück. Risiko ist klein, weil der Hot-Path inzwischen vorgeparste RGB-Tupel bekommt — `parseHexColor` läuft nur noch einmal beim Layer-Setup für die Default-Farbe.
- **Fix**: `/^#[0-9a-f]{6}$/i` validieren + `console.warn` bei Fehlschlag.

---

## Erledigt ✅

- **Mapterhorn-Sampling parallelisiert** (`Promise.all` statt `for…await`)
- **Custom-Line-Layer Per-Frame-Allokationen + Hex-Reparsing eliminiert** (persistente Float32Array-Scratch-Buffer, vorgeparste RGB-Tupel)
- **Tile-Caches mit LRU-Limit + rejected-Promise-Eviction** (gemeinsamer `createLruPromiseCache`-Helper, Bonus: TileJSON-Promise resettet sich bei Fehler)
- **State-Klonen pro Notify entfernt** (Listener bekommen Live-Referenz, immutable-by-Konvention; Bonus: `state.profileData !== prevState.profileData`-Reference-Equality funktioniert jetzt korrekt)
- **Heightgraph Offscreen-Render** (statisches Profil ein einmal in Offscreen-Canvas vorgerendert, Hover-Tick blittet nur + zeichnet Indicator drüber)
- **Building-Sampler nimmt max-Höhe statt First-Match** (mehrere überlappende OFM-Polygone werden korrekt aggregiert)
- **Map-Hover via Screen-Space-Hit-Test** (statt Layer-basiertem Hit-Layer mit Terrain-Drape — klick-bare Zone passt jetzt zur sichtbaren Linie, 50 px Toleranz)
- **Right-Click-Drag suppress Kontextmenü** (3D-Rotation per Rechtsklick öffnet kein Menü mehr beim Loslassen)
- **NavigationControl Compass setzt Pitch zurück** (`visualizePitch: true`)
- **Building-Status-Text bei Zoom ≥ 14 ausblenden**
- **Globals und Debug-Hooks im Heightgraph entfernt** (`renderHeightgraph.lastAxes`, `window.__heightgraphDebug`)
- **Tote Helper aufgeräumt** (`findNearestSampleIndex`, `buildFeatureCollection`, `selection-line` Source + `selection-line-hit` Layer)

---

## Was robust gelöst ist 👍

- **Race-Condition zwischen überlappenden Profil-Requests** über `activeRequestId` abgesichert.
- **Building-Sampling-Failures** fallen graceful auf Terrain-only zurück.
- **Custom-Layer überlebt Style-Switch** via `prepareForStyleChange` + `ensureCustomLineOverlays` auf jedem `style.load`.
- **`selectionKey`-Cache** in `directProfileController` verhindert Re-Sampling bei irrelevanten State-Änderungen.
- **Tile-Caches** sind jetzt mit LRU + Eviction at-rejection abgesichert (siehe Erledigt).
- **State ist immutable-by-Konvention** und damit billig zu propagieren (siehe Erledigt).

---

## TL;DR — größter Hebel zuerst

| # | Punkt | Impact | Aufwand |
| --- | --- | --- | --- |
| 1 | Custom-line-layer manuelle Projektion in MapLibre 5.24 | high | M |
| 2 | State-Setter Equality-Check | medium | S |
| 3 | `findBuildingInsertionLayerId` Result cachen | medium | S |
| 4 | `BUILDING_SUPPORTED_BASEMAPS` deduplizieren | medium | S |
| 5 | Marker-Diff statt Wegwerfen-und-Neumachen | medium | M |
