# WorldReborn Map Editor v2 — Master Specification

## Product goal
Build the map system as a spatial worldbuilding workspace, not as a decorative image viewer. One project may contain multiple maps. One world map may contain many synchronized raster and vector layers. Locations are canonical world entities; map geometry is their spatial representation. NPCs reference locations instead of owning ad-hoc map coordinates.

The normal map workflow must be understandable without GIS knowledge: an admin should be able to create a world map from one Rock 3 ZIP and then work with domain actions such as `Land`, `Provinz`, `Stadt`, `Fluss` and `Straße`. Technical concepts such as image paths, pixel bounds, source types and geometry primitives belong in advanced controls.

## Core invariants
1. `project_maps` represents distinct maps (world, city, dungeon), not visual themes.
2. `project_map_layers` represents visual/data layers of one map.
3. Rock 3 exports are raster layers of the same world map and must share identical bounds.
4. `Satellite Color` may be the base image; all other Rock 3 exports remain switchable overlays.
5. Countries, provinces and regions are vector polygons; roads and rivers are lines; cities/POIs are points.
6. A map feature may bind to an existing entity. Country/city drawing may create a Location and bind it atomically.
7. Locations form an explicit hierarchy: world → continent → country → region/province → city/town/village → district → building/landmark.
8. NPC `charakters.loc_id` remains the backward-compatible primary current location. Additional semantic locations use `person_location_assignments`.
9. Geometry editing must be non-destructive to lore entities. Deleting a polygon does not delete the Location.
10. Player visibility remains layer- and feature-aware; media used by permitted map layers must be readable by the same player.

## Rock 3 package
Recognize and support the complete standard export set:
- Satellite Color
- Biomes · Köppen-Geiger
- Rainfall · Annual Total / Equinox / Summer / Winter
- Temperature · Annual Mean / Equinox / Summer / Winter
- Terrain · Elevation Above Sea Level / Below Sea Level / Full Elevation / Land Mask

The primary creation workflow accepts the complete Rock 3 export folder as one ZIP. WorldReborn searches subfolders, recognizes supported files by filename, stores them as managed media, creates the `project_map`, registers semantic raster layers, creates the default vector layers, uses Satellite Color as the base image and opens the editor automatically. A separate update workflow can upload a later ZIP into an existing map without deleting vector features or linked Locations.

## Editor UX
- Main creation CTA: `Weltkarte aus ZIP erstellen`; no manual image path, width or height required.
- Technical Tile/Image map creation stays available under an advanced section.
- The editor starts from domain actions: Land, Province, City, River and Road.
- Point/LineString/Polygon and explicit vector-layer selection are advanced controls, not the primary workflow.
- Human-readable German Location-kind labels are shown in the normal UI.
- Rock-3 raster layers and user-created content layers are visually separated.
- Left layer panel has visibility and opacity controls that persist to the database.
- Select mode supports inspecting and modifying existing features.
- Modify interaction persists geometry automatically.
- Snapping aligns borders with existing vector features.
- Geometry tracing reuses an existing country/province border while drawing an adjacent polygon.
- Shift-assisted freehand drawing is available for rough coast/border work.
- Political features can have individual colors; line features use stroke color.
- Delete selected geometry without deleting linked lore entities.
- If Location creation is enabled, persist Location + feature + binding in one transaction.
- Country workflow: click `Land` → name/color → optional parent continent → draw/trace polygon → saved Location + feature.
- City workflow: click `Stadt` → name → parent country/province → place point → saved Location + feature.

## Location model
Canonical structural kinds: `world`, `continent`, `country`, `region`, `province`, `city`, `town`, `village`, `district`, `building`, `landmark`, `wilderness`, `other`.
Keep `location_type` as a free-form lore descriptor (e.g. “Free Trade City”), while `location_kind` drives hierarchy and UI behavior.
A Location may link to `map_id` and `map_feature_id`, may have a capital Location, parent Location, owner/ruler NPC, population and visibility.
Prevent cross-project parents, self-parenting and hierarchy cycles both in application validation and at the database boundary.

## NPC spatial model
NPCs must have a primary `current` location compatible with `charakters.loc_id`. Additional roles: `home`, `birthplace`, `workplace`, `seat`, `origin`, `temporary`, `other`.
Locations can be as precise as a building. Therefore a character can be resolved from “Room/Building” through District → City → Province → Country without duplicating coordinates.
NPC detail pages should surface the resolved hierarchy and provide a dedicated place-management screen.

## Future extensions
- Polygon split/cut tools and stronger topology-aware shared-border editing.
- GeoJSON import/export.
- Automatic Land Mask polygonization as an optional server tool.
- Raster value inspection (elevation/temperature/rainfall at a point).
- Time/versioned political borders.
- Player-specific fog of war and discovered geography.
- Tile pyramid generation for 16K+ maps.
- Map-editor undo/redo history and geometry versioning.

## Acceptance criteria for v2 foundation
- Existing maps/markers keep working after migrations.
- A new world map can be created directly from one Rock 3 ZIP.
- All 14 standard Rock 3 exports become recognized semantic layers when present in the ZIP.
- Satellite becomes the base map without manual media-ID, image-path or dimension entry.
- A successful new-map import opens the editor automatically.
- A later Rock 3 ZIP can update the raster data of an existing map without deleting vector content.
- Raster layers can be toggled, opacity can be changed, and the settings persist.
- Countries can be drawn as snapped/traced polygons and directly create `country` Locations.
- Selected vector geometry can be modified and auto-saved.
- Political polygons and route/river lines can use individual colors.
- Locations expose structural kind, parent hierarchy, capital and map binding.
- NPC current location stays synchronized and additional location roles can be stored and managed.
- Player media authorization follows map-layer visibility for media-backed raster layers.
