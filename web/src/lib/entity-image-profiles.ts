import "server-only";

import { pool } from "@/lib/db";
import { normalizeEntityImageCrop, type EntityImageCrop } from "@/lib/entity-image-crop";
import { deleteEntityAvatarDerivative, ensureEntityAvatarDerivative } from "@/lib/entity-image-derivatives";

export type CroppableEntityType = "person" | "race" | "culture";
export type EntityImageProfile = { sourceImage: string; crop: EntityImageCrop };

async function assertTarget(projectId: number, entityType: CroppableEntityType, entityId: number) {
  if (!Number.isSafeInteger(projectId) || projectId <= 0 || !Number.isSafeInteger(entityId) || entityId <= 0) throw new Error("Ungültiges Bildprofil-Ziel.");
  const query = entityType === "person"
    ? "SELECT 1 FROM npcs WHERE camp_id=$1 AND n_id=$2 AND archived_at IS NULL"
    : entityType === "race"
      ? "SELECT 1 FROM races WHERE project_id=$1 AND race_id=$2 AND archived_at IS NULL"
      : "SELECT 1 FROM cultures WHERE project_id=$1 AND culture_id=$2 AND archived_at IS NULL";
  const result = await pool.query(query, [projectId, entityId]);
  if (result.rowCount !== 1) throw new Error("Das Bildprofil gehört nicht zu dieser Welt.");
}

export async function getEntityImageProfile(projectId: number, entityType: CroppableEntityType, entityId: number, currentImage?: string | null): Promise<EntityImageProfile | null> {
  const result = await pool.query<{ source_image: string; crop: unknown }>(
    "SELECT source_image,crop FROM entity_image_crops WHERE project_id=$1 AND entity_type=$2 AND entity_id=$3",
    [projectId, entityType, entityId],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (currentImage != null && row.source_image !== currentImage) return null;
  const crop = normalizeEntityImageCrop(row.crop);
  return crop ? { sourceImage: row.source_image, crop } : null;
}

export async function listEntityImageProfiles(projectId: number, entityType: CroppableEntityType, entityIds: number[]) {
  const ids = [...new Set(entityIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return new Map<number, EntityImageProfile>();
  const result = await pool.query<{ entity_id: number; source_image: string; crop: unknown }>(
    "SELECT entity_id::int,source_image,crop FROM entity_image_crops WHERE project_id=$1 AND entity_type=$2 AND entity_id=ANY($3::bigint[])",
    [projectId, entityType, ids],
  );
  const profiles = new Map<number, EntityImageProfile>();
  for (const row of result.rows) {
    const crop = normalizeEntityImageCrop(row.crop);
    if (crop) profiles.set(Number(row.entity_id), { sourceImage: row.source_image, crop });
  }
  return profiles;
}

export async function saveEntityImageProfile(projectId: number, entityType: CroppableEntityType, entityId: number, sourceImage: string, crop: EntityImageCrop | null) {
  await assertTarget(projectId, entityType, entityId);
  const image = sourceImage.trim();
  if (!crop || !image || image === "noimage" || image === "/noimg.jpg") {
    await pool.query("DELETE FROM entity_image_crops WHERE project_id=$1 AND entity_type=$2 AND entity_id=$3", [projectId, entityType, entityId]);
    if (!image || image === "noimage" || image === "/noimg.jpg") await deleteEntityAvatarDerivative(projectId, entityType, entityId);
    else await ensureEntityAvatarDerivative(projectId, entityType, entityId);
    return;
  }
  const normalized = normalizeEntityImageCrop(crop);
  if (!normalized) throw new Error("Ungültiger Profilbild-Zuschnitt.");
  await pool.query(
    `INSERT INTO entity_image_crops(project_id,entity_type,entity_id,source_image,crop)
     VALUES($1,$2,$3,$4,$5::jsonb)
     ON CONFLICT(project_id,entity_type,entity_id)
     DO UPDATE SET source_image=EXCLUDED.source_image,crop=EXCLUDED.crop,updated_at=now()`,
    [projectId, entityType, entityId, image, JSON.stringify(normalized)],
  );
  await ensureEntityAvatarDerivative(projectId, entityType, entityId);
}
