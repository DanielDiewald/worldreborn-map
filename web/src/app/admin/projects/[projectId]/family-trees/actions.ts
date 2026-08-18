"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/session";
import { addFamilyTreeMember, createFamilyTree, refreshFamilyTreeMembers, removeFamilyTreeMember } from "@/lib/entities/family-trees";

function text(formData:FormData,key:string){const value=formData.get(key);return typeof value==="string"&&value.trim()?value.trim():undefined;}
function positive(value:FormDataEntryValue|null){if(typeof value!=="string"||!value.trim())return undefined;const parsed=Number.parseInt(value,10);return Number.isSafeInteger(parsed)&&parsed>0?parsed:undefined;}

export async function createFamilyTreeAction(projectId:number,formData:FormData){await requireAdminSession();const treeId=await createFamilyTree(projectId,{name:text(formData,"name"),subtitle:text(formData,"subtitle"),description:text(formData,"description"),rootPersonId:positive(formData.get("rootPersonId")),visibilityMode:text(formData,"visibilityMode")??"admin_only"});revalidatePath(`/admin/projects/${projectId}/family-trees`);redirect(`/admin/projects/${projectId}/family-trees/${treeId}`);}

export async function addFamilyTreeMemberAction(projectId:number,treeId:number,formData:FormData){await requireAdminSession();const personId=positive(formData.get("personId"));if(!personId)throw new Error("Person is required.");await addFamilyTreeMember(projectId,treeId,personId,text(formData,"roleLabel"),text(formData,"branchLabel"));revalidatePath(`/admin/projects/${projectId}/family-trees/${treeId}`);}

export async function removeFamilyTreeMemberAction(projectId:number,treeId:number,personId:number){await requireAdminSession();await removeFamilyTreeMember(projectId,treeId,personId);revalidatePath(`/admin/projects/${projectId}/family-trees/${treeId}`);}

export async function refreshFamilyTreeAction(projectId:number,treeId:number){await requireAdminSession();await refreshFamilyTreeMembers(projectId,treeId);revalidatePath(`/admin/projects/${projectId}/family-trees/${treeId}`);}
