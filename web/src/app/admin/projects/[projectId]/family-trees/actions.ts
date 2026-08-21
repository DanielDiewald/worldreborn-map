"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/session";
import { deleteFamilyTree, updateFamilyTreeDefinition } from "@/lib/family-tree-admin";
import { addFamilyTreeMember, createFamilyTree, refreshFamilyTreeMembers, removeFamilyTreeMember, updateFamilyTreeMainLine } from "@/lib/entities/family-trees";
import { formEnum, formOptionalId, formOptionalText } from "@/lib/form-data";
import { getProject } from "@/lib/projects";

const VISIBILITY=["admin_only","all_players","selected_players"] as const;
async function assertProject(projectId:number){if(!Number.isSafeInteger(projectId)||projectId<=0||!(await getProject(projectId)))throw new Error("Die ausgewählte Welt wurde nicht gefunden oder ist archiviert.");}
function refresh(projectId:number,treeId:number){revalidatePath(`/admin/projects/${projectId}/family-trees/${treeId}`);revalidatePath(`/admin/projects/${projectId}/family-trees`);}
export async function createFamilyTreeAction(projectId:number,formData:FormData){await requireAdminSession();await assertProject(projectId);const treeId=await createFamilyTree(projectId,{name:formOptionalText(formData,"name")??undefined,subtitle:formOptionalText(formData,"subtitle")??undefined,description:formOptionalText(formData,"description")??undefined,rootPersonId:formOptionalId(formData,"rootPersonId")??undefined,visibilityMode:formEnum(formData,"visibilityMode",VISIBILITY,"admin_only")});refresh(projectId,treeId);redirect(`/admin/projects/${projectId}/family-trees/${treeId}`);}
export async function updateFamilyTreeAction(projectId:number,treeId:number,formData:FormData){await requireAdminSession();await assertProject(projectId);await updateFamilyTreeDefinition(projectId,treeId,{name:formOptionalText(formData,"name")??undefined,subtitle:formOptionalText(formData,"subtitle")??undefined,description:formOptionalText(formData,"description")??undefined,rootPersonId:formOptionalId(formData,"rootPersonId"),visibilityMode:formEnum(formData,"visibilityMode",VISIBILITY,"admin_only")});refresh(projectId,treeId);}
export async function deleteFamilyTreeAction(projectId:number,treeId:number){await requireAdminSession();await assertProject(projectId);await deleteFamilyTree(projectId,treeId);revalidatePath(`/admin/projects/${projectId}/family-trees`);redirect(`/admin/projects/${projectId}/family-trees`);}
export async function addFamilyTreeMemberAction(projectId:number,treeId:number,formData:FormData){await requireAdminSession();await assertProject(projectId);const personId=formOptionalId(formData,"personId");if(!personId)throw new Error("Person ist ein Pflichtfeld.");await addFamilyTreeMember(projectId,treeId,personId,formOptionalText(formData,"roleLabel")??undefined,formOptionalText(formData,"branchLabel")??undefined);refresh(projectId,treeId);}
export async function removeFamilyTreeMemberAction(projectId:number,treeId:number,personId:number){await requireAdminSession();await assertProject(projectId);await removeFamilyTreeMember(projectId,treeId,personId);refresh(projectId,treeId);}
export async function refreshFamilyTreeAction(projectId:number,treeId:number){await requireAdminSession();await assertProject(projectId);await refreshFamilyTreeMembers(projectId,treeId);refresh(projectId,treeId);}
export async function updateFamilyTreeMainLineAction(projectId:number,treeId:number,formData:FormData){await requireAdminSession();await assertProject(projectId);const raw=formData.get("personIds");const values=typeof raw==="string"&&raw.trim()?raw.split(",").map((value)=>value.trim()):[];const personIds=values.map((value)=>Number.parseInt(value,10));if(personIds.some((value)=>!Number.isSafeInteger(value)||value<=0))throw new Error("Die Hauptlinie enthält eine ungültige Personen-ID.");await updateFamilyTreeMainLine(projectId,treeId,personIds);refresh(projectId,treeId);}
