"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/session";
import { archiveTimelineEvent, createTimelineEvent, updateTimelineEvent } from "@/lib/entities/timeline";

function numberOrNull(value:FormDataEntryValue|null){return value&&String(value).trim()!==""?Number(value):null;}
function values(formData:FormData){return{name:formData.get("name"),notes:formData.get("notes")||undefined,image:formData.get("image")||undefined,locationId:numberOrNull(formData.get("locationId")),displayDate:formData.get("displayDate")||undefined,sortValue:numberOrNull(formData.get("sortValue")),era:formData.get("era")||undefined,fantasyYear:numberOrNull(formData.get("fantasyYear")),fantasyMonth:numberOrNull(formData.get("fantasyMonth")),fantasyDay:numberOrNull(formData.get("fantasyDay")),category:formData.get("category")||undefined,importance:formData.get("importance")||0,visibilityMode:formData.get("visibilityMode")||"admin_only"};}
export async function createTimelineEventAction(projectId:number,formData:FormData){await requireAdminSession();const id=await createTimelineEvent(projectId,values(formData));redirect(`/admin/projects/${projectId}/timeline/${id}`);}
export async function updateTimelineEventAction(projectId:number,eventId:number,formData:FormData){await requireAdminSession();await updateTimelineEvent(projectId,eventId,values(formData));revalidatePath(`/admin/projects/${projectId}/timeline/${eventId}`);}
export async function archiveTimelineEventAction(projectId:number,eventId:number){await requireAdminSession();await archiveTimelineEvent(projectId,eventId);redirect(`/admin/projects/${projectId}/timeline`);}
