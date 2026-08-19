import "server-only";

import { z } from "zod";
import { pool } from "@/lib/db";

const geometrySchema = z.object({
  type: z.enum(["Point", "LineString", "Polygon", "MultiPoint", "MultiLineString", "MultiPolygon"]),
  coordinates: z.unknown(),
}).passthrough();

const styleSchema = z.record(z.string(), z.unknown());

export async function patchMapFeatureGeometry(projectId: number, mapId: number, featureId: number, geometry: unknown) {
  const parsed = geometrySchema.parse(geometry);
  const result = await pool.query(
    `UPDATE map_features
        SET geometry_type=$4,geometry=$5::jsonb,updated_at=now()
      WHERE project_id=$1 AND map_id=$2 AND feature_id=$3`,
    [projectId, mapId, featureId, parsed.type, JSON.stringify(parsed)],
  );
  if (result.rowCount !== 1) throw new Error("Feature not found in this map.");
}

export async function patchMapFeatureStyle(projectId: number, mapId: number, featureId: number, style: unknown) {
  const parsed = styleSchema.parse(style);
  const result = await pool.query(
    `UPDATE map_features
        SET style=COALESCE(style,'{}'::jsonb)||$4::jsonb,updated_at=now()
      WHERE project_id=$1 AND map_id=$2 AND feature_id=$3`,
    [projectId, mapId, featureId, JSON.stringify(parsed)],
  );
  if (result.rowCount !== 1) throw new Error("Feature not found in this map.");
}
