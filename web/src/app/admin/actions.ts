"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { clearAdminSession, requireAdminSession } from "@/lib/auth/session";
import { createProject } from "@/lib/projects";

const projectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(20_000).optional(),
});

export async function logoutAdmin() {
  await clearAdminSession();
  redirect("/admin/login");
}

export async function createProjectAction(formData: FormData) {
  await requireAdminSession();
  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) return;

  const created = await createProject(parsed.data);
  redirect(`/admin/projects/${created.camp_id}`);
}
