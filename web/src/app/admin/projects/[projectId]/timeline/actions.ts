"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/session";
import { archiveTimelineEvent, createTimelineEvent, getTimelineEvent, linkTimelineEntity, unlinkTimelineEntity, updateTimelineEvent, type TimelineInput } from "@/lib/entities/timeline";
import { parseFantasyDateFields } from "@/lib/fantasy-calendar";
import { resolveEntityImageSource, setEntityImageReference } from "@/lib/media";

function numberOrNull(value:FormDataEntryValue|null){return value&&String(value).trim()!==""?Number(value):null;}
function text(value:FormDataEntryValue|null){return typeof value==="string"?value:"";}
function optionalText(value:FormDataEntryValue|null){const result=text(value).trim();return result||undefined;}
function dateValues(formData:FormData){return Object.fromEntries(["eventPrecision","eventEra","eventYear","eventMonth","eventDay"].map((key)=>[key,formData.get(key)]));}
function values(formData:FormData,image:string):TimelineInput{return{name:text(formData.get("name")),notes:optionalText(formData.get("notes")),image,locationId:numberOrNull(formData.get("locationId")),fantasyDate:parseFantasyDateFields(dateValues(formData),"event"),category:optionalText(formData.get("category")),importance:Number(formData.get("importance")??0),visibilityMode:(text(formData.get("visibilityMode"))||"admin_only") as "admin_only"|"all_players"|"selected_players"};}
function parseRef(value:FormDataEntryValue|null){const raw=text(value);const [entityType,id]=raw.split(":",2);const entityId=Number.parseInt(id??"",10);if(!entityType||!Number.isSafeInteger(entityId)||entityId<=0)throw new Error("Ungültige Timeline-Verknüpfung.");return{entityType,entityId};}
function refresh(projectId:number,eventId:number){revalidatePath(`/admin/projects/${projectId}/timeline/${eventId}`);revalidatePath(`/admin/projects/${projectId}/timeline`);}
export async function createTimelineEventAction(projectId:number,formData:FormData){await requireAdminSession();const source=await resolveEntityImageSource(projectId,formData,{title:String(formData.get("name")??"Timeline Event")});const id=await createTimelineEvent(projectId,values(formData,source.image));if(source.uploaded)await setEntityImageReference(projectId,"event",id,source);redirect(`/admin/projects/${projectId}/timeline/${id}`);}
export async function updateTimelineEventAction(projectId:number,eventId:number,formData:FormData){await requireAdminSession();const current=await getTimelineEvent(projectId,eventId);if(!current)throw new Error("Event not found in this project.");const source=await resolveEntityImageSource(projectId,formData,{current:String(current.image??""),entityType:"event",entityId:eventId,title:String(current.name)});await updateTimelineEvent(projectId,eventId,values(formData,source.image));if(source.uploaded||source.removed||source.image!==current.image)await setEntityImageReference(projectId,"event",eventId,source);refresh(projectId,eventId);}
export async function linkTimelineEntityAction(projectId:number,eventId:number,formData:FormData){await requireAdminSession();const ref=parseRef(formData.get("entityRef"));await linkTimelineEntity({projectId,eventId,entityType:ref.entityType,entityId:ref.entityId,role:optionalText(formData.get("role"))});refresh(projectId,eventId);}
export async function unlinkTimelineEntityAction(projectId:number,eventId:number,entityType:string,entityId:number){await requireAdminSession();await unlinkTimelineEntity({projectId,eventId,entityType,entityId});refresh(projectId,eventId);}
export async function archiveTimelineEventAction(projectId:number,eventId:number){await requireAdminSession();await archiveTimelineEvent(projectId,eventId);redirect(`/admin/projects/${projectId}/timeline`);}
