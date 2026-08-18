"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/session";
import { deleteMapMarker } from "@/lib/maps";

export async function deleteMapMarkerAction(projectId:number,mapId:number,markerId:number){
  await requireAdminSession();
  await deleteMapMarker(projectId,mapId,markerId);
  revalidatePath(`/admin/projects/${projectId}/map`);
  revalidatePath(`/admin/projects/${projectId}/map/markers`);
  revalidatePath("/player/map");
}
