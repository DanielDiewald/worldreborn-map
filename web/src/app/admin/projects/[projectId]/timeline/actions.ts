"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/session";
import { archiveTimelineEvent, createTimelineEvent, getTimelineEvent, linkTimelineEntity, unlinkTimelineEntity, updateTimelineEvent, type TimelineInput } from "@/lib/entities/timeline";
import { parseFantasyDateFields } from "@/lib/fantasy-calendar";
import { formEnum, formOptionalId, formOptionalText, formText } from "@/lib/form-data";
import { resolveEntityImageSource, setEntityImageReference } from "@/lib/media";
import { getProject } from "@/lib/projects";

const VISIBILITY=["admin_only","all_players","selected_players"] as const;
function dateValues(formData:FormData){return Object.fromEntries(["eventPrecision","eventEra","eventYear","eventMonth","eventDay"].map((key)=>[key,formData.get(key)]));}
function values(formData:FormData,image:string):TimelineInput{const importanceRaw=formText(formData,"importance")||"0";const importance=Number(importanceRaw);if(!Number.isSafeInteger(importance)||importance<0||importance>10)throw new Error("Wichtigkeit muss eine ganze Zahl zwischen 0 und 10 sein.");return{name:formText(formData,"name"),notes:formOptionalText(formData,"notes")??undefined,image,locationId:formOptionalId(formData,"locationId"),fantasyDate:parseFantasyDateFields(dateValues(formData),"event"),category:formOptionalText(formData,"category")??undefined,importance,visibilityMode:formEnum(formData,"visibilityMode",VISIBILITY,"admin_only")};}
function parseRef(value:FormDataEntryValue|null){if(typeof value!=="string"||!value.trim())throw new Error("Entität ist ein Pflichtfeld.");const [entityType,id]=value.split(":",2);const entityId=Number.parseInt(id??"",10);if(!entityType||!Number.isSafeInteger(entityId)||entityId<=0)throw new Error("Bitte eine gültige Entität für die Timeline auswählen.");return{entityType,entityId};}
async function assertProject(projectId:number){if(!Number.isSafeInteger(projectId)||projectId<=0||!(await getProject(projectId)))throw new Error("Die ausgewählte Welt wurde nicht gefunden oder ist archiviert.");}
function refresh(projectId:number,eventId:number){revalidatePath(`/admin/projects/${projectId}/timeline/${eventId}`);revalidatePath(`/admin/projects/${projectId}/timeline`);}
export async function createTimelineEventAction(projectId:number,formData:FormData){await requireAdminSession();await assertProject(projectId);const source=await resolveEntityImageSource(projectId,formData,{title:String(formData.get("name")??"Timeline-Ereignis")});const id=await createTimelineEvent(projectId,values(formData,source.image));if(source.uploaded)await setEntityImageReference(projectId,"event",id,source);redirect(`/admin/projects/${projectId}/timeline/${id}`);}
export async function updateTimelineEventAction(projectId:number,eventId:number,formData:FormData){await requireAdminSession();await assertProject(projectId);const current=await getTimelineEvent(projectId,eventId);if(!current)throw new Error("Das Ereignis wurde nicht gefunden oder gehört nicht zu dieser Welt.");const source=await resolveEntityImageSource(projectId,formData,{current:String(current.image??""),entityType:"event",entityId:eventId,title:String(current.name)});await updateTimelineEvent(projectId,eventId,values(formData,source.image));if(source.uploaded||source.removed||source.image!==current.image)await setEntityImageReference(projectId,"event",eventId,source);refresh(projectId,eventId);}
export async function linkTimelineEntityAction(projectId:number,eventId:number,formData:FormData){await requireAdminSession();await assertProject(projectId);const ref=parseRef(formData.get("entityRef"));await linkTimelineEntity({projectId,eventId,entityType:ref.entityType,entityId:ref.entityId,role:formOptionalText(formData,"role")??undefined});refresh(projectId,eventId);}
export async function unlinkTimelineEntityAction(projectId:number,eventId:number,entityType:string,entityId:number){await requireAdminSession();await assertProject(projectId);await unlinkTimelineEntity({projectId,eventId,entityType,entityId});refresh(projectId,eventId);}
export async function archiveTimelineEventAction(projectId:number,eventId:number){await requireAdminSession();await assertProject(projectId);await archiveTimelineEvent(projectId,eventId);redirect(`/admin/projects/${projectId}/timeline`);}
