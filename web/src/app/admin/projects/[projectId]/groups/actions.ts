"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/session";
import { archiveGroup, createGroup, updateGroup } from "@/lib/entities/groups";

function values(formData: FormData) {
  return {
    name: formData.get("name"), image: formData.get("image") || undefined,
    notes: formData.get("notes") || undefined, motto: formData.get("motto") || undefined,
    locationId: formData.get("locationId"), groupType: formData.get("groupType") || undefined,
    visibilityMode: formData.get("visibilityMode") || "admin_only",
  };
}
export async function createGroupAction(projectId:number,formData:FormData){await requireAdminSession();const id=await createGroup(projectId,values(formData));redirect(`/admin/projects/${projectId}/groups/${id}`);}
export async function updateGroupAction(projectId:number,groupId:number,formData:FormData){await requireAdminSession();await updateGroup(projectId,groupId,values(formData));revalidatePath(`/admin/projects/${projectId}/groups/${groupId}`);}
export async function archiveGroupAction(projectId:number,groupId:number){await requireAdminSession();await archiveGroup(projectId,groupId);redirect(`/admin/projects/${projectId}/groups`);}
