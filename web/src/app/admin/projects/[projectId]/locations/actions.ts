"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/session";
import { archiveLocation, createLocation, updateLocation } from "@/lib/entities/locations";

function values(formData: FormData) {
  const optionalNumber = (name: string) => {
    const value = formData.get(name);
    return value ? Number(value) : null;
  };
  return {
    name: formData.get("name"), locationType: formData.get("locationType") || undefined,
    description: formData.get("description") || undefined, coatOfArm: formData.get("coatOfArm") || undefined,
    parentLocId: optionalNumber("parentLocId"), ownerNpcId: optionalNumber("ownerNpcId"),
    population: optionalNumber("population"), visibilityMode: formData.get("visibilityMode") || "admin_only",
  };
}

export async function createLocationAction(projectId: number, formData: FormData) {
  await requireAdminSession();
  const id = await createLocation(projectId, values(formData));
  redirect(`/admin/projects/${projectId}/locations/${id}`);
}
export async function updateLocationAction(projectId: number, locationId: number, formData: FormData) {
  await requireAdminSession(); await updateLocation(projectId, locationId, values(formData));
  revalidatePath(`/admin/projects/${projectId}/locations/${locationId}`);
}
export async function archiveLocationAction(projectId: number, locationId: number) {
  await requireAdminSession(); await archiveLocation(projectId, locationId); redirect(`/admin/projects/${projectId}/locations`);
}
