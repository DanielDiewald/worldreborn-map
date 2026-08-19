import "server-only";

import { z } from "zod";
import { pool } from "@/lib/db";

const polygonGeometrySchema = z.object({
  type: z.enum(["Polygon", "MultiPolygon"]),
  coordinates: z.unknown(),
}).passthrough();

const splitPartSchema = z.object({
  name: z.string().trim().min(1).max(200),
  geometry: polygonGeometrySchema,
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#9a8be8"),
});

const splitInputSchema = z.object({
  mode: z.enum(["parent_to_two", "province_to_sibling"]),
  parts: z.tuple([splitPartSchema, splitPartSchema]),
}).superRefine((value, ctx) => {
  if (value.mode === "parent_to_two" && value.parts[0].name.toLocaleLowerCase() === value.parts[1].name.toLocaleLowerCase()) {
    ctx.addIssue({ code: "custom", message: "Die beiden Provinzen brauchen unterschiedliche Namen." });
  }
});

type ParentRow = {
  feature_id: string;
  layer_id: string;
  entity_id: string;
  label: string;
  visibility_mode: "admin_only" | "all_players" | "selected_players";
  style: Record<string, unknown>;
  metadata: Record<string, unknown>;
  location_kind: string;
  parent_loc_id: number | null;
};

function isLocked(row: ParentRow) { return row.metadata?.editorLocked === true; }

async function createProvince(client: import("pg").PoolClient, options: {
  projectId: number;
  mapId: number;
  layerId: number;
  parentLocationId: number;
  parentFeatureId: number;
  visibilityMode: ParentRow["visibility_mode"];
  name: string;
  geometry: z.infer<typeof polygonGeometrySchema>;
  color: string;
}) {
  const location = await client.query<{ loc_id: number }>(
    `INSERT INTO locations(camp_id,name,parent_loc_id,location_type,location_kind,description,visibility_mode,map_id,metadata,updated_at)
     VALUES($1,$2,$3,'Provinz','province',NULL,$4,$5,$6::jsonb,now())
     RETURNING loc_id`,
    [options.projectId, options.name, options.parentLocationId, options.visibilityMode, options.mapId, JSON.stringify({ created_from_map_editor: true, created_from_divider: true })],
  );
  const locationId = location.rows[0].loc_id;
  const metadata = {
    createdIn: "province-divider-v1",
    tool: "province",
    parentLocationId: options.parentLocationId,
    sourceParentFeatureId: options.parentFeatureId,
    geometryConformance: "parent-divider",
    editorLocked: false,
  };
  const feature = await client.query<{ feature_id: string }>(
    `INSERT INTO map_features(project_id,map_id,layer_id,geometry_type,geometry,entity_type,entity_id,label,short_description,visibility_mode,style,metadata)
     VALUES($1,$2,$3,$4,$5::jsonb,'location',$6,$7,NULL,$8,$9::jsonb,$10::jsonb)
     RETURNING feature_id`,
    [options.projectId, options.mapId, options.layerId, options.geometry.type, JSON.stringify(options.geometry), locationId, options.name, options.visibilityMode, JSON.stringify({ fill: options.color, stroke: "#ffffff", strokeWidth: 2 }), JSON.stringify(metadata)],
  );
  const featureId = Number(feature.rows[0].feature_id);
  await client.query("UPDATE locations SET map_id=$3,map_feature_id=$4,updated_at=now() WHERE camp_id=$1 AND loc_id=$2", [options.projectId, locationId, options.mapId, featureId]);
  if (options.visibilityMode === "selected_players") {
    await client.query(
      `INSERT INTO map_feature_visibility(feature_id,player_id,visible)
       SELECT $1,player_id,visible FROM map_feature_visibility WHERE feature_id=$2
       ON CONFLICT(feature_id,player_id) DO UPDATE SET visible=EXCLUDED.visible`,
      [featureId, options.parentFeatureId],
    );
  }
  return { featureId, locationId, name: options.name };
}

