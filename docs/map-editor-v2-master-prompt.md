# WorldReborn Map UX — Implementation Contract

## Product goal
The map is the spatial center of WorldReborn, not a detached GIS screen. One project may contain multiple maps. One world map may contain many synchronized raster and vector layers. Locations are canonical world entities; map geometry is their spatial representation. NPCs reference Locations instead of owning parallel geography.

The normal workflow must be understandable without GIS knowledge. Admins work with `Land`, `Provinz`, `Region`, `Stadt`, `Ort`, `Fluss` and `Straße`. Technical concepts such as GeoJSON, geometry primitives, image paths, pixel bounds, media IDs, source types and CRS belong only in advanced controls.

## Core invariants
1. `project_maps` represents distinct spatial maps such as world, continent, region, city, building or dungeon.
2. `project_map_layers` represents visual/data layers of one map; Rock 3 themes are layers, not separate maps.
3. Rock 3 exports share the same bounds. `Satellite Color` is the preferred base image.
4. Countries, provinces and regions are polygon features; roads and rivers are lines; settlements/POIs are points.
5. A Country/City/etc. is a `Location`. Its map feature is only its geometry.
6. Placing an existing Location must link that same Location atomically; it must never create a duplicate lore entity.
7. Deleting map geometry must clear the map binding but must not delete the Location.
8. Locations form the explicit hierarchy world → continent → country → region/province → city/town/village → district → building/landmark.
9. NPC `charakters.loc_id` remains the backward-compatible primary current Location. Additional semantic locations use `person_location_assignments`.
10. Player visibility remains layer-, feature-, marker- and entity-aware. Search/navigation must not reveal hidden geography.
11. MultiPolygon remains a supported geometry type even when the simple drawing workflow creates a Polygon first.

## Implemented architecture
### Shared rendering
- `WorldMapViewer` is the common OpenLayers renderer for the main Admin map and Player map.
- It renders image/tile bases, managed-media raster layers, vector features and existing markers.
- Image-map legacy markers preserve pixel semantics (`x` horizontal, `y` vertical).
- Feature/marker focus is supported by URL parameters.
- Layer presets are available for Standard, Political, Climate, Rainfall and Topography views.
- The Player viewer receives only server-filtered visible layers, features and markers.

### Controlled Leaflet migration
The normal Admin map and Player map now use OpenLayers. Leaflet is intentionally retained only in the isolated legacy Marker Editor until marker editing reaches feature parity in OpenLayers. Do not remove that editor before coordinate and permission parity are proven.

### Map creation and collection
- Primary workflow: one Rock 3 ZIP → world map → editor.
- Subfolders inside ZIP are supported.
- Standard Rock 3 files are detected by filename and stored as managed media.
- Satellite becomes the base map; climate/terrain maps become switchable layers.
- Political, Settlements and Routes & Rivers vector layers are created automatically.
- Rock 3 maps are semantically classified as `world` via `project_maps.config.map_kind`.
- Other semantic map kinds: `continent`, `region`, `city`, `building`, `dungeon`, `other`.
- The normal map collection shows worldbuilding counts (Locations, countries, markers, layers/features) instead of technical source details.
- Tile/Image source configuration remains available only under advanced settings.

### Editor UX
The current editor uses domain tasks rather than GIS primitives:
- Land
- Provinz
- Region
- Stadt
- Ort
- Fluss
- Straße

For each task the editor automatically chooses geometry type and target content layer. The normal flow is name/color → optional `Gehört zu` → `Zeichnen beginnen` → draw on map.

Implemented interactions:
- OpenLayers Draw
- Snap to existing vector sources
- Trace existing polygon/line borders
- Modify selected geometry with autosave
- Session Undo/Redo for geometry modifications
- Non-destructive style and geometry PATCH operations that preserve player visibility assignments
- Selected-object inspector
- Direct link from mapped feature to its Location
- Explicit `Von Karte entfernen`, which preserves the lore Location
- Responsive two/three-column desktop layout and stacked mobile layout

### Parent Location UX
Parent selection is server-side searchable and filtered by meaningful hierarchy. Examples:
- Country → Continent / World
- Province/Region → Country / Continent
- City/Town/Village → Province / Region / Country
- District → City / Town

The editor no longer ships the complete Location table into a giant HTML select.

### Existing Location placement
Location pages and the Location list link unmapped Locations to the editor with `locationId`. The editor then links the newly drawn geometry to that existing Location. If the Location is already mapped, the existing feature is focused for editing instead.

