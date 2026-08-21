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
import { formCheckbox, formOptionalId, formOptionalNumber, formOptionalText, formText } from "@/lib/form-data";
import { resolveEntityImageSource } from "@/lib/media";
import { getProject } from "@/lib/projects";
import { RACE_BIOLOGY_FIELDS } from "@/lib/race-worldbuilding";

async function assertProject(projectId: number) { if (!Number.isSafeInteger(projectId) || projectId <= 0 || !(await getProject(projectId))) throw new Error("Die ausgewählte Welt wurde nicht gefunden oder ist archiviert."); }
async function assertLocation(projectId:number,locationId:number){const row=await pool.query("SELECT 1 FROM locations WHERE camp_id=$1 AND loc_id=$2 AND archived_at IS NULL",[projectId,locationId]);if(row.rowCount!==1)throw new Error("Der ausgewählte Ort gehört nicht zu dieser Welt oder ist archiviert.");}
async function assertCulture(projectId:number,cultureId:number){const row=await pool.query("SELECT 1 FROM cultures WHERE project_id=$1 AND culture_id=$2 AND archived_at IS NULL",[projectId,cultureId]);if(row.rowCount!==1)throw new Error("Die ausgewählte Kultur gehört nicht zu dieser Welt oder ist archiviert.");}
function refreshRace(projectId: number, raceId: number) { revalidatePath(`/admin/projects/${projectId}/races`); revalidatePath(`/admin/projects/${projectId}/races/${raceId}`); revalidatePath(`/admin/projects/${projectId}/races/${raceId}/image`); revalidatePath(`/admin/projects/${projectId}/cultures`); revalidatePath(`/admin/projects/${projectId}/map`); }

function raceInput(formData: FormData, image: string, imageMediaId: number | null) {
  const originMapId = formOptionalId(formData, "originMapId"); const originCoordinateMode = formText(formData, "originCoordinateMode"); const parentRaceId = formOptionalId(formData, "parentRaceId");
  return { name: formText(formData, "name"), parentRaceId, masculineName: formOptionalText(formData, "masculineName"), feminineName: formOptionalText(formData, "feminineName"), hermaphroditeName: formOptionalText(formData, "hermaphroditeName"), description: formOptionalText(formData, "description"), image, imageMediaId, originMapId, originCoordinateMode: originMapId && (originCoordinateMode === "xy" || originCoordinateMode === "latlng") ? originCoordinateMode : null, originX: originMapId ? formOptionalNumber(formData, "originX") : null, originY: originMapId ? formOptionalNumber(formData, "originY") : null, originLat: originMapId ? formOptionalNumber(formData, "originLat") : null, originLng: originMapId ? formOptionalNumber(formData, "originLng") : null } as const;
}

export async function createRaceAction(projectId: number, formData: FormData) { await requireAdminSession(); await assertProject(projectId); const name = formText(formData, "name"); const source = await resolveEntityImageSource(projectId, formData, { title: name || "Spezies" }); const created = await createRace(projectId, raceInput(formData, source.image, source.mediaId)); await saveEntityImageProfile(projectId,"race",created.raceId,source.image,entityImageCropFromForm(formData)); redirect(`/admin/projects/${projectId}/races/${created.raceId}`); }
export async function updateRaceAction(projectId: number, raceId: number, formData: FormData) { await requireAdminSession(); await assertProject(projectId); const current = await getRace(projectId, raceId); if (!current) throw new Error("Die Spezies wurde nicht gefunden oder gehört nicht zu dieser Welt."); const source = await resolveEntityImageSource(projectId, formData, { current: current.image, title: current.name }); const imageMediaId = source.uploaded ? source.mediaId : source.removed || source.image !== current.image ? null : current.imageMediaId; await updateRace(projectId, raceId, raceInput(formData, source.image, imageMediaId)); if(formData.has("imageCrop")||source.uploaded||source.removed||source.image!==current.image)await saveEntityImageProfile(projectId,"race",raceId,source.image,entityImageCropFromForm(formData)); refreshRace(projectId,raceId); revalidatePath(`/admin/projects/${projectId}/npcs`); revalidatePath(`/admin/projects/${projectId}/characters`); }
export async function updateRaceImageAction(projectId:number,raceId:number,formData:FormData){
  await requireAdminSession(); await assertProject(projectId);
  const current=await getRace(projectId,raceId); if(!current)throw new Error("Die Spezies wurde nicht gefunden oder gehört nicht zu dieser Welt.");
  const source=await resolveEntityImageSource(projectId,formData,{current:current.image,title:current.name});
  const imageMediaId=source.uploaded?source.mediaId:source.removed||source.image!==current.image?null:current.imageMediaId;
  const requestedCrop=entityImageCropFromForm(formData);
  const updated=await pool.query("UPDATE races SET image=$3,image_media_id=$4,updated_at=now() WHERE project_id=$1 AND race_id=$2 AND archived_at IS NULL",[projectId,raceId,source.image,imageMediaId]);
  if(updated.rowCount!==1)throw new Error("Die Spezies wurde zwischenzeitlich archiviert oder gelöscht.");
  await saveEntityImageProfile(projectId,"race",raceId,source.image,requestedCrop);
  if(requestedCrop){const persisted=await getEntityImageProfile(projectId,"race",raceId,source.image);if(!persisted)throw new Error("Der 1:1-Zuschnitt konnte nicht dauerhaft gespeichert werden.");}
  refreshRace(projectId,raceId);
  if(formText(formData,"returnTo")==="detail")redirect(`/admin/projects/${projectId}/races/${raceId}?imageSaved=1`);
  redirect(`/admin/projects/${projectId}/races/${raceId}/image?saved=1`);
}

