"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/session";
import { archiveNpc, createNpc, updateNpc } from "@/lib/entities/npcs";
import { getProject } from "@/lib/projects";

const npcSchema = z.object({
  name: z.string().trim().min(1).max(100),
  gender: z.string().trim().max(10).optional(),
  image: z.string().trim().max(4000).optional(),
  publicDescription: z.string().trim().max(100_000).optional(),
  adminNotes: z.string().trim().max(100_000).optional(),
  title: z.string().trim().max(120).optional(),
  species: z.string().trim().max(80).optional(),
  profession: z.string().trim().max(120).optional(),
});

function readNpcForm(formData: FormData) {
  return npcSchema.safeParse({
    name: formData.get("name"),
    gender: formData.get("gender") || undefined,
    image: formData.get("image") || undefined,
    publicDescription: formData.get("publicDescription") || undefined,
    adminNotes: formData.get("adminNotes") || undefined,
    title: formData.get("title") || undefined,
    species: formData.get("species") || undefined,
    profession: formData.get("profession") || undefined,
  });
}

async function assertProject(projectId: number) {
  if (!Number.isSafeInteger(projectId) || projectId <= 0 || !(await getProject(projectId))) {
    throw new Error("Invalid project context");
  }
}

export async function createNpcAction(projectId: number, formData: FormData) {
  await requireAdminSession();
  await assertProject(projectId);
  const parsed = readNpcForm(formData);
  if (!parsed.success) return;

  const created = await createNpc(projectId, parsed.data);
  redirect(`/admin/projects/${projectId}/npcs/${created.nId}`);
}

export async function updateNpcAction(projectId: number, npcId: number, formData: FormData) {
  await requireAdminSession();
  await assertProject(projectId);
  const parsed = readNpcForm(formData);
  if (!parsed.success) return;

  const updated = await updateNpc(projectId, npcId, parsed.data);
  if (!updated) throw new Error("NPC not found in this project");
  revalidatePath(`/admin/projects/${projectId}/npcs/${npcId}`);
  revalidatePath(`/admin/projects/${projectId}/npcs`);
}

export async function archiveNpcAction(projectId: number, npcId: number) {
  await requireAdminSession();
  await assertProject(projectId);
  const archived = await archiveNpc(projectId, npcId);
  if (!archived) throw new Error("NPC not found in this project");
  redirect(`/admin/projects/${projectId}/npcs`);
}