export async function splitPoliticalFeatureIntoProvinces(projectId: number, mapId: number, featureId: number, input: unknown) {
  const data = splitInputSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const parentResult = await client.query<ParentRow>(
      `SELECT f.feature_id,f.layer_id,f.entity_id,f.label,f.visibility_mode,f.style,f.metadata,loc.location_kind,loc.parent_loc_id
         FROM map_features f
         JOIN locations loc ON f.entity_type='location' AND loc.loc_id=f.entity_id AND loc.camp_id=f.project_id AND loc.archived_at IS NULL
         JOIN project_map_layers l ON l.layer_id=f.layer_id AND l.project_id=f.project_id AND l.map_id=f.map_id AND l.layer_type='vector'
        WHERE f.project_id=$1 AND f.map_id=$2 AND f.feature_id=$3
        FOR UPDATE OF f,loc`,
      [projectId, mapId, featureId],
    );
    if (parentResult.rowCount !== 1) throw new Error("Die ausgewählte politische Fläche wurde nicht gefunden.");
    const parent = parentResult.rows[0];
    if (isLocked(parent)) throw new Error(`„${parent.label}“ ist gesperrt. Entsperre die Fläche zuerst.`);
    const entityId = Number(parent.entity_id), layerId = Number(parent.layer_id);
    if (!Number.isSafeInteger(entityId) || !Number.isSafeInteger(layerId)) throw new Error("Ungültige Kartenverknüpfung.");

    const created: Array<{ featureId: number; locationId: number; name: string }> = [];
    if (data.mode === "parent_to_two") {
      if (!["country", "region"].includes(parent.location_kind)) throw new Error("Nur Länder oder Regionen können direkt in zwei Provinzen geteilt werden.");
      const existingChildren = await client.query<{ name: string }>(
        `SELECT name
           FROM locations child
          WHERE child.camp_id=$1 AND child.parent_loc_id=$2 AND child.location_kind='province' AND child.archived_at IS NULL
          ORDER BY child.name
          LIMIT 4`,
        [projectId, entityId],
      );
      if (existingChildren.rowCount) {
        const names = existingChildren.rows.map((row) => row.name).join(", ");
        throw new Error(`Dieses Gebiet besitzt bereits Provinz-Locations${names ? ` (${names})` : ""}. Platziere oder teile diese bestehenden Provinzen, statt neue überlappende Provinzen zu erzeugen.`);
      }
      for (const part of data.parts) {
        created.push(await createProvince(client, {
          projectId, mapId, layerId, parentLocationId: entityId, parentFeatureId: featureId,
          visibilityMode: parent.visibility_mode, name: part.name, geometry: part.geometry, color: part.color,
        }));
      }
    } else {
      if (parent.location_kind !== "province" || !parent.parent_loc_id) throw new Error("Nur eine bestehende Provinz kann in eine neue Geschwister-Provinz geteilt werden.");
      const nestedLocations = await client.query<{ name: string }>(
        `SELECT name
           FROM locations child
          WHERE child.camp_id=$1 AND child.parent_loc_id=$2 AND child.archived_at IS NULL
          ORDER BY child.name
          LIMIT 5`,
        [projectId, entityId],
      );
      if (nestedLocations.rowCount) {
        const names = nestedLocations.rows.map((row) => row.name).join(", ");
        throw new Error(`Diese Provinz enthält bereits Unterorte${names ? ` (${names})` : ""}. Vor dem Teilen müssen diese räumlich einer der neuen Provinzen zugeordnet werden; WorldReborn verschiebt sie nicht automatisch.`);
      }
      const keep = data.parts[0], sibling = data.parts[1];
      await client.query(
        `UPDATE map_features SET geometry_type=$4,geometry=$5::jsonb,updated_at=now()
          WHERE project_id=$1 AND map_id=$2 AND feature_id=$3`,
        [projectId, mapId, featureId, keep.geometry.type, JSON.stringify(keep.geometry)],
      );
      created.push(await createProvince(client, {
        projectId, mapId, layerId, parentLocationId: parent.parent_loc_id, parentFeatureId: featureId,
        visibilityMode: parent.visibility_mode, name: sibling.name, geometry: sibling.geometry, color: sibling.color,
      }));
    }

    await client.query("COMMIT");
    return { mode: data.mode, sourceFeatureId: featureId, created };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
