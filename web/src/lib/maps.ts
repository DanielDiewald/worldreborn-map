import "server-only";

import type { PoolClient } from "pg";
import { z } from "zod";
import { pool } from "@/lib/db";
import { resolveEntityReference } from "@/lib/entity-reference";

const visibilitySchema = z.enum(["admin_only", "all_players", "selected_players"]);
const markerTypeSchema = z.enum([
  "location",
  "person",
  "npc",
  "god",
  "character",
  "group",
  "event",
  "quest",
  "portal",
  "dungeon",
  "landmark",
  "custom",
  "party_location",
  "player_origin",
]);

const markerSchema = z
  .object({
    markerType: markerTypeSchema,
    entityType: z.string().trim().max(40).nullable().optional(),
    entityId: z.coerce.number().int().positive().nullable().optional(),
    coordinateMode: z.enum(["latlng", "xy"]).default("latlng"),
    lat: z.coerce.number().finite().nullable().optional(),
    lng: z.coerce.number().finite().nullable().optional(),
    x: z.coerce.number().finite().nullable().optional(),
    y: z.coerce.number().finite().nullable().optional(),
    icon: z.string().trim().max(4000).nullable().optional(),
    label: z.string().trim().min(1).max(200),
    shortDescription: z.string().trim().max(20000).nullable().optional(),
    visibilityMode: visibilitySchema.default("admin_only"),
    selectedPlayerIds: z.array(z.coerce.number().int().positive()).max(500).default([]),
    layer: z.string().trim().min(1).max(80).default("default"),
    zIndex: z.coerce.number().int().min(-100000).max(100000).default(0),
  })
  .superRefine((value, context) => {
    if (value.coordinateMode === "latlng" && (value.lat == null || value.lng == null)) {
      context.addIssue({ code: "custom", message: "Latitude and longitude are required." });
    }
    if (value.coordinateMode === "xy" && (value.x == null || value.y == null)) {
      context.addIssue({ code: "custom", message: "X and Y are required." });
    }
    if ((value.entityType == null) !== (value.entityId == null)) {
      context.addIssue({ code: "custom", message: "Entity type and entity ID must be set together." });
    }
  });

type MapType = "tile" | "image";

type MarkerRow = {
  marker_id: string | number;
  marker_type: string;
  entity_type: string | null;
  entity_id: string | number | null;
  entity_label: string | null;
  entity_kind: string | null;
  coordinate_mode: string;
  lat: number | null;
  lng: number | null;
  x: number | null;
  y: number | null;
  icon: string | null;
  label: string;
  short_description: string | null;
  visibility_mode: string;
  selected_player_ids: number[];
  layer: string;
  z_index: number;
  metadata: Record<string, unknown>;
};

export type MapPlayerOption = {
  userId: number;
  displayName: string;
};

export async function listProjectMaps(projectId: number) {
  const result = await pool.query(
    `SELECT map_id,name,map_type,tile_url,image_path,min_zoom,max_zoom,center_lat,center_lng,bounds,config,is_primary
       FROM project_maps
      WHERE project_id=$1
      ORDER BY is_primary DESC,map_id`,
    [projectId],
  );
  return result.rows;
}

export async function getProjectMap(projectId: number, mapId: number) {
  const result = await pool.query(
    `SELECT map_id,name,map_type,tile_url,image_path,min_zoom,max_zoom,center_lat,center_lng,bounds,config,is_primary
       FROM project_maps
      WHERE project_id=$1 AND map_id=$2`,
    [projectId, mapId],
  );
  return result.rows[0] ?? null;
}

export async function listProjectMapPlayers(projectId: number): Promise<MapPlayerOption[]> {
  const result = await pool.query<{ user_id: number; display_name: string }>(
    `SELECT user_id,COALESCE(NULLIF(display_name,''),name) AS display_name
       FROM users
      WHERE camp_id=$1 AND active=true
      ORDER BY COALESCE(NULLIF(display_name,''),name),user_id`,
    [projectId],
  );
  return result.rows.map((row) => ({ userId: row.user_id, displayName: row.display_name }));
}

