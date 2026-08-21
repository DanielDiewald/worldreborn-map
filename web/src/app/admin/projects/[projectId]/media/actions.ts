"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/session";
import { deleteMediaSafely, updateMediaMetadata } from "@/lib/media-admin";
import { saveMediaUpload } from "@/lib/media";
import { formOptionalId, formOptionalText } from "@/lib/form-data";

function refresh(projectId:number){revalidatePath(`/admin/projects/${projectId}/media`);}
export async function uploadMediaAction(projectId:number,formData:FormData){await requireAdminSession();const file=formData.get("file");if(!(file instanceof File)||file.size===0)throw new Error("Datei ist ein Pflichtfeld.");const entityType=formOptionalText(formData,"entityType");const entityId=formOptionalId(formData,"entityId");if(Boolean(entityType)!==Boolean(entityId))throw new Error("Entitätstyp und Entitäts-ID müssen entweder beide gesetzt oder beide leer sein.");await saveMediaUpload(projectId,file,{entityType,entityId,title:formOptionalText(formData,"title")??undefined,altText:formOptionalText(formData,"altText")??undefined});refresh(projectId);}
export async function updateMediaMetadataAction(projectId:number,mediaId:number,formData:FormData){await requireAdminSession();await updateMediaMetadata(projectId,mediaId,{title:formOptionalText(formData,"title")??undefined,altText:formOptionalText(formData,"altText")??undefined});refresh(projectId);}
export async function deleteMediaAction(projectId:number,mediaId:number){await requireAdminSession();await deleteMediaSafely(projectId,mediaId);refresh(projectId);}
