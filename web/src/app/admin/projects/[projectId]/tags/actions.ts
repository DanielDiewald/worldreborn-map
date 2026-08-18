"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/session";
import { createTag, deleteTag, tagEntity, untagEntity } from "@/lib/tags";

function parseEntity(formData:FormData){const ref=String(formData.get("entityRef")??"").trim();if(ref){const [entityType,id]=ref.split(":",2);const entityId=Number.parseInt(id??"",10);if(!entityType||!Number.isSafeInteger(entityId)||entityId<=0)throw new Error("Ungültige Entity-Auswahl.");return{entityType,entityId};}const entityType=String(formData.get("entityType")??"").trim();const entityId=Number(formData.get("entityId"));if(!entityType||!Number.isSafeInteger(entityId)||entityId<=0)throw new Error("Ungültige Entity-Auswahl.");return{entityType,entityId};}
export async function createTagAction(projectId:number,formData:FormData){await requireAdminSession();await createTag(projectId,formData.get("name"));revalidatePath(`/admin/projects/${projectId}/tags`);}
export async function deleteTagAction(projectId:number,tagId:number){await requireAdminSession();await deleteTag(projectId,tagId);revalidatePath(`/admin/projects/${projectId}/tags`);}
export async function tagEntityAction(projectId:number,formData:FormData){await requireAdminSession();const entity=parseEntity(formData);await tagEntity({projectId,tagId:Number(formData.get("tagId")),...entity});revalidatePath(`/admin/projects/${projectId}/tags`);}
export async function untagEntityAction(projectId:number,tagId:number,entityType:string,entityId:number){await requireAdminSession();await untagEntity({projectId,tagId,entityType,entityId});revalidatePath(`/admin/projects/${projectId}/tags`);}