export async function listMapMarkers(projectId: number, mapId: number): Promise<MarkerRow[]> {
  const result = await pool.query<MarkerRow>(
    `SELECT m.marker_id,
            m.marker_type,
            m.entity_type,
            m.entity_id,
            COALESCE(n.name,l.name,g.name,e.name) AS entity_label,
            CASE
              WHEN m.entity_type='person' AND EXISTS(SELECT 1 FROM gods gd WHERE gd.n_id=m.entity_id) THEN 'God'
              WHEN m.entity_type='person' AND EXISTS(SELECT 1 FROM chars pc WHERE pc.n_id=m.entity_id) THEN 'Player Character'
              WHEN m.entity_type='person' THEN 'NPC / Character'
              WHEN m.entity_type='location' THEN 'Location'
              WHEN m.entity_type='group' THEN 'Group'
              WHEN m.entity_type='event' THEN 'Event'
              ELSE NULL
            END AS entity_kind,
            m.coordinate_mode,
            m.lat,
            m.lng,
            m.x,
            m.y,
            m.icon,
            m.label,
            m.short_description,
            m.visibility_mode,
            COALESCE(ARRAY(
              SELECT ev.player_id::int
                FROM entity_visibility ev
               WHERE ev.project_id=m.project_id
                 AND ev.entity_type='map_marker'
                 AND ev.entity_id=m.marker_id
                 AND ev.visible=true
               ORDER BY ev.player_id
            ),ARRAY[]::int[]) AS selected_player_ids,
            m.layer,
            m.z_index,
            m.metadata
       FROM map_markers m
       LEFT JOIN npcs n
         ON m.entity_type='person' AND n.camp_id=m.project_id AND n.n_id=m.entity_id
       LEFT JOIN locations l
         ON m.entity_type='location' AND l.camp_id=m.project_id AND l.loc_id=m.entity_id
       LEFT JOIN groups g
         ON m.entity_type='group' AND g.camp_id=m.project_id AND g.gr_id=m.entity_id
       LEFT JOIN events e
         ON m.entity_type='event' AND e.camp_id=m.project_id AND e.e_id=m.entity_id
      WHERE m.project_id=$1 AND m.map_id=$2
      ORDER BY m.layer,m.z_index,m.marker_id`,
    [projectId, mapId],
  );
  return result.rows;
}

async function getMapType(projectId: number, mapId: number, client: PoolClient | typeof pool = pool): Promise<MapType> {
  const result = await client.query<{ map_type: MapType }>(
    "SELECT map_type FROM project_maps WHERE project_id=$1 AND map_id=$2",
    [projectId, mapId],
  );
  if (result.rowCount !== 1) throw new Error("Map does not belong to this project.");
  return result.rows[0].map_type;
}

function assertCoordinateMode(mapType: MapType, coordinateMode: "latlng" | "xy") {
  if (mapType === "image" && coordinateMode !== "xy") {
    throw new Error("Image maps require X/Y coordinates.");
  }
  if (mapType === "tile" && coordinateMode !== "latlng") {
    throw new Error("Tile maps require latitude/longitude coordinates.");
  }
}

async function canonicalMarkerTarget(projectId: number, entityType: string | null | undefined, entityId: number | null | undefined) {
  if (entityType == null || entityId == null) return { type: null, id: null };
  const ref = await resolveEntityReference({ projectId, entityType, entityId });
  return { type: ref.type, id: ref.id };
}

async function syncMarkerPlayerVisibility(
  client: PoolClient,
  projectId: number,
  markerId: number,
  visibilityMode: z.infer<typeof visibilitySchema>,
  selectedPlayerIds: number[],
) {
  const playerIds = [...new Set(selectedPlayerIds)];
  await client.query(
    `DELETE FROM entity_visibility
      WHERE project_id=$1 AND entity_type='map_marker' AND entity_id=$2`,
    [projectId, markerId],
  );

  if (visibilityMode !== "selected_players" || playerIds.length === 0) return;

  const validPlayers = await client.query<{ user_id: number }>(
    `SELECT user_id
       FROM users
      WHERE camp_id=$1 AND active=true AND user_id=ANY($2::int[])`,
    [projectId, playerIds],
  );
  if (validPlayers.rows.length !== playerIds.length) {
    throw new Error("At least one selected player does not belong to this project or is inactive.");
  }

  await client.query(
    `INSERT INTO entity_visibility(project_id,player_id,entity_type,entity_id,visible)
     SELECT $1,u.user_id,'map_marker',$2,true
       FROM users u
      WHERE u.camp_id=$1 AND u.active=true AND u.user_id=ANY($3::int[])
     ON CONFLICT(project_id,player_id,entity_type,entity_id)
     DO UPDATE SET visible=true,updated_at=now()`,
    [projectId, markerId, playerIds],
  );
}

