"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { clearAdminSession, requireAdminSession } from "@/lib/auth/session";
import { createProject } from "@/lib/projects";

const projectSchema = z.object({
  name: z.string().trim().min(1,"Projektname ist ein Pflichtfeld.").max(100,"Der Projektname darf höchstens 100 Zeichen enthalten."),
  description: z.string().trim().max(20_000,"Die Beschreibung darf höchstens 20.000 Zeichen enthalten.").optional(),
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
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Die Welt konnte wegen ungültiger Eingaben nicht angelegt werden.");

  const created = await createProject(parsed.data);
  redirect(`/admin/projects/${created.camp_id}`);
}
