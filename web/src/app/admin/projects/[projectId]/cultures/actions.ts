"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/session";
import { archiveCulture, createCulture, getCulture, linkCultureRace, unlinkCultureRace, updateCulture } from "@/lib/entities/cultures";
import { entityImageCropFromForm } from "@/lib/entity-image-crop";
import { saveEntityImageProfile } from "@/lib/entity-image-profiles";
import { formCheckbox, formEnum, formOptionalId, formOptionalText, formText } from "@/lib/form-data";
import { resolveEntityImageSource } from "@/lib/media";
import { getProject } from "@/lib/projects";

const VISIBILITY=["admin_only","all_players","selected_players"] as const;
async function assertProject(projectId:number){if(!Number.isSafeInteger(projectId)||projectId<=0||!(await getProject(projectId)))throw new Error("Die ausgewählte Welt wurde nicht gefunden oder ist archiviert.");}
function input(formData: FormData, image: string, imageMediaId: number | null) {
  return {
    name: formText(formData, "name"), description: formOptionalText(formData, "description"), image, imageMediaId,
    primaryLocationId: formOptionalId(formData, "primaryLocationId"),
    visibilityMode: formEnum(formData,"visibilityMode",VISIBILITY,"admin_only"),
  };
}

export async function createCultureAction(projectId: number, formData: FormData) {
  await requireAdminSession(); await assertProject(projectId); const name = formText(formData, "name");
  const source = await resolveEntityImageSource(projectId, formData, { title: name || "Kultur" });
  const created = await createCulture(projectId, input(formData, source.image, source.mediaId));
  await saveEntityImageProfile(projectId, "culture", created.cultureId, source.image, entityImageCropFromForm(formData));
  redirect(`/admin/projects/${projectId}/cultures/${created.cultureId}`);
}

export async function updateCultureAction(projectId: number, cultureId: number, formData: FormData) {
  await requireAdminSession(); await assertProject(projectId); const current = await getCulture(projectId, cultureId); if (!current) throw new Error("Die Kultur wurde nicht gefunden oder gehört nicht zu dieser Welt.");
  const source = await resolveEntityImageSource(projectId, formData, { current: current.image, title: current.name });
  const imageMediaId = source.uploaded ? source.mediaId : source.removed || source.image !== current.image ? null : current.imageMediaId;
  await updateCulture(projectId, cultureId, input(formData, source.image, imageMediaId));
  if (formData.has("imageCrop") || source.uploaded || source.removed || source.image !== current.image) {
    await saveEntityImageProfile(projectId, "culture", cultureId, source.image, entityImageCropFromForm(formData));
  }
  revalidatePath(`/admin/projects/${projectId}/cultures`); revalidatePath(`/admin/projects/${projectId}/cultures/${cultureId}`);
}

export async function linkCultureRaceAction(projectId: number, cultureId: number, formData: FormData) {
  await requireAdminSession(); await assertProject(projectId); const raceId = formOptionalId(formData, "raceId"); if (!raceId) throw new Error("Spezies / Subspezies ist ein Pflichtfeld.");
  await linkCultureRace(projectId, cultureId, raceId, formCheckbox(formData,"isPrimary"), formOptionalText(formData, "notes"));
  revalidatePath(`/admin/projects/${projectId}/cultures/${cultureId}`); revalidatePath(`/admin/projects/${projectId}/races/${raceId}`);
}
export async function unlinkCultureRaceAction(projectId: number, cultureId: number, raceId: number) { await requireAdminSession(); await assertProject(projectId); await unlinkCultureRace(projectId, cultureId, raceId); revalidatePath(`/admin/projects/${projectId}/cultures/${cultureId}`); revalidatePath(`/admin/projects/${projectId}/races/${raceId}`); }
export async function archiveCultureAction(projectId: number, cultureId: number) { await requireAdminSession(); await assertProject(projectId); await archiveCulture(projectId, cultureId); redirect(`/admin/projects/${projectId}/cultures`); }