async function auditMarkerChange(
  client: PoolClient,
  projectId: number,
  markerId: number,
  operation: "create" | "update" | "move" | "delete",
  metadata: Record<string, unknown> = {},
) {
  await client.query(
    `INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata)
     VALUES($1,'admin','map.marker.changed','map_marker',$2,$3::jsonb)`,
    [projectId, markerId, JSON.stringify({ operation, ...metadata })],
  );
}

export async function createMapMarker(projectId: number, mapId: number, input: unknown) {
  const marker = markerSchema.parse(input);
  const target = await canonicalMarkerTarget(projectId, marker.entityType, marker.entityId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const mapType = await getMapType(projectId, mapId, client);
    assertCoordinateMode(mapType, marker.coordinateMode);
    const result = await client.query<{ marker_id: string }>(
      `INSERT INTO map_markers(
        project_id,map_id,marker_type,entity_type,entity_id,coordinate_mode,
        lat,lng,x,y,icon,label,short_description,visibility_mode,layer,z_index
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING marker_id`,
      [
        projectId,
        mapId,
        marker.markerType,
        target.type,
        target.id,
        marker.coordinateMode,
        marker.coordinateMode === "latlng" ? marker.lat : null,
        marker.coordinateMode === "latlng" ? marker.lng : null,
        marker.coordinateMode === "xy" ? marker.x : null,
        marker.coordinateMode === "xy" ? marker.y : null,
        marker.icon ?? null,
        marker.label,
        marker.shortDescription ?? null,
        marker.visibilityMode,
        marker.layer,
        marker.zIndex,
      ],
    );
    const markerId = Number(result.rows[0].marker_id);
    await syncMarkerPlayerVisibility(client, projectId, markerId, marker.visibilityMode, marker.selectedPlayerIds);
    await auditMarkerChange(client, projectId, markerId, "create", {
      target_type: target.type,
      target_id: target.id,
      visibility_mode: marker.visibilityMode,
    });
    await client.query("COMMIT");
    return markerId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateMapMarker(projectId: number, mapId: number, markerId: number, input: unknown) {
  const marker = markerSchema.parse(input);
  const target = await canonicalMarkerTarget(projectId, marker.entityType, marker.entityId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const mapType = await getMapType(projectId, mapId, client);
    assertCoordinateMode(mapType, marker.coordinateMode);
    const result = await client.query(
      `UPDATE map_markers
          SET marker_type=$4,
              entity_type=$5,
              entity_id=$6,
              coordinate_mode=$7,
              lat=$8,
              lng=$9,
              x=$10,
              y=$11,
              icon=$12,
              label=$13,
              short_description=$14,
              visibility_mode=$15,
              layer=$16,
              z_index=$17,
              updated_at=now()
        WHERE project_id=$1 AND map_id=$2 AND marker_id=$3`,
      [
        projectId,
        mapId,
        markerId,
        marker.markerType,
        target.type,
        target.id,
        marker.coordinateMode,
        marker.coordinateMode === "latlng" ? marker.lat : null,
        marker.coordinateMode === "latlng" ? marker.lng : null,
        marker.coordinateMode === "xy" ? marker.x : null,
        marker.coordinateMode === "xy" ? marker.y : null,
        marker.icon ?? null,
        marker.label,
        marker.shortDescription ?? null,
        marker.visibilityMode,
        marker.layer,
        marker.zIndex,
      ],
    );
    if (result.rowCount !== 1) throw new Error("Marker not found in this map/project.");
    await syncMarkerPlayerVisibility(client, projectId, markerId, marker.visibilityMode, marker.selectedPlayerIds);
    await auditMarkerChange(client, projectId, markerId, "update", {
      target_type: target.type,
      target_id: target.id,
      visibility_mode: marker.visibilityMode,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function moveMapMarker(
  projectId: number,
  mapId: number,
  markerId: number,
  position: { lat?: number; lng?: number; x?: number; y?: number },
) {
  const hasLatLng = Number.isFinite(position.lat) && Number.isFinite(position.lng);
  const hasXy = Number.isFinite(position.x) && Number.isFinite(position.y);
  if (hasLatLng === hasXy) throw new Error("Provide exactly one coordinate pair.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const mapType = await getMapType(projectId, mapId, client);
    assertCoordinateMode(mapType, hasLatLng ? "latlng" : "xy");
    const result = await client.query(
      `UPDATE map_markers
          SET coordinate_mode=$4,lat=$5,lng=$6,x=$7,y=$8,updated_at=now()
        WHERE project_id=$1 AND map_id=$2 AND marker_id=$3`,
      [
        projectId,
        mapId,
        markerId,
        hasLatLng ? "latlng" : "xy",
        hasLatLng ? position.lat : null,
        hasLatLng ? position.lng : null,
        hasXy ? position.x : null,
        hasXy ? position.y : null,
      ],
    );
    if (result.rowCount !== 1) throw new Error("Marker not found in this map/project.");
    await auditMarkerChange(client, projectId, markerId, "move");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteMapMarker(projectId: number, mapId: number, markerId: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await getMapType(projectId, mapId, client);
    await client.query(
      `DELETE FROM entity_visibility
        WHERE project_id=$1 AND entity_type='map_marker' AND entity_id=$2`,
      [projectId, markerId],
    );
    const result = await client.query(
      "DELETE FROM map_markers WHERE project_id=$1 AND map_id=$2 AND marker_id=$3",
      [projectId, mapId, markerId],
    );
    if (result.rowCount !== 1) throw new Error("Marker not found in this map/project.");
    await auditMarkerChange(client, projectId, markerId, "delete");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getVisibleMapMarkers(projectId: number, mapId: number, playerId: number) {
  await getMapType(projectId, mapId);
  const result = await pool.query(
    `SELECT m.marker_id,
            m.marker_type,
            m.entity_type,
            m.entity_id,
            m.coordinate_mode,
            m.lat,
            m.lng,
            m.x,
            m.y,
            m.icon,
            m.label,
            m.short_description,
            m.visibility_mode,
            m.layer,
            m.z_index,
            m.metadata
       FROM map_markers m
       JOIN users u
         ON u.user_id=$3 AND u.camp_id=$1 AND u.active=true
       LEFT JOIN entity_visibility mv
         ON mv.project_id=m.project_id
        AND mv.player_id=$3
        AND mv.entity_type='map_marker'
        AND mv.entity_id=m.marker_id
      WHERE m.project_id=$1
        AND m.map_id=$2
        AND COALESCE(mv.visible,m.visibility_mode='all_players')
        AND (
          m.entity_type IS NULL OR CASE m.entity_type
            WHEN 'person' THEN EXISTS(
              SELECT 1
                FROM npcs n
                LEFT JOIN entity_visibility ev
                  ON ev.project_id=n.camp_id AND ev.player_id=$3 AND ev.entity_type='person' AND ev.entity_id=n.n_id
               WHERE n.camp_id=$1 AND n.n_id=m.entity_id AND n.archived_at IS NULL
                 AND COALESCE(ev.visible,n.visibility_mode='all_players')
            )
            WHEN 'location' THEN EXISTS(
              SELECT 1
                FROM locations l
                LEFT JOIN entity_visibility ev
                  ON ev.project_id=l.camp_id AND ev.player_id=$3 AND ev.entity_type='location' AND ev.entity_id=l.loc_id
               WHERE l.camp_id=$1 AND l.loc_id=m.entity_id AND l.archived_at IS NULL
                 AND COALESCE(ev.visible,l.visibility_mode='all_players')
            )
            WHEN 'group' THEN EXISTS(
              SELECT 1
                FROM groups g
                LEFT JOIN entity_visibility ev
                  ON ev.project_id=g.camp_id AND ev.player_id=$3 AND ev.entity_type='group' AND ev.entity_id=g.gr_id
               WHERE g.camp_id=$1 AND g.gr_id=m.entity_id AND g.archived_at IS NULL
                 AND COALESCE(ev.visible,g.visibility_mode='all_players')
            )
            WHEN 'event' THEN EXISTS(
              SELECT 1
                FROM events e
                LEFT JOIN entity_visibility ev
                  ON ev.project_id=e.camp_id AND ev.player_id=$3 AND ev.entity_type='event' AND ev.entity_id=e.e_id
               WHERE e.camp_id=$1 AND e.e_id=m.entity_id AND e.archived_at IS NULL
                 AND COALESCE(ev.visible,e.visibility_mode='all_players')
            )
            ELSE false
          END
        )
      ORDER BY m.layer,m.z_index,m.marker_id`,
    [projectId, mapId, playerId],
  );
  return result.rows;
}
