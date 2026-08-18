"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/session";
import { deleteFamilyTree, updateFamilyTreeDefinition } from "@/lib/family-tree-admin";
import { addFamilyTreeMember, createFamilyTree, refreshFamilyTreeMembers, removeFamilyTreeMember, updateFamilyTreeMainLine } from "@/lib/entities/family-trees";

function text(formData:FormData,key:string){const value=formData.get(key);return typeof value==="string"&&value.trim()?value.trim():undefined;}
function positive(value:FormDataEntryValue|null){if(typeof value!=="string"||!value.trim())return undefined;const parsed=Number.parseInt(value,10);return Number.isSafeInteger(parsed)&&parsed>0?parsed:undefined;}
function refresh(projectId:number,treeId:number){revalidatePath(`/admin/projects/${projectId}/family-trees/${treeId}`);revalidatePath(`/admin/projects/${projectId}/family-trees`);}
export async function createFamilyTreeAction(projectId:number,formData:FormData){await requireAdminSession();const treeId=await createFamilyTree(projectId,{name:text(formData,"name"),subtitle:text(formData,"subtitle"),description:text(formData,"description"),rootPersonId:positive(formData.get("rootPersonId")),visibilityMode:text(formData,"visibilityMode")??"admin_only"});refresh(projectId,treeId);redirect(`/admin/projects/${projectId}/family-trees/${treeId}`);}
export async function updateFamilyTreeAction(projectId:number,treeId:number,formData:FormData){await requireAdminSession();await updateFamilyTreeDefinition(projectId,treeId,{name:text(formData,"name"),subtitle:text(formData,"subtitle"),description:text(formData,"description"),rootPersonId:positive(formData.get("rootPersonId"))??null,visibilityMode:text(formData,"visibilityMode")??"admin_only"});refresh(projectId,treeId);}
export async function deleteFamilyTreeAction(projectId:number,treeId:number){await requireAdminSession();await deleteFamilyTree(projectId,treeId);revalidatePath(`/admin/projects/${projectId}/family-trees`);redirect(`/admin/projects/${projectId}/family-trees`);}
export async function addFamilyTreeMemberAction(projectId:number,treeId:number,formData:FormData){await requireAdminSession();const personId=positive(formData.get("personId"));if(!personId)throw new Error("Person is required.");await addFamilyTreeMember(projectId,treeId,personId,text(formData,"roleLabel"),text(formData,"branchLabel"));refresh(projectId,treeId);}
export async function removeFamilyTreeMemberAction(projectId:number,treeId:number,personId:number){await requireAdminSession();await removeFamilyTreeMember(projectId,treeId,personId);refresh(projectId,treeId);}
export async function refreshFamilyTreeAction(projectId:number,treeId:number){await requireAdminSession();await refreshFamilyTreeMembers(projectId,treeId);refresh(projectId,treeId);}
export async function updateFamilyTreeMainLineAction(projectId:number,treeId:number,formData:FormData){await requireAdminSession();const raw=formData.get("personIds");const personIds=typeof raw==="string"&&raw.trim()?raw.split(",").map((value)=>Number.parseInt(value,10)).filter((value)=>Number.isSafeInteger(value)&&value>0):[];await updateFamilyTreeMainLine(projectId,treeId,personIds);refresh(projectId,treeId);}