### Location pages
Location pages now include:
- human-readable structural kind
- hierarchy breadcrumb/path
- spatial summary counts
- direct children
- NPC counts in the subtree
- focused map preview when mapped
- `Auf Karte anzeigen`
- `Grenze / Position bearbeiten`
- `Auf Karte platzieren` for unmapped Locations
- child creation shortcuts

Technical map/feature IDs remain only in an advanced binding section.

### NPC spatial UX
NPCs support semantic spatial roles:
- Aktueller Ort
- Wohnort / Heimat
- Geburtsort
- Arbeitsplatz
- Sitz
- Herkunft
- Temporärer Aufenthalt
- Weiterer Ort

The NPC spatial screen uses searchable Location selection, shows hierarchy context and links mapped locations directly to the focused world map. The main NPC detail page also links its primary mapped current Location to the main map.

### Search and navigation
Admin map search can find mapped Locations, NPCs, vector features and markers. Search results focus the relevant feature/marker or link to the entity.

Player map search is permission-safe: it is built exclusively from already-visible Locations, NPCs, features and markers. A hidden layer or feature is not surfaced as a map link/search target.

Dashboard, Location and NPC flows now treat the map as a first-class destination instead of requiring manual navigation through map settings.

## Rock 3 package
Recognize the standard export set:
- Satellite Color
- Biomes · Köppen-Geiger
- Rainfall · Annual Total / Equinox / Summer / Winter
- Temperature · Annual Mean / Equinox / Summer / Winter
- Terrain · Elevation Above Sea Level / Below Sea Level / Full Elevation / Land Mask

A later ZIP can update the managed Rock 3 raster layers of an existing world map without deleting political features or linked Locations. Unknown ZIP files are ignored rather than treated as fatal errors. ZIP reading has archive/entry/uncompressed-size guards and rejects encrypted/unsupported entries.

## Data model
The UX overhaul reuses the existing spatial foundation:
- `project_maps`
- `project_map_layers`
- `map_features`
- `locations`
- `person_location_assignments`
- `map_markers`

No new migration is required for the semantic `map_kind`; it is stored in `project_maps.config` for backward compatibility. Migration `0009_map_editor_v2_rock3_locations.sql` remains the required database foundation for media layers, Location map bindings and person-location assignments.

Location hierarchy validation exists at both application and database boundaries. Application path traversal tracks visited nodes so legacy cyclic data cannot cause an infinite recursive query.

## Current acceptance status
Implemented foundation:
- one-ZIP Rock 3 world creation
- automatic Satellite base and semantic raster layers
- semantic map collection/settings
- shared OpenLayers Admin/Player rendering
- player-safe layer/feature/marker rendering
- task-based country/province/region/city/place/river/road editor
- snapping and tracing
- geometry autosave
- session Undo/Redo for modifications
- atomic create-Location + feature flow
- atomic existing-Location + feature binding
- non-destructive map-geometry removal
- map search and URL focus
- map-first Location and NPC navigation
- hierarchy-aware parent search
- player-safe Location/NPC map links and search

## Remaining planned phases
These are intentionally not represented as finished:
1. Move legacy marker **editing** from Leaflet into the shared OpenLayers editing architecture, then remove Leaflet after coordinate/permission regression tests.
2. Add topology operations: polygon split/cut, merge, hole creation and island/MultiPolygon authoring.
3. Add stronger shared-border topology beyond current Snap/Trace behavior.
4. Add persistent edit history if Undo/Redo must survive reloads; current history is editor-session only.
5. Add GeoJSON import/export and optional Land Mask polygonization.
6. Add raster value inspection for elevation/temperature/rainfall.
7. Add optional player discovery/fog-of-war once its product rules are defined.
8. Add tile-pyramid generation/serving for substantially larger raster worlds.
9. Optimize map previews/search payloads further for worlds with very large feature counts.

## Quality contract
Before release, run from `web`:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Database environments must additionally run migrations and DB audit/integration tests. Do not report those checks as passing unless they actually completed against the target branch/database.

## Product definition of done
A new user should be able to create a world from one Rock 3 ZIP, draw a country, trace a neighboring border, place a city inside the hierarchy, assign an NPC to that Location, jump from that NPC back to the focused map, switch climate/topography views and return to the political view without manually entering media IDs, source types, GeoJSON, layer IDs, feature IDs, pixel bounds or CRS values.
