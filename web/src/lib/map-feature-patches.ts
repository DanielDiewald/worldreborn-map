import "server-only";

import { z } from "zod";
import { pool } from "@/lib/db";

const geometrySchema = z.object({
  type: z.enum(["Point", "LineString", "Polygon", "MultiPoint", "MultiLineString", "MultiPolygon"]),
  coordinates: z.unknown(),
}).passthrough();

const styleSchema = z.record(z.string(), z.unknown());
const metadataPatchSchema = z.record(z.string(), z.unknown());
const topologyPeerSchema = z.object({
  featureId: z.coerce.number().int().positive(),
  geometry: geometrySchema,
});

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

export async function patchMapFeatureGeometryBatch(
  projectId: number,
  mapId: number,
  featureId: number,
  geometry: unknown,
  peers: unknown,
) {
  const primary = geometrySchema.parse(geometry);
  const parsedPeers = z.array(topologyPeerSchema).max(40).parse(peers ?? []);
  const uniquePeers = new Map<number, z.infer<typeof geometrySchema>>();
  for (const peer of parsedPeers) {
    if (peer.featureId === featureId) continue;
    uniquePeers.set(peer.featureId, peer.geometry);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ids = [featureId, ...uniquePeers.keys()];
    const existing = await client.query<{ feature_id: string }>(
      `SELECT feature_id
         FROM map_features
        WHERE project_id=$1 AND map_id=$2 AND feature_id=ANY($3::bigint[])
        FOR UPDATE`,
      [projectId, mapId, ids],
    );
    if (existing.rowCount !== ids.length) throw new Error("One or more topology features no longer exist on this map.");

    await client.query(
      `UPDATE map_features
          SET geometry_type=$4,geometry=$5::jsonb,updated_at=now()
        WHERE project_id=$1 AND map_id=$2 AND feature_id=$3`,
      [projectId, mapId, featureId, primary.type, JSON.stringify(primary)],
    );

    for (const [peerId, peerGeometry] of uniquePeers) {
      await client.query(
        `UPDATE map_features
            SET geometry_type=$4,geometry=$5::jsonb,updated_at=now()
          WHERE project_id=$1 AND map_id=$2 AND feature_id=$3`,
        [projectId, mapId, peerId, peerGeometry.type, JSON.stringify(peerGeometry)],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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

export async function patchMapFeatureMetadata(projectId: number, mapId: number, featureId: number, metadata: unknown) {
  const parsed = metadataPatchSchema.parse(metadata);
  const result = await pool.query(
    `UPDATE map_features
        SET metadata=COALESCE(metadata,'{}'::jsonb)||$4::jsonb,updated_at=now()
      WHERE project_id=$1 AND map_id=$2 AND feature_id=$3`,
    [projectId, mapId, featureId, JSON.stringify(parsed)],
  );
  if (result.rowCount !== 1) throw new Error("Feature not found in this map.");
}
