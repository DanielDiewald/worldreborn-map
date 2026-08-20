"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/session";
import { archiveCulture, createCulture, getCulture, linkCultureRace, unlinkCultureRace, updateCulture } from "@/lib/entities/cultures";
import { entityImageCropFromForm } from "@/lib/entity-image-crop";
import { saveEntityImageProfile } from "@/lib/entity-image-profiles";
import { resolveEntityImageSource } from "@/lib/media";

function text(formData: FormData, name: string) { return String(formData.get(name) ?? "").trim(); }
function optionalId(formData: FormData, name: string) { const value = Number(text(formData, name)); return Number.isSafeInteger(value) && value > 0 ? value : null; }
function input(formData: FormData, image: string, imageMediaId: number | null) {
  return {
    name: text(formData, "name"), description: text(formData, "description") || null, image, imageMediaId,
    primaryLocationId: optionalId(formData, "primaryLocationId"),
    visibilityMode: ["admin_only", "all_players", "selected_players"].includes(text(formData, "visibilityMode")) ? text(formData, "visibilityMode") as "admin_only" | "all_players" | "selected_players" : "admin_only" as const,
  };
}

export async function createCultureAction(projectId: number, formData: FormData) {
  await requireAdminSession(); const name = text(formData, "name");
  const source = await resolveEntityImageSource(projectId, formData, { title: name || "Kultur" });
  const created = await createCulture(projectId, input(formData, source.image, source.mediaId));
  await saveEntityImageProfile(projectId, "culture", created.cultureId, source.image, entityImageCropFromForm(formData));
  redirect(`/admin/projects/${projectId}/cultures/${created.cultureId}`);
}

export async function updateCultureAction(projectId: number, cultureId: number, formData: FormData) {
  await requireAdminSession(); const current = await getCulture(projectId, cultureId); if (!current) throw new Error("Kultur wurde nicht gefunden.");
  const source = await resolveEntityImageSource(projectId, formData, { current: current.image, title: current.name });
  const imageMediaId = source.uploaded ? source.mediaId : source.removed || source.image !== current.image ? null : current.imageMediaId;
  await updateCulture(projectId, cultureId, input(formData, source.image, imageMediaId));
  if (formData.has("imageCrop") || source.uploaded || source.removed || source.image !== current.image) {
    await saveEntityImageProfile(projectId, "culture", cultureId, source.image, entityImageCropFromForm(formData));
  }
  revalidatePath(`/admin/projects/${projectId}/cultures`); revalidatePath(`/admin/projects/${projectId}/cultures/${cultureId}`);
}

export async function linkCultureRaceAction(projectId: number, cultureId: number, formData: FormData) {
  await requireAdminSession(); const raceId = optionalId(formData, "raceId"); if (!raceId) throw new Error("Spezies auswählen.");
  await linkCultureRace(projectId, cultureId, raceId, formData.get("isPrimary") === "on", text(formData, "notes") || null);
  revalidatePath(`/admin/projects/${projectId}/cultures/${cultureId}`); revalidatePath(`/admin/projects/${projectId}/races/${raceId}`);
}
export async function unlinkCultureRaceAction(projectId: number, cultureId: number, raceId: number) { await requireAdminSession(); await unlinkCultureRace(projectId, cultureId, raceId); revalidatePath(`/admin/projects/${projectId}/cultures/${cultureId}`); revalidatePath(`/admin/projects/${projectId}/races/${raceId}`); }
export async function archiveCultureAction(projectId: number, cultureId: number) { await requireAdminSession(); await archiveCulture(projectId, cultureId); redirect(`/admin/projects/${projectId}/cultures`); }
