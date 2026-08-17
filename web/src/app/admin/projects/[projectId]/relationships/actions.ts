"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/session";
import { createRelationship, deleteRelationship } from "@/lib/entities/relationships";

export async function createRelationshipAction(projectId:number,formData:FormData){await requireAdminSession();await createRelationship(projectId,{entityAType:formData.get("entityAType"),entityAId:formData.get("entityAId"),entityBType:formData.get("entityBType"),entityBId:formData.get("entityBId"),relationshipTypeId:formData.get("relationshipTypeId"),startDisplay:formData.get("startDisplay")||undefined,endDisplay:formData.get("endDisplay")||undefined,status:formData.get("status")||"active",publicDescription:formData.get("publicDescription")||undefined,adminNotes:formData.get("adminNotes")||undefined,visibilityMode:formData.get("visibilityMode")||"admin_only"});revalidatePath(`/admin/projects/${projectId}/relationships`);}
export async function deleteRelationshipAction(projectId:number,relationshipId:number){await requireAdminSession();await deleteRelationship(projectId,relationshipId);revalidatePath(`/admin/projects/${projectId}/relationships`);}
