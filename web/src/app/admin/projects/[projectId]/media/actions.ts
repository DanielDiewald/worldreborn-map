"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/session";
import { deleteMedia, saveMediaUpload } from "@/lib/media";

export async function uploadMediaAction(projectId:number,formData:FormData){await requireAdminSession();const file=formData.get("file");if(!(file instanceof File)||file.size===0)throw new Error("Bitte wähle ein Bild aus.");await saveMediaUpload(projectId,file,{entityType:formData.get("entityType")||null,entityId:formData.get("entityId")||null,title:formData.get("title")||undefined,altText:formData.get("altText")||undefined});revalidatePath(`/admin/projects/${projectId}/media`);}
export async function deleteMediaAction(projectId:number,mediaId:number){await requireAdminSession();await deleteMedia(projectId,mediaId);revalidatePath(`/admin/projects/${projectId}/media`);}
