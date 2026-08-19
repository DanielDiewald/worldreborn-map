import "server-only";

import type { PoolClient } from "pg";
import { z } from "zod";
import { pool } from "@/lib/db";

const mapKindSchema = z.enum(["world", "continent", "region", "city", "building", "dungeon", "other"]);
const commonMapFields = {
  name: z.string().trim().min(1).max(120),
  mapKind: mapKindSchema.default("other"),
  minZoom: z.coerce.number().int().min(-10).max(30),
  maxZoom: z.coerce.number().int().min(-10).max(30),
  isPrimary: z.coerce.boolean().default(false),
};
const tileMapSchema = z.object({
  mapType: z.literal("tile"),
  ...commonMapFields,
  minZoom: commonMapFields.minZoom.default(0),
  maxZoom: commonMapFields.maxZoom.default(6),
  tileUrl: z.string().trim().min(1).max(4000),
  centerLat: z.coerce.number().finite().nullable().optional(),
  centerLng: z.coerce.number().finite().nullable().optional(),
  noWrap: z.coerce.boolean().default(true),
});
const imageMapSchema = z.object({
  mapType: z.literal("image"),
  ...commonMapFields,
  minZoom: commonMapFields.minZoom.default(-2),
  maxZoom: commonMapFields.maxZoom.default(4),
  imagePath: z.string().trim().min(1).max(4000),
  width: z.coerce.number().positive().max(1_000_000),
  height: z.coerce.number().positive().max(1_000_000),
});
const mapSchema = z.discriminatedUnion("mapType", [tileMapSchema, imageMapSchema]).superRefine((value, context) => {
  if (value.maxZoom < value.minZoom) context.addIssue({ code: "custom", message: "Max Zoom must be greater than or equal to Min Zoom." });
  if (value.mapType === "tile" && (value.centerLat == null) !== (value.centerLng == null)) context.addIssue({ code: "custom", message: "Map center requires both latitude and longitude." });
});

type MapContentCounts = {
  features: number;
  markers: number;
  locations: number;
};

async function lockProjectMap(client: PoolClient, projectId: number, mapId: number) {
  const result = await client.query<{ map_id: string; name: string; is_primary: boolean }>(
    "SELECT map_id,name,is_primary FROM project_maps WHERE project_id=$1 AND map_id=$2 FOR UPDATE",
    [projectId, mapId],
  );
  if (result.rowCount !== 1) throw new Error("Map not found in this project.");
  return result.rows[0];
}

/**
 * Removes user-created spatial content from a map while preserving the map itself
 * and its raster/vector layer configuration. Lore Locations are deliberately kept;
 * only their placement on this map is detached.
 */
async function clearProjectMapContent(client: PoolClient, projectId: number, mapId: number): Promise<MapContentCounts> {
  const counts = await client.query<{ features: string; markers: string; locations: string }>(
    `SELECT
       (SELECT count(*) FROM map_features WHERE project_id=$1 AND map_id=$2)::text AS features,
       (SELECT count(*) FROM map_markers WHERE project_id=$1 AND map_id=$2)::text AS markers,
       (SELECT count(*) FROM locations WHERE camp_id=$1 AND map_id=$2)::text AS locations`,
    [projectId, mapId],
  );

  // entity_visibility is intentionally generic and has no FK to map_markers.
  await client.query(
    `DELETE FROM entity_visibility ev
      WHERE ev.project_id=$1
        AND ev.entity_type='map_marker'
        AND ev.entity_id IN (
          SELECT marker_id FROM map_markers WHERE project_id=$1 AND map_id=$2
        )`,
    [projectId, mapId],
  );

  // The map remains during reset, so map_id must be detached explicitly. The
  // map_feature_id FK would become NULL when features are deleted, but doing both
  // here keeps the Location state consistent throughout the transaction.
  await client.query(
    `UPDATE locations l
        SET map_id=NULL,map_feature_id=NULL,updated_at=now()
      WHERE l.camp_id=$1
        AND (
          l.map_id=$2
          OR l.map_feature_id IN (
            SELECT feature_id FROM map_features WHERE project_id=$1 AND map_id=$2
          )
        )`,
    [projectId, mapId],
  );

  // Visibility rows cascade from map_features; markers are deleted explicitly.
  await client.query("DELETE FROM map_features WHERE project_id=$1 AND map_id=$2", [projectId, mapId]);
  await client.query("DELETE FROM map_markers WHERE project_id=$1 AND map_id=$2", [projectId, mapId]);

  return {
    features: Number(counts.rows[0]?.features ?? 0),
    markers: Number(counts.rows[0]?.markers ?? 0),
    locations: Number(counts.rows[0]?.locations ?? 0),
  };
}

