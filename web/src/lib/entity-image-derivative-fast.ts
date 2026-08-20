import "server-only";

import { pool } from "@/lib/db";
import type { DerivableEntityType, EntityImageDerivative } from "@/lib/entity-image-derivatives";

export async function getExistingEntityAvatarDerivative(projectId: number, entityType: DerivableEntityType, entityId: number): Promise<EntityImageDerivative | null> {
  if (!Number.isSafeInteger(projectId) || projectId <= 0 || !Number.isSafeInteger(entityId) || entityId <= 0) return null;
  const result = await pool.query<{
    derivative_id: string;
    storage_path: string;
    mime_type: string;
    size_bytes: string;
    width: number;
    height: number;
  }>(
    `SELECT derivative_id,storage_path,mime_type,size_bytes,width,height
       FROM entity_image_derivatives
      WHERE project_id=$1 AND entity_type=$2 AND entity_id=$3 AND variant='avatar'
      LIMIT 1`,
    [projectId, entityType, entityId],
  );
  const row = result.rows[0];
  return row ? {
    derivativeId: Number(row.derivative_id),
    storagePath: row.storage_path,
    mimeType: row.mime_type || "image/webp",
    sizeBytes: Number(row.size_bytes),
    width: Number(row.width),
    height: Number(row.height),
  } : null;
}
