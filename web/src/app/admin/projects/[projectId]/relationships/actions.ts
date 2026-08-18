"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/session";
import { createRelationship, deleteRelationship } from "@/lib/entities/relationships";

function parseRef(value:FormDataEntryValue|null){if(typeof value!=="string")throw new Error("Invalid entity reference");const [type,id]=value.split(":",2);const entityId=Number.parseInt(id??"",10);if(!type||!Number.isSafeInteger(entityId)||entityId<=0)throw new Error("Invalid entity reference");return{type,entityId};}
export async function createRelationshipAction(projectId:number,formData:FormData){await requireAdminSession();const a=parseRef(formData.get("entityARef"));const b=parseRef(formData.get("entityBRef"));await createRelationship(projectId,{entityAType:a.type,entityAId:a.entityId,entityBType:b.type,entityBId:b.entityId,relationshipTypeId:formData.get("relationshipTypeId"),startDisplay:formData.get("startDisplay")||undefined,endDisplay:formData.get("endDisplay")||undefined,status:formData.get("status")||"active",publicDescription:formData.get("publicDescription")||undefined,adminNotes:formData.get("adminNotes")||undefined,visibilityMode:formData.get("visibilityMode")||"admin_only"});revalidatePath(`/admin/projects/${projectId}/relationships`);revalidatePath(`/admin/projects/${projectId}/family-tree`);revalidatePath(`/admin/projects/${projectId}/relationship-graph`);}
export async function deleteRelationshipAction(projectId:number,relationshipId:number){await requireAdminSession();await deleteRelationship(projectId,relationshipId);revalidatePath(`/admin/projects/${projectId}/relationships`);revalidatePath(`/admin/projects/${projectId}/family-tree`);revalidatePath(`/admin/projects/${projectId}/relationship-graph`);}
