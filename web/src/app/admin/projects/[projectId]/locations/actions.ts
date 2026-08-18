"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/session";
import { archiveLocation, createLocation, getLocation, updateLocation } from "@/lib/entities/locations";
import { setLocationImageReference } from "@/lib/location-media";
import { resolveEntityImageSource } from "@/lib/media";

function optionalNumber(formData:FormData,name:string){const value=formData.get(name);return value?Number(value):null;}
function values(formData:FormData,coatOfArm:string){return{name:formData.get("name"),locationType:formData.get("locationType")||undefined,description:formData.get("description")||undefined,coatOfArm:coatOfArm==="noimage"?undefined:coatOfArm,parentLocId:optionalNumber(formData,"parentLocId"),ownerNpcId:optionalNumber(formData,"ownerNpcId"),population:optionalNumber(formData,"population"),visibilityMode:formData.get("visibilityMode")||"admin_only"};}
export async function createLocationAction(projectId:number,formData:FormData){await requireAdminSession();const source=await resolveEntityImageSource(projectId,formData,{pathName:"coatOfArm",fileName:"coatOfArmFile",title:String(formData.get("name")??"Location")});const id=await createLocation(projectId,values(formData,source.image));if(source.uploaded)await setLocationImageReference(projectId,id,source);redirect(`/admin/projects/${projectId}/locations/${id}`);}
export async function updateLocationAction(projectId:number,locationId:number,formData:FormData){await requireAdminSession();const current=await getLocation(projectId,locationId);if(!current)throw new Error("Location not found in this project.");const currentImage=String(current.coat_of_arm??"");const source=await resolveEntityImageSource(projectId,formData,{current:currentImage,pathName:"coatOfArm",fileName:"coatOfArmFile",entityType:"location",entityId:locationId,title:String(current.name)});await updateLocation(projectId,locationId,values(formData,source.image));if(source.uploaded||source.removed||source.image!==currentImage)await setLocationImageReference(projectId,locationId,source);revalidatePath(`/admin/projects/${projectId}/locations/${locationId}`);revalidatePath(`/admin/projects/${projectId}/locations`);}
export async function archiveLocationAction(projectId:number,locationId:number){await requireAdminSession();await archiveLocation(projectId,locationId);redirect(`/admin/projects/${projectId}/locations`);}
