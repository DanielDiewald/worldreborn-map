import { z } from "zod";

export const entityImageCropSchema = z.object({
  x: z.coerce.number().finite().min(0).max(100),
  y: z.coerce.number().finite().min(0).max(100),
  zoom: z.coerce.number().finite().min(1).max(4),
});

export type EntityImageCrop = z.infer<typeof entityImageCropSchema>;

export function normalizeEntityImageCrop(value: unknown): EntityImageCrop | null {
  if (value == null || value === "") return null;
  let candidate = value;
  if (typeof value === "string") {
    try { candidate = JSON.parse(value); } catch { return null; }
  }
  const parsed = entityImageCropSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function entityImageCropFromForm(formData: FormData, name = "imageCrop") {
  return normalizeEntityImageCrop(formData.get(name));
}
