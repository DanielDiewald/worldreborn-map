"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/session";
import { archiveCharacter, assignCharacterToPlayer, createCharacter, updateCharacter } from "@/lib/entities/characters";

function values(formData:FormData){return {name:formData.get("name"),gender:formData.get("gender")||"unknown",image:formData.get("image")||undefined,publicDescription:formData.get("publicDescription")||undefined,adminNotes:formData.get("adminNotes")||undefined,locationId:formData.get("locationId"),race:formData.get("race")||"unknown",alive:formData.get("alive")==="on",birthday:formData.get("birthday")||"2000-01-01",follower:formData.get("follower")==="on",className:formData.get("className")||"unknown",age:formData.get("age")||0,visibilityMode:formData.get("visibilityMode")||"admin_only"};}
export async function createCharacterAction(projectId:number,formData:FormData){await requireAdminSession();const id=await createCharacter(projectId,values(formData));redirect(`/admin/projects/${projectId}/characters/${id}`);}
export async function updateCharacterAction(projectId:number,charId:number,formData:FormData){await requireAdminSession();await updateCharacter(projectId,charId,values(formData));revalidatePath(`/admin/projects/${projectId}/characters/${charId}`);}
export async function assignCharacterAction(projectId:number,charId:number,formData:FormData){await requireAdminSession();const raw=formData.get("playerId");await assignCharacterToPlayer(projectId,charId,raw?Number(raw):null);revalidatePath(`/admin/projects/${projectId}/characters/${charId}`);}
export async function archiveCharacterAction(projectId:number,charId:number){await requireAdminSession();await archiveCharacter(projectId,charId);redirect(`/admin/projects/${projectId}/characters`);}
