import "server-only";

import { pool } from "@/lib/db";
import { normalizeEntityImageCrop, type EntityImageCrop } from "@/lib/entity-image-crop";
import type { DerivableEntityType, EntityImageDerivative } from "@/lib/entity-image-derivatives";

type FastConfig = {
  table: string;
  projectColumn: string;
  idColumn: string;
  imageColumn: string;
  croppable: boolean;
};

const CONFIG: Record<DerivableEntityType, FastConfig> = {
  person: { table: "npcs", projectColumn: "camp_id", idColumn: "n_id", imageColumn: "image", croppable: true },
  race: { table: "races", projectColumn: "project_id", idColumn: "race_id", imageColumn: "image", croppable: true },
  culture: { table: "cultures", projectColumn: "project_id", idColumn: "culture_id", imageColumn: "image", croppable: true },
  group: { table: "groups", projectColumn: "camp_id", idColumn: "gr_id", imageColumn: "image", croppable: false },
  location: { table: "locations", projectColumn: "camp_id", idColumn: "loc_id", imageColumn: "coat_of_arm", croppable: false },
};

type FastDerivativeRow = {
  derivative_id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: string;
  width: number;
  height: number;
  source_image: string;
  source_media_id: string;
  derivative_crop: unknown;
  current_image: string | null;
  crop_source_image: string | null;
  current_crop: unknown;
  media_storage_path: string | null;
};

function sameCrop(left: unknown, right: EntityImageCrop | null) {
  const normalized = normalizeEntityImageCrop(left);
  if (!normalized || !right) return normalized === null && right === null;
  return normalized.x === right.x && normalized.y === right.y && normalized.zoom === right.zoom;
}

export async function getExistingEntityAvatarDerivative(projectId: number, entityType: DerivableEntityType, entityId: number): Promise<EntityImageDerivative | null> {
  if (!Number.isSafeInteger(projectId) || projectId <= 0 || !Number.isSafeInteger(entityId) || entityId <= 0) return null;
  const config = CONFIG[entityType];
  const cropJoin = config.croppable
    ? "LEFT JOIN entity_image_crops c ON c.project_id=d.project_id AND c.entity_type=d.entity_type AND c.entity_id=d.entity_id"
    : "LEFT JOIN entity_image_crops c ON false";
  const result = await pool.query<FastDerivativeRow>(
    `SELECT d.derivative_id,d.storage_path,d.mime_type,d.size_bytes,d.width,d.height,
            d.source_image,d.source_media_id,d.crop AS derivative_crop,
            e.${config.imageColumn} AS current_image,
            c.source_image AS crop_source_image,c.crop AS current_crop,
            m.storage_path AS media_storage_path
       FROM entity_image_derivatives d
       JOIN ${config.table} e ON e.${config.projectColumn}=d.project_id AND e.${config.idColumn}=d.entity_id
       JOIN media m ON m.project_id=d.project_id AND m.media_id=d.source_media_id
       ${cropJoin}
      WHERE d.project_id=$1 AND d.entity_type=$2 AND d.entity_id=$3 AND d.variant='avatar'
        AND d.source_media_id IS NOT NULL
      LIMIT 1`,
    [projectId, entityType, entityId],
  );
  const row = result.rows[0];
  if (!row?.media_storage_path) return null;

  const mediaId = Number(row.source_media_id);
  if (!Number.isSafeInteger(mediaId) || mediaId <= 0) return null;
  const currentImage = row.current_image?.trim() ?? "";
  if (currentImage !== `/api/media/${mediaId}`) return null;
  if (row.source_image !== `media:${mediaId}:${row.media_storage_path}`) return null;

  if (config.croppable) {
    const currentCrop = row.crop_source_image === currentImage ? normalizeEntityImageCrop(row.current_crop) : null;
    if (!sameCrop(row.derivative_crop, currentCrop)) return null;
  }

  return {
    derivativeId: Number(row.derivative_id),
    storagePath: row.storage_path,
    mimeType: row.mime_type || "image/webp",
    sizeBytes: Number(row.size_bytes),
    width: Number(row.width),
    height: Number(row.height),
  };
}
