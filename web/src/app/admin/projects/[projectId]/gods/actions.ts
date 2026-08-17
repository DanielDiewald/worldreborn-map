"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/session";
import { archiveGod, createGod, updateGod } from "@/lib/entities/gods";

function input(formData: FormData) {
  return {
    name: formData.get("name"),
    gender: formData.get("gender") || "unknown",
    image: formData.get("image") || undefined,
    publicDescription: formData.get("publicDescription") || undefined,
    adminNotes: formData.get("adminNotes") || undefined,
    species: formData.get("species") || undefined,
    profession: formData.get("profession") || undefined,
    personTitle: formData.get("personTitle") || undefined,
    godTitle: formData.get("godTitle") || undefined,
    faction: formData.get("faction") || undefined,
    domain: formData.get("domain") || undefined,
    visibilityMode: formData.get("visibilityMode") || "admin_only",
  };
}

export async function createGodAction(projectId: number, formData: FormData) {
  await requireAdminSession();
  const godId = await createGod(projectId, input(formData));
  redirect(`/admin/projects/${projectId}/gods/${godId}`);
}

export async function updateGodAction(projectId: number, godId: number, formData: FormData) {
  await requireAdminSession();
  await updateGod(projectId, godId, input(formData));
  revalidatePath(`/admin/projects/${projectId}/gods/${godId}`);
}

export async function archiveGodAction(projectId: number, godId: number) {
  await requireAdminSession();
  await archiveGod(projectId, godId);
  redirect(`/admin/projects/${projectId}/gods`);
}
