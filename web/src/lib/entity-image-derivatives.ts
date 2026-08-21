import "server-only";

import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { pool } from "@/lib/db";
import { normalizeEntityImageCrop, type EntityImageCrop } from "@/lib/entity-image-crop";
import { classifyDerivativeImageSource, imageReferenceUsesAvatarDerivative } from "@/lib/entity-image-source";
import { materializeLegacyRemoteEntityImage } from "@/lib/legacy-remote-image-materialize";
import { getMediaStorageRoot, localStorage } from "@/lib/storage";

export const ENTITY_AVATAR_SIZE = 256;
export type DerivableEntityType = "person" | "race" | "culture" | "group" | "location";

type DerivativeRow = {
  derivative_id: string;
  source_image: string;
  source_media_id: string | null;
  crop: unknown;
  storage_path: string;
  mime_type: string;
  size_bytes: string;
  width: number;
  height: number;
};

export type EntityImageDerivative = {
  derivativeId: number;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
};

type ResolvedDerivativeSource = {
  sourceKey: string;
  sourceMediaId: number | null;
  read(): Promise<Buffer>;
};

function usableImage(value: string | null | undefined) {
  const image = value?.trim() ?? "";
  return image && image !== "noimage" && image !== "/noimg.jpg" ? image : null;
}

async function getEntitySource(projectId: number, entityType: DerivableEntityType, entityId: number) {
  const queries: Record<DerivableEntityType, string> = {
    person: "SELECT image FROM npcs WHERE camp_id=$1 AND n_id=$2 AND archived_at IS NULL",
    race: "SELECT image FROM races WHERE project_id=$1 AND race_id=$2 AND archived_at IS NULL",
    culture: "SELECT image FROM cultures WHERE project_id=$1 AND culture_id=$2 AND archived_at IS NULL",
    group: "SELECT image FROM groups WHERE camp_id=$1 AND gr_id=$2 AND archived_at IS NULL",
    location: "SELECT coat_of_arm AS image FROM locations WHERE camp_id=$1 AND loc_id=$2 AND archived_at IS NULL",
  };
  const result = await pool.query<{ image: string | null }>(queries[entityType], [projectId, entityId]);
  return usableImage(result.rows[0]?.image);
}

async function getCrop(projectId: number, entityType: DerivableEntityType, entityId: number, sourceImage: string): Promise<EntityImageCrop | null> {
  if (entityType !== "person" && entityType !== "race" && entityType !== "culture") return null;
  const result = await pool.query<{ source_image: string; crop: unknown }>(
    "SELECT source_image,crop FROM entity_image_crops WHERE project_id=$1 AND entity_type=$2 AND entity_id=$3",
    [projectId, entityType, entityId],
  );
  const row = result.rows[0];
  return row?.source_image === sourceImage ? normalizeEntityImageCrop(row.crop) : null;
}

function sameCrop(left: unknown, right: EntityImageCrop | null) {
  const normalized = normalizeEntityImageCrop(left);
  if (!normalized || !right) return normalized === null && right === null;
  return normalized.x === right.x && normalized.y === right.y && normalized.zoom === right.zoom;
}

function squareExtract(width: number, height: number, crop: EntityImageCrop) {
  const zoom = Math.min(4, Math.max(1, crop.zoom));
  const side = Math.max(1, Math.min(width, height) / zoom);
  const focusX = width * Math.min(100, Math.max(0, crop.x)) / 100;
  const focusY = height * Math.min(100, Math.max(0, crop.y)) / 100;
  const left = Math.max(0, Math.min(width - side, focusX - side / 2));
  const top = Math.max(0, Math.min(height - side, focusY - side / 2));
  return {
    left: Math.max(0, Math.round(left)),
    top: Math.max(0, Math.round(top)),
    width: Math.max(1, Math.min(width, Math.round(side))),
    height: Math.max(1, Math.min(height, Math.round(side))),
  };
}

