import { z } from "zod";

const hexColor = z.string().trim().regex(/^#[0-9a-f]{6}$/i, "Farbe muss als Hex-Wert wie #6879C9 angegeben werden.");

export const mapPresentationStylePatchSchema = z.object({
  fill: hexColor.optional(),
  fillOpacity: z.coerce.number().min(0).max(1).optional(),
  stroke: hexColor.optional(),
  strokeWidth: z.coerce.number().min(0.5).max(12).optional(),
  autoStroke: z.boolean().optional(),
  labelVisible: z.boolean().optional(),
  labelColor: hexColor.optional(),
  labelSize: z.coerce.number().min(8).max(64).optional(),
  labelWeight: z.coerce.number().int().min(300).max(900).refine((value) => value % 100 === 0, "Schriftstärke muss in 100er-Schritten angegeben werden.").optional(),
  labelHalo: hexColor.optional(),
  labelHaloWidth: z.coerce.number().min(0).max(8).optional(),
  labelOpacity: z.coerce.number().min(0).max(1).optional(),
  labelOffsetX: z.coerce.number().min(-500).max(500).optional(),
  labelOffsetY: z.coerce.number().min(-500).max(500).optional(),
  labelMinZoom: z.union([z.coerce.number().min(0).max(30), z.null()]).optional(),
  labelMaxZoom: z.union([z.coerce.number().min(0).max(30), z.null()]).optional(),
  presentationVersion: z.literal(1).optional(),
}).strict().superRefine((value, context) => {
  if (value.labelMinZoom != null && value.labelMaxZoom != null && value.labelMinZoom > value.labelMaxZoom) {
    context.addIssue({ code: "custom", path: ["labelMaxZoom"], message: "Maximaler Label-Zoom muss mindestens so groß wie der minimale Zoom sein." });
  }
});

export const mapFeaturePresentationPatchSchema = z.object({
  label: z.string().trim().min(1, "Das Kartenlabel darf nicht leer sein.").max(200).optional(),
  style: mapPresentationStylePatchSchema.default({}),
  syncLoreName: z.boolean().default(false),
}).superRefine((value, context) => {
  if (value.label === undefined && Object.keys(value.style).length === 0) {
    context.addIssue({ code: "custom", message: "Die Darstellungsänderung enthält keine Werte." });
  }
  if (value.syncLoreName && value.label === undefined) {
    context.addIssue({ code: "custom", path: ["syncLoreName"], message: "Zum Synchronisieren des Lore-Namens muss ein Kartenlabel mitgesendet werden." });
  }
});

export type MapFeaturePresentationPatch = z.infer<typeof mapFeaturePresentationPatchSchema>;
