"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/session";
import { formCheckbox, formOptionalId, formOptionalText, formText } from "@/lib/form-data";
import { createProjectMap, deleteProjectMap, resetProjectMap, setPrimaryMap, updateProjectMap } from "@/lib/map-management";
import { getProject, updateProject } from "@/lib/projects";

function revalidateMaps(projectId: number) {
  revalidatePath(`/admin/projects/${projectId}/settings`);
  revalidatePath(`/admin/projects/${projectId}/map`);
  revalidatePath(`/admin/projects/${projectId}/map/maps`);
  revalidatePath(`/admin/projects/${projectId}/map/studio`);
  revalidatePath(`/admin/projects/${projectId}/map/marker-editor`);
  revalidatePath(`/admin/projects/${projectId}/locations`);
  revalidatePath(`/player/map`);
}
async function assertProject(projectId:number){if(!Number.isSafeInteger(projectId)||projectId<=0||!(await getProject(projectId)))throw new Error("Die ausgewählte Welt wurde nicht gefunden oder ist archiviert.");}
function mapKind(formData:FormData){return formText(formData,"mapKind")||"other";}

export async function updateProjectSettingsAction(projectId: number, formData: FormData) {
  await requireAdminSession();await assertProject(projectId);
  await updateProject(projectId, {
    name: formText(formData,"name"),
    description: formOptionalText(formData,"description")??undefined,
    image: formOptionalText(formData,"image")??undefined,
    logo: formOptionalText(formData,"logo")??undefined,
    inWorldDate: formOptionalText(formData,"inWorldDate")??undefined,
    status: formText(formData,"status")||"active",
  });
  revalidatePath(`/admin/projects/${projectId}/settings`);
}

export async function createTileMapAction(projectId: number, formData: FormData) {
  await requireAdminSession();await assertProject(projectId);
  await createProjectMap(projectId, {
    mapType: "tile", mapKind:mapKind(formData), name: formText(formData,"name"), tileUrl: formText(formData,"tileUrl"),
    minZoom: formText(formData,"minZoom")||0, maxZoom: formText(formData,"maxZoom")||6,
    centerLat: formOptionalText(formData,"centerLat"), centerLng: formOptionalText(formData,"centerLng"),
    noWrap: formCheckbox(formData,"noWrap"), isPrimary: formCheckbox(formData,"isPrimary"),
  });
  revalidateMaps(projectId);
}

export async function createImageMapAction(projectId: number, formData: FormData) {
  await requireAdminSession();await assertProject(projectId);
  await createProjectMap(projectId, {
    mapType: "image", mapKind:mapKind(formData), name: formText(formData,"name"), imagePath: formText(formData,"imagePath"),
    width: formText(formData,"width"), height: formText(formData,"height"), minZoom: formText(formData,"minZoom")||-2,
    maxZoom: formText(formData,"maxZoom")||4, isPrimary: formCheckbox(formData,"isPrimary"),
  });
  revalidateMaps(projectId);
}

export async function updateProjectMapAction(projectId: number, mapId: number, formData: FormData) {
  await requireAdminSession();await assertProject(projectId);if(!Number.isSafeInteger(mapId)||mapId<=0)throw new Error("Ungültige Karten-ID.");
  const mapType=formText(formData,"mapType"),kind=mapKind(formData);
  if (mapType === "tile") {
    await updateProjectMap(projectId,mapId,{mapType:"tile",mapKind:kind,name:formText(formData,"name"),tileUrl:formText(formData,"tileUrl"),minZoom:formText(formData,"minZoom"),maxZoom:formText(formData,"maxZoom"),centerLat:formOptionalText(formData,"centerLat"),centerLng:formOptionalText(formData,"centerLng"),noWrap:formCheckbox(formData,"noWrap")});
  } else if (mapType === "image") {
    await updateProjectMap(projectId,mapId,{mapType:"image",mapKind:kind,name:formText(formData,"name"),imagePath:formText(formData,"imagePath"),width:formText(formData,"width"),height:formText(formData,"height"),minZoom:formText(formData,"minZoom"),maxZoom:formText(formData,"maxZoom")});
  } else throw new Error("Unbekannter Kartentyp. Bitte die Seite neu laden.");
  revalidateMaps(projectId);
}

export async function setPrimaryMapAction(projectId: number, formData: FormData) { await requireAdminSession();await assertProject(projectId);const mapId=formOptionalId(formData,"mapId");if(!mapId)throw new Error("Karte ist ein Pflichtfeld.");await setPrimaryMap(projectId,mapId);revalidateMaps(projectId); }
export async function resetProjectMapAction(projectId: number, mapId: number) { await requireAdminSession();await assertProject(projectId);if(!Number.isSafeInteger(mapId)||mapId<=0)throw new Error("Ungültige Karten-ID.");await resetProjectMap(projectId,mapId);revalidateMaps(projectId); }
export async function deleteProjectMapAction(projectId: number, mapId: number) { await requireAdminSession();await assertProject(projectId);if(!Number.isSafeInteger(mapId)||mapId<=0)throw new Error("Ungültige Karten-ID.");await deleteProjectMap(projectId,mapId);revalidateMaps(projectId); }
