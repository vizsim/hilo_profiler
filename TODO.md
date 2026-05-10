# TODO — Branch `buildings`

Audit-Liste aus 2026-05-10 für Performance, Robustheit und Stabilität.
Sortiert nach Impact (high → low), bei gleichem Impact nach Aufwand (S → L).

Skala
- **Impact**: high / medium / low
- **Aufwand**: S (≤30 min) · M (30 min – 2 h) · L (>2 h)

---

## Top 5 Hebel

### 1. [high | S] Mapterhorn-Sampling parallelisieren ✅

- [x] **Wo**: [js/elevation/mapterhornClient.js:10-21](js/elevation/mapterhornClient.js#L10-L21)
- **Problem**: `for (const sample of samples) { await sampleElevationAtPoint(...) }` serialisiert alle ~320 Sample-Lookups. Tile-Cache dedupliziert parallele Promises bereits korrekt.
- **Fix**: `Promise.all(samples.map(s => sampleElevationAtPoint(s.lng, s.lat)))` — analog zum Building-Sampler. Spürbar schnellerer First-Paint des Profils.

### 2. [high | S] Hex-Color-Reparsing + Allokationen pro Frame im Custom-Line-Layer ✅

- [x] **Wo**: [js/map/customLineLayer.js](js/map/customLineLayer.js), [js/map/initMap.js](js/map/initMap.js)
- **Problem**: `parseHexColor()` lief pro Segment pro Frame (~12.000 String-Parses/s bei 200 Samples × 60 fps). Dazu allokierte jeder Frame ein neues `Float32Array(...)`, neue `anchorScreens`/`vertexT`-Arrays via `.map`.
- **Fix**: initMap.js liefert pro Segment jetzt eine Referenz auf eines von zwei vorgeparsten `Object.freeze([r,g,b])`-Tupeln. Custom-Layer schreibt RGB-Werte direkt in den Vertex-Buffer (kein Parse mehr). Persistente Scratch-Buffer (positions/anchorScreen/screenPoints/miters als Float32Array) leben im Closure, wachsen mit Verdopplung und werden über `subarray()` an `bufferData` weitergegeben — keine Per-Frame-Mesh-Allokation mehr.

### 3. [high | M] Tile-Caches ohne LRU + ohne Eviction bei Fehlern
- [ ] **Wo**: [js/elevation/buildingProfileSampler.js:46-51](js/elevation/buildingProfileSampler.js#L46-L51), [js/elevation/mapterhornClient.js:39-43](js/elevation/mapterhornClient.js#L39-L43)
- **Problem**:
  - (a) `Map` wächst unbegrenzt; ein dekodiertes Z14-Building-Tile + Z12-Terrarium-RGB-ImageData kann zusammen mehrere MB sein → 100+ Tiles über eine Session = 100+ MB.
  - (b) Wenn `fetch` einmal scheitert, wird die *rejected* Promise gecached → Backend kann nicht mehr „heilen", Sampling bleibt für die Session tot.
- **Fix**: LRU-Limit (~64 Einträge) + bei Catch den Cache-Key löschen: `tileCache.set(k, p); p.catch(() => tileCache.delete(k));`

### 4. [high | M] State-Klonen pro Subscriber pro Notify
- [ ] **Wo**: [js/state/appState.js:33-62](js/state/appState.js#L33-L62), [127-141](js/state/appState.js#L127-L141)
- **Problem**: `notify()` ruft `cloneState()` einmal **pro Subscriber** auf — bei profileData mit 320 Samples + Elevations + buildingOffsets sind das hunderte Sub-Allokationen pro Notify. Hover-Bewegung auf der Karte triggert das voll, mit ~4 Subscribern.
- **Fix**: Snapshot einmal pro Notify klonen und an alle Listener weiterreichen, oder in den Listener-Pfaden Immutability per Konvention annehmen und Klonen nur bei `getState()` machen.

### 5. [high | M] Heightgraph macht Full-Repaint bei jedem Hover-Tick ✅

- [x] **Wo**: [js/profile/heightgraph.js](js/profile/heightgraph.js)
- **Problem**: Jedes State-Update inklusive Hover rief `renderHeightgraph()` auf, was `canvas.width = ...` setzte (Bitmap-Reset) und Background/Grid/Areas/Lines/Buildings/Hover komplett neu zeichnete.
- **Fix**: Statisches Profil-Layer wird einmal in einen Offscreen-Canvas vorgerendert; auf jedem Hover-Tick wird nur dieser Cache via `drawImage` in den Live-Canvas geblittet und der Hover-Indicator drüber gezeichnet. Cache-Invalidation über einen Fingerprint (Sample-Count + Stats + Größe + DPR). `canvas.width = ...` wird nur noch gesetzt, wenn die Bitmap-Größe sich tatsächlich ändert. `getHoverIndex` nutzt die gecachten Achsen, wenn der Fingerprint passt — kein nochmaliger min/max/niceStep auf jedem mousemove.

---

## Mittelgewicht

### 6. [medium | S] State-Setter ohne Equality-Check feuern unnötige Notifies
- [ ] **Wo**: [main.js:65-74](main.js#L65-L74), [js/state/appState.js:152-222](js/state/appState.js#L152-L222)
- **Problem**: Klick auf den OSM-Building-Source-Button ruft `setBuildingSource('osm')` und `setBuildingsEnabled(true)` auch wenn beides schon aktiv ist → voller Notify-Pfad.
- **Fix**: In allen Settern Equality-Check vor `update()`. `setHoverSampleIndex` macht's bereits richtig — Pattern übertragen.

### 7. [medium | S] `findBuildingInsertionLayerId` scannt linear durch Hunderte Style-Layer
- [ ] **Wo**: [js/map/buildingLayerController.js:161-173](js/map/buildingLayerController.js#L161-L173)
- **Problem**: `style.layers.find(l => l.type === 'symbol')` läuft bei jedem `applyForState`-Tick.
- **Fix**: Result einmal nach `style.load` cachen, bei Style-Switch invalidieren.

### 8. [medium | S] `BUILDING_SUPPORTED_BASEMAPS` an drei Stellen redundant
- [ ] **Wo**: [main.js:11](main.js#L11), [js/map/buildingLayerController.js:18](js/map/buildingLayerController.js#L18), implizit in `directProfileController.js`
- **Problem**: Drift-Risiko, neue Basemaps müssen synchron gepflegt werden.
- **Fix**: Single source of truth — z.B. aus `buildingLayerController` exportieren und überall importieren.

### 9. [medium | M] OFM-Cache-Key bricht bei Antimeridian/Polnähe
- [ ] **Wo**: [js/elevation/buildingProfileSampler.js:27-29](js/elevation/buildingProfileSampler.js#L27-L29), `js/elevation/terrarium.js:5-17`
- **Problem**: Kein Wrap auf `lng`, kein Clamp auf Web-Mercator-Lat-Limit (±85.0511°). Dragging eines Markers in den Pazifik oder Richtung Pol gibt 404 → rejected Promise im Cache → Sampling tot. DACH-Use-Case ist sicher, aber explorative Drag-Bewegungen können das auslösen.
- **Fix**: `lng = ((lng + 180) % 360 + 360) % 360 - 180`, `lat` auf ±85.0511° clampen.

### 10. [medium | M] Marker-Diff: alle Waypoints werden bei einem Drag zerstört + neu erstellt
- [ ] **Wo**: [js/map/initMap.js:643-666](js/map/initMap.js#L643-L666)
- **Problem**: `waypointKey`-Mismatch nach einem Drag → alle Waypoint-Marker werden `remove()`'d und neu instanziiert (inkl. Listener-Re-Registrierung).
- **Fix**: Per-Index diffen, nur bei Lng/Lat-Änderung `setLngLat` rufen.

### 11. [medium | M] Mapterhorn Z12 vs Building Z14 — Tile-Auflösung dokumentieren
- [ ] **Wo**: [js/elevation/mapterhornClient.js:3](js/elevation/mapterhornClient.js#L3), [js/elevation/buildingProfileSampler.js:7](js/elevation/buildingProfileSampler.js#L7)
- **Problem**: Z12-Terrarium = ~38 m/Pixel — limitiert die echte Profil-Auflösung, nicht das 10-m-Sample-Spacing. Inkonsistent ohne Erklärung.
- **Fix**: Begründung als Kommentar, oder Z auf 13/14 hochziehen (vier-mal mehr Tiles, aber via Cache OK).

---

## Klein / Wartbarkeit

### 12. [low | S] Globals & Debug-Hooks aufräumen
- [ ] `renderHeightgraph.lastAxes` ([heightgraph.js:50](js/profile/heightgraph.js#L50)) — niemand liest's
- [ ] `window.__heightgraphDebug` ([heightgraph.js:127](js/profile/heightgraph.js#L127)) — vergessener Debug-Hook

### 13. [low | S] Zwei Hover-Index-Implementierungen
- [ ] **Wo**: [js/map/initMap.js:671-686](js/map/initMap.js#L671-L686) (lng/lat-Distanz²) vs [js/profile/heightgraph.js:84-124](js/profile/heightgraph.js#L84-L124) (`distanceMeters`)
- **Fix**: In ein gemeinsames Helper-Modul ziehen.

### 14. [low | S] `URL.createObjectURL` ohne Revoke im Mapterhorn-Fallback
- [ ] **Wo**: [js/elevation/mapterhornClient.js:72-77](js/elevation/mapterhornClient.js#L72-L77)
- **Problem**: Im non-`createImageBitmap`-Fallback wird ObjectURL erstellt aber nie freigegeben. Auf modernen Browsern dead code, aber leakt sonst.
- **Fix**: `image.onload = () => { URL.revokeObjectURL(image.src); resolve(image); }`

### 15. [low | S] Hex-Validierung still bei Form-Mismatch
- [ ] **Wo**: [js/map/customLineLayer.js:187-197](js/map/customLineLayer.js#L187-L197)
- **Problem**: Akzeptiert nur exakt `#rrggbb`, fällt sonst still auf `[1,1,1]` (weiß) zurück → schwarze/glitchy Linien sind schwer zu debuggen.
- **Fix**: `/^#[0-9a-f]{6}$/i` validieren + `console.warn` bei Fehlschlag.

---

## Was robust gelöst ist 👍

- **Race-Condition zwischen überlappenden Profil-Requests** ist sauber via `activeRequestId` abgesichert.
- **Building-Sampling-Failures** fallen graceful auf Terrain-only zurück (`buildingOffsets: 0` bei catch).
- **Custom-Layer überlebt Style-Switch**: `prepareForStyleChange` + `ensureCustomLineOverlays` auf jedem `style.load`.
- **`selectionKey`-Cache** in `directProfileController` verhindert Re-Sampling bei irrelevanten State-Änderungen.
- **`UNCHANGED`-Sentinel** für No-Op-Updates ist da (nur leider nicht überall genutzt — siehe #6).

---

## TL;DR — größter Hebel zuerst

| # | Punkt | Impact | Aufwand |
|---|---|---|---|
| 1 | Mapterhorn parallelisieren | high | S |
| 2 | Custom-Layer-Allocations / Hex-Caching | high | S |
| 3 | LRU + rejected-Promise-Eviction in Tile-Caches | high | M |
| 4 | State-Klon pro Notify reduzieren | high | M |
| 5 | Heightgraph Offscreen-Render | high | M |
