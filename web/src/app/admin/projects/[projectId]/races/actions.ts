"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/session";
import { pool } from "@/lib/db";
import {
  RACE_LOCATION_ROLE_OPTIONS,
  RACE_RELATION_OPTIONS,
  addRaceGeography,
  addRaceRelation,
  archiveRace,
  createRace,
  deleteRaceGeography,
  deleteRaceRelation,
  deleteRaceTrait,
  getRace,
  linkRaceCulture,
  unlinkRaceCulture,
  updateRace,
  updateRaceBiology,
  upsertRaceTrait,
  type RaceLocationRole,
  type RaceRelationType,
} from "@/lib/entities/races";
import { entityImageCropFromForm } from "@/lib/entity-image-crop";
import { getEntityImageProfile, saveEntityImageProfile } from "@/lib/entity-image-profiles";
import { resolveEntityImageSource } from "@/lib/media";
import { getProject } from "@/lib/projects";
import { RACE_BIOLOGY_FIELDS } from "@/lib/race-worldbuilding";

function text(formData: FormData, name: string) { return String(formData.get(name) ?? "").trim(); }
function nullableNumber(formData: FormData, name: string) { const raw = text(formData, name); if (!raw) return null; const value = Number(raw); return Number.isFinite(value) ? value : null; }
function optionalId(formData: FormData, name: string) { const value = nullableNumber(formData, name); return value && Number.isSafeInteger(value) && value > 0 ? Math.trunc(value) : null; }
async function assertProject(projectId: number) { if (!Number.isSafeInteger(projectId) || projectId <= 0 || !(await getProject(projectId))) throw new Error("Invalid project context"); }
function refreshRace(projectId: number, raceId: number) { revalidatePath(`/admin/projects/${projectId}/races`); revalidatePath(`/admin/projects/${projectId}/races/${raceId}`); revalidatePath(`/admin/projects/${projectId}/races/${raceId}/image`); revalidatePath(`/admin/projects/${projectId}/cultures`); revalidatePath(`/admin/projects/${projectId}/map`); }

function raceInput(formData: FormData, image: string, imageMediaId: number | null) {
  const originMapId = nullableNumber(formData, "originMapId"); const originCoordinateMode = text(formData, "originCoordinateMode"); const parentRaceId = nullableNumber(formData, "parentRaceId");
  return { name: text(formData, "name"), parentRaceId: parentRaceId && parentRaceId > 0 ? Math.trunc(parentRaceId) : null, masculineName: text(formData, "masculineName") || null, feminineName: text(formData, "feminineName") || null, hermaphroditeName: text(formData, "hermaphroditeName") || null, description: text(formData, "description") || null, image, imageMediaId, originMapId: originMapId && originMapId > 0 ? Math.trunc(originMapId) : null, originCoordinateMode: originMapId && (originCoordinateMode === "xy" || originCoordinateMode === "latlng") ? originCoordinateMode : null, originX: originMapId ? nullableNumber(formData, "originX") : null, originY: originMapId ? nullableNumber(formData, "originY") : null, originLat: originMapId ? nullableNumber(formData, "originLat") : null, originLng: originMapId ? nullableNumber(formData, "originLng") : null } as const;
}

export async function createRaceAction(projectId: number, formData: FormData) { await requireAdminSession(); await assertProject(projectId); const name = text(formData, "name"); const source = await resolveEntityImageSource(projectId, formData, { title: name || "Spezies" }); const created = await createRace(projectId, raceInput(formData, source.image, source.mediaId)); await saveEntityImageProfile(projectId,"race",created.raceId,source.image,entityImageCropFromForm(formData)); redirect(`/admin/projects/${projectId}/races/${created.raceId}`); }
export async function updateRaceAction(projectId: number, raceId: number, formData: FormData) { await requireAdminSession(); await assertProject(projectId); const current = await getRace(projectId, raceId); if (!current) throw new Error("Spezies wurde nicht gefunden."); const source = await resolveEntityImageSource(projectId, formData, { current: current.image, title: current.name }); const imageMediaId = source.uploaded ? source.mediaId : source.removed || source.image !== current.image ? null : current.imageMediaId; await updateRace(projectId, raceId, raceInput(formData, source.image, imageMediaId)); if(formData.has("imageCrop")||source.uploaded||source.removed||source.image!==current.image)await saveEntityImageProfile(projectId,"race",raceId,source.image,entityImageCropFromForm(formData)); refreshRace(projectId,raceId); revalidatePath(`/admin/projects/${projectId}/npcs`); revalidatePath(`/admin/projects/${projectId}/characters`); }
export async function updateRaceImageAction(projectId:number,raceId:number,formData:FormData){
  await requireAdminSession();
  await assertProject(projectId);
  const current=await getRace(projectId,raceId);
  if(!current)throw new Error("Spezies wurde nicht gefunden.");
  const source=await resolveEntityImageSource(projectId,formData,{current:current.image,title:current.name});
  const imageMediaId=source.uploaded?source.mediaId:source.removed||source.image!==current.image?null:current.imageMediaId;
  const requestedCrop=entityImageCropFromForm(formData);
  const updated=await pool.query("UPDATE races SET image=$3,image_media_id=$4,updated_at=now() WHERE project_id=$1 AND race_id=$2 AND archived_at IS NULL",[projectId,raceId,source.image,imageMediaId]);
  if(updated.rowCount!==1)throw new Error("Spezies wurde nicht gefunden.");
  await saveEntityImageProfile(projectId,"race",raceId,source.image,requestedCrop);
  if(requestedCrop){
    const persisted=await getEntityImageProfile(projectId,"race",raceId,source.image);
    if(!persisted)throw new Error("Der 1:1-Zuschnitt konnte nicht dauerhaft gespeichert werden.");
  }
  refreshRace(projectId,raceId);
  if(text(formData,"returnTo")==="detail")redirect(`/admin/projects/${projectId}/races/${raceId}?imageSaved=1`);
  redirect(`/admin/projects/${projectId}/races/${raceId}/image?saved=1`);
}

