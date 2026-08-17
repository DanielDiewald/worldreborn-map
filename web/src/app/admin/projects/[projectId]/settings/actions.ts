"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/session";
import { createProjectMap, setPrimaryMap } from "@/lib/map-management";
import { updateProject } from "@/lib/projects";

export async function updateProjectSettingsAction(projectId:number,formData:FormData){await requireAdminSession();await updateProject(projectId,{name:formData.get("name"),description:formData.get("description")||undefined,image:formData.get("image")||undefined,logo:formData.get("logo")||undefined,inWorldDate:formData.get("inWorldDate")||undefined,status:formData.get("status")||"active"});revalidatePath(`/admin/projects/${projectId}/settings`);}
export async function createTileMapAction(projectId:number,formData:FormData){await requireAdminSession();await createProjectMap(projectId,{mapType:"tile",name:formData.get("name"),tileUrl:formData.get("tileUrl"),minZoom:formData.get("minZoom")||0,maxZoom:formData.get("maxZoom")||6,centerLat:formData.get("centerLat")||null,centerLng:formData.get("centerLng")||null,noWrap:formData.get("noWrap")==="on",isPrimary:formData.get("isPrimary")==="on"});revalidatePath(`/admin/projects/${projectId}/settings`);}
export async function createImageMapAction(projectId:number,formData:FormData){await requireAdminSession();await createProjectMap(projectId,{mapType:"image",name:formData.get("name"),imagePath:formData.get("imagePath"),width:formData.get("width"),height:formData.get("height"),minZoom:formData.get("minZoom")||-2,maxZoom:formData.get("maxZoom")||4,isPrimary:formData.get("isPrimary")==="on"});revalidatePath(`/admin/projects/${projectId}/settings`);}
export async function setPrimaryMapAction(projectId:number,formData:FormData){await requireAdminSession();await setPrimaryMap(projectId,Number(formData.get("mapId")));revalidatePath(`/admin/projects/${projectId}/settings`);}
