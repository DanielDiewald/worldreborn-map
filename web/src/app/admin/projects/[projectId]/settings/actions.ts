"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/session";
import { createProjectMap, deleteProjectMap, resetProjectMap, setPrimaryMap, updateProjectMap } from "@/lib/map-management";
import { updateProject } from "@/lib/projects";

function revalidateMaps(projectId: number) {
  revalidatePath(`/admin/projects/${projectId}/settings`);
  revalidatePath(`/admin/projects/${projectId}/map`);
  revalidatePath(`/admin/projects/${projectId}/map/maps`);
  revalidatePath(`/admin/projects/${projectId}/map/studio`);
  revalidatePath(`/admin/projects/${projectId}/map/marker-editor`);
  revalidatePath(`/admin/projects/${projectId}/locations`);
  revalidatePath(`/player/map`);
}

export async function updateProjectSettingsAction(projectId: number, formData: FormData) {
  await requireAdminSession();
  await updateProject(projectId, {
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    image: formData.get("image") || undefined,
    logo: formData.get("logo") || undefined,
    inWorldDate: formData.get("inWorldDate") || undefined,
    status: formData.get("status") || "active",
  });
  revalidatePath(`/admin/projects/${projectId}/settings`);
}

export async function createTileMapAction(projectId: number, formData: FormData) {
  await requireAdminSession();
  await createProjectMap(projectId, {
    mapType: "tile",
    mapKind: formData.get("mapKind") || "other",
    name: formData.get("name"),
    tileUrl: formData.get("tileUrl"),
    minZoom: formData.get("minZoom") || 0,
    maxZoom: formData.get("maxZoom") || 6,
    centerLat: formData.get("centerLat") || null,
    centerLng: formData.get("centerLng") || null,
    noWrap: formData.get("noWrap") === "on",
    isPrimary: formData.get("isPrimary") === "on",
  });
  revalidateMaps(projectId);
}

export async function createImageMapAction(projectId: number, formData: FormData) {
  await requireAdminSession();
  await createProjectMap(projectId, {
    mapType: "image",
    mapKind: formData.get("mapKind") || "other",
    name: formData.get("name"),
    imagePath: formData.get("imagePath"),
    width: formData.get("width"),
    height: formData.get("height"),
    minZoom: formData.get("minZoom") || -2,
    maxZoom: formData.get("maxZoom") || 4,
    isPrimary: formData.get("isPrimary") === "on",
  });
  revalidateMaps(projectId);
}

export async function updateProjectMapAction(projectId: number, mapId: number, formData: FormData) {
  await requireAdminSession();
  const mapType = String(formData.get("mapType") || ""), mapKind = formData.get("mapKind") || "other";
  if (mapType === "tile") {
    await updateProjectMap(projectId, mapId, {
      mapType: "tile",
      mapKind,
      name: formData.get("name"),
      tileUrl: formData.get("tileUrl"),
      minZoom: formData.get("minZoom"),
      maxZoom: formData.get("maxZoom"),
      centerLat: formData.get("centerLat") || null,
      centerLng: formData.get("centerLng") || null,
      noWrap: formData.get("noWrap") === "on",
    });
  } else if (mapType === "image") {
    await updateProjectMap(projectId, mapId, {
      mapType: "image",
      mapKind,
      name: formData.get("name"),
      imagePath: formData.get("imagePath"),
      width: formData.get("width"),
      height: formData.get("height"),
      minZoom: formData.get("minZoom"),
      maxZoom: formData.get("maxZoom"),
    });
  } else {
    throw new Error("Unknown map type.");
  }
  revalidateMaps(projectId);
}

export async function setPrimaryMapAction(projectId: number, formData: FormData) {
  await requireAdminSession();
  await setPrimaryMap(projectId, Number(formData.get("mapId")));
  revalidateMaps(projectId);
}

export async function resetProjectMapAction(projectId: number, mapId: number) {
  await requireAdminSession();
  await resetProjectMap(projectId, mapId);
  revalidateMaps(projectId);
}

export async function deleteProjectMapAction(projectId: number, mapId: number) {
  await requireAdminSession();
  await deleteProjectMap(projectId, mapId);
  revalidateMaps(projectId);
}
