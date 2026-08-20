export type EntityImageUrlType = "person" | "race" | "culture" | "group" | "location";

export function hasUsableEntityImage(source?: string | null) {
  const value = source?.trim();
  return Boolean(value && value !== "noimage" && value !== "/noimg.jpg");
}

export function entityListImageUrl(projectId: number, entityType: EntityImageUrlType, entityId: number, source?: string | null) {
  if (!hasUsableEntityImage(source)) return null;
  const image = source!.trim();
  if (/^\/api\/media\/\d+$/.test(image)) {
    return `/api/admin/projects/${projectId}/entity-images/${entityType}/${entityId}/avatar`;
  }
  return image;
}