export async function updateRaceBiologyAction(projectId: number, raceId: number, formData: FormData) {
  await requireAdminSession(); await assertProject(projectId); const values: Record<string, unknown> = {};
  for (const field of RACE_BIOLOGY_FIELDS) { const raw = formText(formData, field.key); if (!raw) continue; if(field.kind==="number"){const number=Number(raw);if(!Number.isFinite(number)||number<0)throw new Error(`${field.label}: Bitte eine gültige nicht-negative Zahl eingeben.`);values[field.key]=number;}else values[field.key]=raw; }
  await updateRaceBiology(projectId, raceId, values); refreshRace(projectId,raceId);
}
export async function upsertRaceTraitAction(projectId: number, raceId: number, formData: FormData) { await requireAdminSession(); await assertProject(projectId); await upsertRaceTrait(projectId,raceId,{label:formText(formData,"label"),value:formText(formData,"value"),unit:formOptionalText(formData,"unit"),notes:formOptionalText(formData,"notes"),traitKey:formOptionalText(formData,"traitKey")}); refreshRace(projectId,raceId); }
export async function deleteRaceTraitAction(projectId: number, raceId: number, traitId: number) { await requireAdminSession(); await assertProject(projectId); await deleteRaceTrait(projectId,raceId,traitId); refreshRace(projectId,raceId); }

export async function addRaceGeographyAction(projectId: number, raceId: number, formData: FormData) { await requireAdminSession(); await assertProject(projectId); const locationId=formOptionalId(formData,"locationId"); const role=formText(formData,"role") as RaceLocationRole; if(!locationId)throw new Error("Ort / Gebiet ist ein Pflichtfeld.");if(!RACE_LOCATION_ROLE_OPTIONS.some((option)=>option.value===role))throw new Error("Bitte eine gültige geografische Rolle auswählen.");await assertLocation(projectId,locationId); await addRaceGeography(projectId,raceId,locationId,role,formOptionalText(formData,"notes")); refreshRace(projectId,raceId); }
export async function deleteRaceGeographyAction(projectId: number, raceId: number, linkId: number) { await requireAdminSession(); await assertProject(projectId); await deleteRaceGeography(projectId,raceId,linkId); refreshRace(projectId,raceId); }

export async function addRaceRelationAction(projectId: number, raceId: number, formData: FormData) { await requireAdminSession(); await assertProject(projectId); const relatedRaceId=formOptionalId(formData,"relatedRaceId"); const relationType=formText(formData,"relationType") as RaceRelationType; if(!relatedRaceId)throw new Error("Verwandte Spezies ist ein Pflichtfeld.");if(!RACE_RELATION_OPTIONS.some((option)=>option.value===relationType))throw new Error("Bitte einen gültigen Beziehungstyp auswählen."); await addRaceRelation(projectId,raceId,relatedRaceId,relationType,formOptionalText(formData,"notes")); refreshRace(projectId,raceId); }
export async function deleteRaceRelationAction(projectId: number, raceId: number, relationId: number) { await requireAdminSession(); await assertProject(projectId); await deleteRaceRelation(projectId,raceId,relationId); refreshRace(projectId,raceId); }

export async function linkRaceCultureAction(projectId: number, raceId: number, formData: FormData) { await requireAdminSession(); await assertProject(projectId); const cultureId=formOptionalId(formData,"cultureId"); if(!cultureId)throw new Error("Kultur ist ein Pflichtfeld."); await assertCulture(projectId,cultureId); await linkRaceCulture(projectId,raceId,cultureId,formCheckbox(formData,"isPrimary"),formOptionalText(formData,"notes")); refreshRace(projectId,raceId); revalidatePath(`/admin/projects/${projectId}/cultures/${cultureId}`); }
export async function unlinkRaceCultureAction(projectId: number, raceId: number, cultureId: number) { await requireAdminSession(); await assertProject(projectId); await assertCulture(projectId,cultureId); await unlinkRaceCulture(projectId,raceId,cultureId); refreshRace(projectId,raceId); revalidatePath(`/admin/projects/${projectId}/cultures/${cultureId}`); }
export async function archiveRaceAction(projectId: number, raceId: number) { await requireAdminSession(); await assertProject(projectId); await archiveRace(projectId, raceId); redirect(`/admin/projects/${projectId}/races`); }