async function renderAvatar(source: Buffer, crop: EntityImageCrop | null) {
  const base = sharp(source, { failOn: "error" }).rotate();
  if (crop) {
    const metadata = await base.metadata();
    const width = metadata.width ?? 0, height = metadata.height ?? 0;
    if (width <= 0 || height <= 0) throw new Error("Bilddimensionen konnten für das Thumbnail nicht gelesen werden.");
    return base
      .extract(squareExtract(width, height, crop))
      .resize(ENTITY_AVATAR_SIZE, ENTITY_AVATAR_SIZE, { fit: "fill" })
      .webp({ quality: 78, effort: 4 })
      .toBuffer();
  }
  return base
    .resize(ENTITY_AVATAR_SIZE, ENTITY_AVATAR_SIZE, {
      fit: "contain",
      background: { r: 20, g: 23, b: 29, alpha: 1 },
    })
    .webp({ quality: 78, effort: 4 })
    .toBuffer();
}

async function existingDerivative(projectId: number, entityType: DerivableEntityType, entityId: number) {
  const result = await pool.query<DerivativeRow>(
    `SELECT derivative_id,source_image,source_media_id,crop,storage_path,mime_type,size_bytes,width,height
       FROM entity_image_derivatives
      WHERE project_id=$1 AND entity_type=$2 AND entity_id=$3 AND variant='avatar'`,
    [projectId, entityType, entityId],
  );
  return result.rows[0] ?? null;
}

function publicDerivative(row: DerivativeRow): EntityImageDerivative {
  return {
    derivativeId: Number(row.derivative_id),
    storagePath: row.storage_path,
    mimeType: row.mime_type || "image/webp",
    sizeBytes: Number(row.size_bytes),
    width: Number(row.width),
    height: Number(row.height),
  };
}

function localRootCandidates(localPath: string) {
  const webRoot = process.cwd();
  const repositoryRoot = path.resolve(webRoot, "..");
  if (localPath.startsWith("/uploads/")) {
    return [getMediaStorageRoot(), path.join(webRoot, "public", "uploads"), path.join(repositoryRoot, "uploads")];
  }
  if (localPath.startsWith("/img/")) {
    return [path.join(webRoot, "public", "img"), path.join(webRoot, "img"), path.join(repositoryRoot, "img")];
  }
  if (localPath.startsWith("/images/")) {
    return [path.join(webRoot, "public", "images"), path.join(webRoot, "images"), path.join(repositoryRoot, "images")];
  }
  return [];
}

async function resolveSafeLocalImage(localPath: string): Promise<ResolvedDerivativeSource | null> {
  const relative = localPath.replace(/^\/(?:img|images|uploads)\//, "");
  if (!relative || relative.includes("\\") || relative.split("/").some((segment) => segment === "..")) return null;

  for (const candidateRoot of localRootCandidates(localPath)) {
    try {
      const root = await realpath(candidateRoot);
      const candidate = path.resolve(root, ...relative.split("/"));
      const rootPrefix = `${root}${path.sep}`;
      if (candidate !== root && !candidate.startsWith(rootPrefix)) continue;
      const filePath = await realpath(candidate);
      if (filePath !== root && !filePath.startsWith(rootPrefix)) continue;
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) continue;
      const sourceKey = `local:${localPath}:${fileStat.size}:${Math.trunc(fileStat.mtimeMs)}`;
      return { sourceKey, sourceMediaId: null, read: () => readFile(filePath) };
    } catch {
      // Try the next explicitly allowed root. Missing paths are normal for legacy installations.
    }
  }
  return null;
}

export async function resolveDerivativeImageSource(projectId: number, sourceImage: string): Promise<ResolvedDerivativeSource | null> {
  const reference = classifyDerivativeImageSource(sourceImage);
  if (reference.kind === "managed_media") {
    const media = await pool.query<{ storage_path: string | null; external_url: string | null }>(
      "SELECT storage_path,external_url FROM media WHERE project_id=$1 AND media_id=$2",
      [projectId, reference.mediaId],
    );
    const row = media.rows[0];
    // Remote URL imports are persisted locally and intentionally retain external_url as provenance.
    // As long as storage_path exists, derivatives must be generated from the cached local bytes.
    if (!row?.storage_path) return null;
    return {
      sourceKey: `media:${reference.mediaId}:${row.storage_path}`,
      sourceMediaId: reference.mediaId,
      read: () => localStorage.read(row.storage_path!),
    };
  }
  if (reference.kind === "local_path") return resolveSafeLocalImage(reference.localPath);
  return null;
}