export async function updateRaceBiologyAction(projectId: number, raceId: number, formData: FormData) {
  await requireAdminSession(); await assertProject(projectId); const values: Record<string, unknown> = {};
  for (const field of RACE_BIOLOGY_FIELDS) { const raw = text(formData, field.key); if (!raw) continue; values[field.key] = field.kind === "number" ? Number(raw) : raw; }
  await updateRaceBiology(projectId, raceId, values); refreshRace(projectId,raceId);
}
export async function upsertRaceTraitAction(projectId: number, raceId: number, formData: FormData) { await requireAdminSession(); await upsertRaceTrait(projectId,raceId,{label:text(formData,"label"),value:text(formData,"value"),unit:text(formData,"unit")||null,notes:text(formData,"notes")||null,traitKey:text(formData,"traitKey")||null}); refreshRace(projectId,raceId); }
export async function deleteRaceTraitAction(projectId: number, raceId: number, traitId: number) { await requireAdminSession(); await deleteRaceTrait(projectId,raceId,traitId); refreshRace(projectId,raceId); }

export async function addRaceGeographyAction(projectId: number, raceId: number, formData: FormData) { await requireAdminSession(); const locationId=optionalId(formData,"locationId"); const role=text(formData,"role") as RaceLocationRole; if(!locationId||!RACE_LOCATION_ROLE_OPTIONS.some((option)=>option.value===role))throw new Error("Ort und geografische Rolle werden benötigt."); await addRaceGeography(projectId,raceId,locationId,role,text(formData,"notes")||null); refreshRace(projectId,raceId); }
export async function deleteRaceGeographyAction(projectId: number, raceId: number, linkId: number) { await requireAdminSession(); await deleteRaceGeography(projectId,raceId,linkId); refreshRace(projectId,raceId); }

export async function addRaceRelationAction(projectId: number, raceId: number, formData: FormData) { await requireAdminSession(); const relatedRaceId=optionalId(formData,"relatedRaceId"); const relationType=text(formData,"relationType") as RaceRelationType; if(!relatedRaceId||!RACE_RELATION_OPTIONS.some((option)=>option.value===relationType))throw new Error("Verwandte Spezies und Beziehungstyp werden benötigt."); await addRaceRelation(projectId,raceId,relatedRaceId,relationType,text(formData,"notes")||null); refreshRace(projectId,raceId); }
export async function deleteRaceRelationAction(projectId: number, raceId: number, relationId: number) { await requireAdminSession(); await deleteRaceRelation(projectId,raceId,relationId); refreshRace(projectId,raceId); }

export async function linkRaceCultureAction(projectId: number, raceId: number, formData: FormData) { await requireAdminSession(); const cultureId=optionalId(formData,"cultureId"); if(!cultureId)throw new Error("Kultur auswählen."); await linkRaceCulture(projectId,raceId,cultureId,formData.get("isPrimary")==="on",text(formData,"notes")||null); refreshRace(projectId,raceId); revalidatePath(`/admin/projects/${projectId}/cultures/${cultureId}`); }
export async function unlinkRaceCultureAction(projectId: number, raceId: number, cultureId: number) { await requireAdminSession(); await unlinkRaceCulture(projectId,raceId,cultureId); refreshRace(projectId,raceId); revalidatePath(`/admin/projects/${projectId}/cultures/${cultureId}`); }
export async function archiveRaceAction(projectId: number, raceId: number) { await requireAdminSession(); await assertProject(projectId); await archiveRace(projectId, raceId); redirect(`/admin/projects/${projectId}/races`); }
