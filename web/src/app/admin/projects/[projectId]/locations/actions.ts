"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/session";
import { archiveLocation,createLocation,getLocation,updateLocation } from "@/lib/entities/locations";
import { formOptionalId, formOptionalNumber, formOptionalText, formText } from "@/lib/form-data";
import { setLocationImageReference } from "@/lib/location-media";
import { resolveEntityImageSource } from "@/lib/media";
import { getProject } from "@/lib/projects";

function values(formData:FormData,coatOfArm:string){return{name:formData.get("name"),locationType:formOptionalText(formData,"locationType")??undefined,locationKind:formText(formData,"locationKind")||"other",slug:formOptionalText(formData,"slug"),description:formOptionalText(formData,"description")??undefined,coatOfArm:coatOfArm==="noimage"?undefined:coatOfArm,parentLocId:formOptionalId(formData,"parentLocId"),ownerNpcId:formOptionalId(formData,"ownerNpcId"),capitalLocId:formOptionalId(formData,"capitalLocId"),population:formOptionalNumber(formData,"population"),mapId:formOptionalId(formData,"mapId"),mapFeatureId:formOptionalId(formData,"mapFeatureId"),visibilityMode:formText(formData,"visibilityMode")||"admin_only"};}
async function assertProject(projectId:number){if(!Number.isSafeInteger(projectId)||projectId<=0||!(await getProject(projectId)))throw new Error("Die ausgewählte Welt wurde nicht gefunden oder ist archiviert.");}
export async function createLocationAction(projectId:number,formData:FormData){await requireAdminSession();await assertProject(projectId);const source=await resolveEntityImageSource(projectId,formData,{pathName:"coatOfArm",fileName:"coatOfArmFile",title:String(formData.get("name")??"Ort")});const id=await createLocation(projectId,values(formData,source.image));if(source.uploaded)await setLocationImageReference(projectId,id,source);redirect(`/admin/projects/${projectId}/locations/${id}`);}
export async function updateLocationAction(projectId:number,locationId:number,formData:FormData){await requireAdminSession();await assertProject(projectId);const current=await getLocation(projectId,locationId);if(!current)throw new Error("Der Ort wurde nicht gefunden oder gehört nicht zu dieser Welt.");const currentImage=String(current.coat_of_arm??"");const source=await resolveEntityImageSource(projectId,formData,{current:currentImage,pathName:"coatOfArm",fileName:"coatOfArmFile",entityType:"location",entityId:locationId,title:String(current.name)});await updateLocation(projectId,locationId,values(formData,source.image));if(source.uploaded||source.removed||source.image!==currentImage)await setLocationImageReference(projectId,locationId,source);revalidatePath(`/admin/projects/${projectId}/locations/${locationId}`);revalidatePath(`/admin/projects/${projectId}/locations`);}
export async function archiveLocationAction(projectId:number,locationId:number){await requireAdminSession();await assertProject(projectId);await archiveLocation(projectId,locationId);redirect(`/admin/projects/${projectId}/locations`);}
