"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/session";
import { deletePlayerVariant, setPlayerEntityVisibility, upsertPlayerVariant } from "@/lib/entity-visibility";
import { createStandaloneDecoy, deleteStandaloneDecoy } from "@/lib/visibility-admin";

const route=(projectId:number,entityType?:string,entityId?:number)=>`/admin/projects/${projectId}/permissions${entityType&&entityId?`?entityType=${encodeURIComponent(entityType)}&entityId=${entityId}`:""}`;
export async function setVisibilityAction(projectId:number,entityType:string,entityId:number,playerId:number,visible:boolean){await requireAdminSession();await setPlayerEntityVisibility({projectId,entityType,entityId,playerId,visible});revalidatePath(route(projectId,entityType,entityId));}
export async function saveVariantAction(projectId:number,entityType:string,entityId:number,playerId:number,formData:FormData){await requireAdminSession();await upsertPlayerVariant({projectId,entityType,entityId,playerId,input:{name:formData.get("name")||undefined,description:formData.get("description")||undefined,image:formData.get("image")||undefined}});revalidatePath(route(projectId,entityType,entityId));}
export async function deleteVariantAction(projectId:number,entityType:string,entityId:number,playerId:number){await requireAdminSession();await deletePlayerVariant({projectId,entityType,entityId,playerId});revalidatePath(route(projectId,entityType,entityId));}
export async function createDecoyAction(projectId:number,formData:FormData){await requireAdminSession();await createStandaloneDecoy({projectId,playerId:Number(formData.get("playerId")),entityType:String(formData.get("entityType")||"npc"),input:{name:formData.get("name"),description:formData.get("description")||undefined,image:formData.get("image")||undefined}});revalidatePath(route(projectId));}
export async function deleteDecoyAction(projectId:number,variantId:number){await requireAdminSession();await deleteStandaloneDecoy(projectId,variantId);revalidatePath(route(projectId));}
