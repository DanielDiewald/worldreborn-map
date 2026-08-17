"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/session";
import { createTag, deleteTag, tagEntity, untagEntity } from "@/lib/tags";

export async function createTagAction(projectId:number,formData:FormData){await requireAdminSession();await createTag(projectId,formData.get("name"));revalidatePath(`/admin/projects/${projectId}/tags`);}
export async function deleteTagAction(projectId:number,tagId:number){await requireAdminSession();await deleteTag(projectId,tagId);revalidatePath(`/admin/projects/${projectId}/tags`);}
export async function tagEntityAction(projectId:number,formData:FormData){await requireAdminSession();await tagEntity({projectId,tagId:Number(formData.get("tagId")),entityType:String(formData.get("entityType")||""),entityId:Number(formData.get("entityId"))});revalidatePath(`/admin/projects/${projectId}/tags`);}
export async function untagEntityAction(projectId:number,tagId:number,entityType:string,entityId:number){await requireAdminSession();await untagEntity({projectId,tagId,entityType,entityId});revalidatePath(`/admin/projects/${projectId}/tags`);}
