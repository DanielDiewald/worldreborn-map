import type { EntityImageCrop } from "@/lib/entity-image-crop";

// Bump this whenever the generated avatar pixels change for the same source + crop.
// The version is part of source_image, so old derivatives are regenerated lazily on first use.
export const ENTITY_AVATAR_RENDER_VERSION = 2;

export function entityAvatarManagedSourceKey(mediaId: number, storagePath: string) {
  return `avatar-v${ENTITY_AVATAR_RENDER_VERSION}:media:${mediaId}:${storagePath}`;
}

export function entityAvatarLocalSourceKey(localPath: string, size: number, mtimeMs: number) {
  return `avatar-v${ENTITY_AVATAR_RENDER_VERSION}:local:${localPath}:${size}:${Math.trunc(mtimeMs)}`;
}

/**
 * Convert the editor's square preview semantics to a Sharp extract rectangle.
 *
 * The editor renders the image with object-fit: cover, object-position: x/y and then scales the
 * square element around the same x/y transform origin. For a square output this means x/y select
 * the crop window's position across the remaining source overflow: 0% = left/top, 50% = centered,
 * 100% = right/bottom. Using x/y as a focal-point center produces a visibly different crop.
 */
export function entityAvatarExtractRect(width: number, height: number, crop: EntityImageCrop) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Ungültige Bilddimensionen für den Profilzuschnitt.");
  }
  const zoom = Math.min(4, Math.max(1, Number.isFinite(crop.zoom) ? crop.zoom : 1));
  const x = Math.min(100, Math.max(0, Number.isFinite(crop.x) ? crop.x : 50)) / 100;
  const y = Math.min(100, Math.max(0, Number.isFinite(crop.y) ? crop.y : 50)) / 100;
  const side = Math.max(1, Math.min(width, height, Math.round(Math.min(width, height) / zoom)));
  const left = Math.max(0, Math.min(width - side, Math.round((width - side) * x)));
  const top = Math.max(0, Math.min(height - side, Math.round((height - side) * y)));
  return { left, top, width: side, height: side };
}