export async function deleteEntityAvatarDerivative(projectId: number, entityType: DerivableEntityType, entityId: number) {
  const result = await pool.query<{ storage_path: string }>(
    "DELETE FROM entity_image_derivatives WHERE project_id=$1 AND entity_type=$2 AND entity_id=$3 AND variant='avatar' RETURNING storage_path",
    [projectId, entityType, entityId],
  );
  if (result.rows[0]?.storage_path) await localStorage.delete(result.rows[0].storage_path).catch(() => undefined);
}

export async function ensureEntityAvatarDerivative(projectId: number, entityType: DerivableEntityType, entityId: number): Promise<EntityImageDerivative | null> {
  if (!Number.isSafeInteger(projectId) || projectId <= 0 || !Number.isSafeInteger(entityId) || entityId <= 0) return null;
  const [initialSourceImage, current] = await Promise.all([
    getEntitySource(projectId, entityType, entityId),
    existingDerivative(projectId, entityType, entityId),
  ]);
  if (!initialSourceImage) {
    if (current) await deleteEntityAvatarDerivative(projectId, entityType, entityId);
    return null;
  }

  let sourceImage = initialSourceImage;
  let source = await resolveDerivativeImageSource(projectId, sourceImage);
  if (!source && classifyDerivativeImageSource(sourceImage).kind === "external") {
    source = await materializeLegacyRemoteEntityImage(projectId, entityType, entityId, sourceImage);
  }
  if (!source) {
    if (current) await deleteEntityAvatarDerivative(projectId, entityType, entityId);
    return null;
  }

  // Legacy remote materialization rewrites both the entity image reference and the crop source from
  // the old URL to /api/media/<id>. Re-read the canonical image before reading the crop so the two
  // operations can never race and accidentally render an uncropped avatar.
  const canonicalSourceImage = await getEntitySource(projectId, entityType, entityId);
  if (canonicalSourceImage && canonicalSourceImage !== sourceImage) {
    const canonicalSource = await resolveDerivativeImageSource(projectId, canonicalSourceImage);
    if (canonicalSource) {
      sourceImage = canonicalSourceImage;
      source = canonicalSource;
    }
  }
  const crop = await getCrop(projectId, entityType, entityId, sourceImage);

  const currentMediaId = current?.source_media_id == null ? null : Number(current.source_media_id);
  if (current && current.source_image === source.sourceKey && currentMediaId === source.sourceMediaId && sameCrop(current.crop, crop)) {
    return publicDerivative(current);
  }

  const input = await source.read();
  const output = await renderAvatar(input, crop);
  const saved = await localStorage.save(output, "webp");
  try {
    const result = await pool.query<DerivativeRow>(
      `INSERT INTO entity_image_derivatives(project_id,entity_type,entity_id,variant,source_image,source_media_id,crop,storage_path,mime_type,size_bytes,width,height)
       VALUES($1,$2,$3,'avatar',$4,$5,$6::jsonb,$7,'image/webp',$8,$9,$9)
       ON CONFLICT(project_id,entity_type,entity_id,variant)
       DO UPDATE SET source_image=EXCLUDED.source_image,source_media_id=EXCLUDED.source_media_id,crop=EXCLUDED.crop,storage_path=EXCLUDED.storage_path,mime_type=EXCLUDED.mime_type,size_bytes=EXCLUDED.size_bytes,width=EXCLUDED.width,height=EXCLUDED.height,updated_at=now()
       RETURNING derivative_id,source_image,source_media_id,crop,storage_path,mime_type,size_bytes,width,height`,
      [projectId, entityType, entityId, source.sourceKey, source.sourceMediaId, crop ? JSON.stringify(crop) : null, saved.storagePath, output.length, ENTITY_AVATAR_SIZE],
    );
    if (current?.storage_path && current.storage_path !== saved.storagePath) await localStorage.delete(current.storage_path).catch(() => undefined);
    return publicDerivative(result.rows[0]);
  } catch (error) {
    await localStorage.delete(saved.storagePath).catch(() => undefined);
    throw error;
  }
}

export function entityAvatarDerivativeUrl(projectId: number, entityType: DerivableEntityType, entityId: number, sourceImage?: string | null) {
  if (imageReferenceUsesAvatarDerivative(sourceImage)) return `/api/admin/projects/${projectId}/entity-images/${entityType}/${entityId}/avatar`;
  return usableImage(sourceImage);
}
