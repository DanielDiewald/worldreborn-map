"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/session";
import { savePersonFantasyDate } from "@/lib/calendar";
import { archiveGod, createGod, getGod, updateGod } from "@/lib/entities/gods";
import { entityImageCropFromForm } from "@/lib/entity-image-crop";
import { saveEntityImageProfile } from "@/lib/entity-image-profiles";
import { parseFantasyDateFields } from "@/lib/fantasy-calendar";
import { resolveEntityImageSource, setEntityImageReference } from "@/lib/media";

function input(formData: FormData,image:string) {
  return {
    name: formData.get("name"), gender: formData.get("gender"), image,
    publicDescription: formData.get("publicDescription") || undefined, adminNotes: formData.get("adminNotes") || undefined,
    species: formData.get("species") || undefined, profession: formData.get("profession") || undefined, personTitle: formData.get("personTitle") || undefined,
    godTitle: formData.get("godTitle") || undefined, faction: formData.get("faction") || undefined, domain: formData.get("domain") || undefined,
    visibilityMode: formData.get("visibilityMode") || "admin_only",
  };
}
function dateValues(formData:FormData){return Object.fromEntries(["birthPrecision","birthEra","birthYear","birthMonth","birthDay"].map((key)=>[key,formData.get(key)]));}

export async function createGodAction(projectId:number,formData:FormData){
  await requireAdminSession();const source=await resolveEntityImageSource(projectId,formData,{title:String(formData.get("name")??"Gottheit")});const personId=await createGod(projectId,input(formData,source.image));if(source.uploaded)await setEntityImageReference(projectId,"person",personId,source);await saveEntityImageProfile(projectId,"person",personId,source.image,entityImageCropFromForm(formData));if(formData.has("birthPrecision"))await savePersonFantasyDate(projectId,personId,"birth",parseFantasyDateFields(dateValues(formData),"birth"));redirect(`/admin/projects/${projectId}/gods/${personId}`);
}
export async function updateGodAction(projectId:number,personId:number,formData:FormData){
  await requireAdminSession();const current=await getGod(projectId,personId);if(!current)throw new Error("God not found in this project.");const source=await resolveEntityImageSource(projectId,formData,{current:current.image,entityType:"person",entityId:personId,title:current.name});await updateGod(projectId,personId,input(formData,source.image));if(source.uploaded||source.removed||source.image!==current.image)await setEntityImageReference(projectId,"person",personId,source);await saveEntityImageProfile(projectId,"person",personId,source.image,entityImageCropFromForm(formData));if(formData.has("birthPrecision"))await savePersonFantasyDate(projectId,personId,"birth",parseFantasyDateFields(dateValues(formData),"birth"));revalidatePath(`/admin/projects/${projectId}/gods/${personId}`);revalidatePath(`/admin/projects/${projectId}/gods`);revalidatePath(`/admin/projects/${projectId}/family-trees`);
}
export async function archiveGodAction(projectId:number,personId:number){await requireAdminSession();await archiveGod(projectId,personId);redirect(`/admin/projects/${projectId}/gods`);}
