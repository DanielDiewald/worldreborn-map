# OpenLayers map layers and world geometry

This branch adds an additive vector/raster layer model for WorldReborn maps without deleting the existing map or marker data.

## Data model

`project_maps` still represents distinct maps belonging to a project/world. Examples: World Map, Erigon City, Underdark, Dungeon Level 1.

`project_map_layers` represents visual/data layers on one map. Examples:

- Satellite (raster image)
- Biomes (raster image)
- Elevation (raster image)
- Political (drawn vector)
- Roads & Rivers (drawn vector)
- Imported GeoJSON

`map_features` stores geometry attached to a vector layer:

- Point: city, castle, POI
- LineString: road, river, border section, trade route
- Polygon/MultiPolygon: country, province, forest, lake, controlled region

A feature can optionally point to an existing WorldReborn entity via `entity_type` + `entity_id`. Lore remains in the entity table; the map feature stores only its map geometry and map presentation metadata.

## Rock 3 workflow

Recommended Aetheris world setup:

1. Upload/serve `Satellite Color` as the primary image map.
2. Keep the Rock 3 exports as immutable source files.
3. Add Biomes, Rainfall, Temperature and similar exports as raster layers instead of creating separate maps.
4. Use `Terrain - Land Mask` as a GIS/worldbuilding source, not as the final interactive political layer.
5. For country creation either:
   - polygonize the Land Mask in QGIS and split the resulting land polygons into countries; or
   - paint a discrete country-ID mask with no antialiasing, polygonize it in QGIS and import the resulting GeoJSON.
6. For smaller/manual edits use the OpenLayers Vector Studio directly.

## Vector Studio

Admin route:

`/admin/projects/:projectId/map/studio?mapId=:mapId`

The studio supports drawing:

- Points
- LineStrings
- Polygons

New geometry is saved through the project-scoped admin feature API and stored in PostgreSQL.

Existing Leaflet marker editing remains available on the normal map route while OpenLayers vector editing is introduced additively. This avoids breaking the legacy marker workflow during the renderer migration.

## APIs

Admin:

- `GET/POST /api/admin/projects/:projectId/maps/:mapId/layers`
- `GET/POST /api/admin/projects/:projectId/maps/:mapId/features`
- `PATCH/DELETE /api/admin/projects/:projectId/maps/:mapId/features/:featureId`

All writes require an admin session and validate project/map/layer ownership server-side.

## Visibility

Layers and features support the existing visibility vocabulary:

- `admin_only`
- `all_players`
- `selected_players`

Dedicated visibility tables store selected-player grants for vector layers/features.

## Migration

Apply:

```bash
cd web
npm run db:migrate
```

Migration `0008_map_layers_and_features.sql` creates the layer/feature tables and seeds every existing map with:

- Political
- Routes & Rivers

Rollback:

```bash
cd web
npm run db:rollback
```

## Next integration steps

The schema and editor deliberately separate map data from rendering. This allows the normal player/admin map viewer to migrate from Leaflet to OpenLayers independently. The next renderer slice should:

1. render `project_map_layers` in the normal viewer;
2. render visible `map_features` for players;
3. add feature selection/edit/delete UI to the studio;
4. add layer management forms (opacity, order, visibility, raster source);
5. add GeoJSON upload/import with coordinate validation;
6. optionally tile very large 16K/32K/64K raster layers.