export async function createProjectMap(projectId: number, input: unknown) {
  const data = mapSchema.parse(input), client = await pool.connect();
  try {
    await client.query("BEGIN");
    const project = await client.query("SELECT 1 FROM campaigns WHERE camp_id=$1 AND status<>'archived' FOR UPDATE", [projectId]);
    if (project.rowCount !== 1) throw new Error("Project not found or archived.");
    if (data.isPrimary) await client.query("UPDATE project_maps SET is_primary=false,updated_at=now() WHERE project_id=$1 AND is_primary", [projectId]);
    const config = data.mapType === "tile" ? { map_kind: data.mapKind, no_wrap: data.noWrap } : { map_kind: data.mapKind, width: data.width, height: data.height, crs: "simple" };
    const result = await client.query<{ map_id: string }>(
      `INSERT INTO project_maps(project_id,name,map_type,tile_url,image_path,min_zoom,max_zoom,center_lat,center_lng,bounds,config,is_primary)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12)
       RETURNING map_id`,
      [projectId, data.name, data.mapType, data.mapType === "tile" ? data.tileUrl : null, data.mapType === "image" ? data.imagePath : null, data.minZoom, data.maxZoom, data.mapType === "tile" ? (data.centerLat ?? null) : null, data.mapType === "tile" ? (data.centerLng ?? null) : null, data.mapType === "image" ? JSON.stringify([[0, 0], [data.height, data.width]]) : null, JSON.stringify(config), data.isPrimary],
    );
    const id = Number(result.rows[0].map_id);
    if (data.isPrimary) await client.query("UPDATE campaigns SET primary_map_id=$2,updated_at=now() WHERE camp_id=$1", [projectId, id]);
    await client.query(
      `INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata)
       VALUES($1,'admin','map.created','map',$2,$3::jsonb)`,
      [projectId, id, JSON.stringify({ map_type: data.mapType, map_kind: data.mapKind })],
    );
    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateProjectMap(projectId: number, mapId: number, input: unknown) {
  const data = mapSchema.parse(input), client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{ map_type: "tile" | "image"; bounds: unknown; config: Record<string, unknown> | null }>(
      "SELECT map_type,bounds,config FROM project_maps WHERE project_id=$1 AND map_id=$2 FOR UPDATE",
      [projectId, mapId],
    );
    if (current.rowCount !== 1) throw new Error("Map not found in this project.");
    const existing = current.rows[0];
    if (existing.map_type !== data.mapType) throw new Error("Changing the map type of an existing map is not supported. Create a new map instead.");
    const previousConfig = existing.config ?? {};
    const config = data.mapType === "tile" ? { ...previousConfig, map_kind: data.mapKind, no_wrap: data.noWrap } : { ...previousConfig, map_kind: data.mapKind, width: data.width, height: data.height, crs: "simple" };
    const bounds = data.mapType === "image" ? [[0, 0], [data.height, data.width]] : existing.bounds;
    await client.query(
      `UPDATE project_maps
          SET name=$3,tile_url=$4,image_path=$5,min_zoom=$6,max_zoom=$7,center_lat=$8,center_lng=$9,bounds=$10::jsonb,config=$11::jsonb,updated_at=now()
        WHERE project_id=$1 AND map_id=$2`,
      [projectId, mapId, data.name, data.mapType === "tile" ? data.tileUrl : null, data.mapType === "image" ? data.imagePath : null, data.minZoom, data.maxZoom, data.mapType === "tile" ? (data.centerLat ?? null) : null, data.mapType === "tile" ? (data.centerLng ?? null) : null, bounds == null ? null : JSON.stringify(bounds), JSON.stringify(config)],
    );
    await client.query(
      `INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata)
       VALUES($1,'admin','map.updated','map',$2,$3::jsonb)`,
      [projectId, mapId, JSON.stringify({ map_type: data.mapType, map_kind: data.mapKind })],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setPrimaryMap(projectId: number, mapId: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const map = await client.query("SELECT 1 FROM project_maps WHERE project_id=$1 AND map_id=$2 FOR UPDATE", [projectId, mapId]);
    if (map.rowCount !== 1) throw new Error("Map does not belong to this project.");
    await client.query("UPDATE project_maps SET is_primary=(map_id=$2),updated_at=now() WHERE project_id=$1", [projectId, mapId]);
    await client.query("UPDATE campaigns SET primary_map_id=$2,updated_at=now() WHERE camp_id=$1", [projectId, mapId]);
    await client.query(
      `INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id)
       VALUES($1,'admin','map.primary_changed','map',$2)`,
      [projectId, mapId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function resetProjectMap(projectId: number, mapId: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const map = await lockProjectMap(client, projectId, mapId);
    const counts = await clearProjectMapContent(client, projectId, mapId);
    await client.query(
      `INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata)
       VALUES($1,'admin','map.reset','map',$2,$3::jsonb)`,
      [projectId, mapId, JSON.stringify({ name: map.name, ...counts, preserved_layers: true })],
    );
    await client.query("COMMIT");
    return counts;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteProjectMap(projectId: number, mapId: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const map = await lockProjectMap(client, projectId, mapId);
    const replacement = await client.query<{ map_id: string }>(
      `SELECT map_id
         FROM project_maps
        WHERE project_id=$1 AND map_id<>$2
        ORDER BY is_primary DESC,map_id
        LIMIT 1
        FOR UPDATE`,
      [projectId, mapId],
    );
    const replacementMapId = replacement.rowCount ? Number(replacement.rows[0].map_id) : null;
    const counts = await clearProjectMapContent(client, projectId, mapId);

    // Avoid relying on the FK timing while a primary map is being removed.
    if (map.is_primary) {
      await client.query("UPDATE campaigns SET primary_map_id=NULL,updated_at=now() WHERE camp_id=$1 AND primary_map_id=$2", [projectId, mapId]);
    }

    const deleted = await client.query(
      "DELETE FROM project_maps WHERE project_id=$1 AND map_id=$2 RETURNING map_id",
      [projectId, mapId],
    );
    if (deleted.rowCount !== 1) throw new Error("Map could not be deleted.");

    if (map.is_primary && replacementMapId) {
      await client.query("UPDATE project_maps SET is_primary=(map_id=$2),updated_at=now() WHERE project_id=$1", [projectId, replacementMapId]);
      await client.query("UPDATE campaigns SET primary_map_id=$2,updated_at=now() WHERE camp_id=$1", [projectId, replacementMapId]);
    }

    await client.query(
      `INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata)
       VALUES($1,'admin','map.deleted','map',$2,$3::jsonb)`,
      [projectId, mapId, JSON.stringify({ name: map.name, was_primary: map.is_primary, replacement_primary_map_id: map.is_primary ? replacementMapId : null, ...counts })],
    );
    await client.query("COMMIT");
    return { replacementPrimaryMapId: map.is_primary ? replacementMapId : null, ...counts };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
