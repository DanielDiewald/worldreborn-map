"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/session";
import { archiveRace, createRace, getRace, updateRace } from "@/lib/entities/races";
import { resolveEntityImageSource } from "@/lib/media";
import { getProject } from "@/lib/projects";

function text(formData: FormData, name: string) { return String(formData.get(name) ?? "").trim(); }
function nullableNumber(formData: FormData, name: string) { const raw = text(formData, name); if (!raw) return null; const value = Number(raw); return Number.isFinite(value) ? value : null; }
async function assertProject(projectId: number) { if (!Number.isSafeInteger(projectId) || projectId <= 0 || !(await getProject(projectId))) throw new Error("Invalid project context"); }

function raceInput(formData: FormData, image: string, imageMediaId: number | null) {
  const originMapId = nullableNumber(formData, "originMapId");
  const originCoordinateMode = text(formData, "originCoordinateMode");
  return {
    name: text(formData, "name"),
    masculineName: text(formData, "masculineName") || null,
    feminineName: text(formData, "feminineName") || null,
    hermaphroditeName: text(formData, "hermaphroditeName") || null,
    description: text(formData, "description") || null,
    image,
    imageMediaId,
    originMapId: originMapId && originMapId > 0 ? Math.trunc(originMapId) : null,
    originCoordinateMode: originMapId && (originCoordinateMode === "xy" || originCoordinateMode === "latlng") ? originCoordinateMode : null,
    originX: originMapId ? nullableNumber(formData, "originX") : null,
    originY: originMapId ? nullableNumber(formData, "originY") : null,
    originLat: originMapId ? nullableNumber(formData, "originLat") : null,
    originLng: originMapId ? nullableNumber(formData, "originLng") : null,
  } as const;
}

export async function createRaceAction(projectId: number, formData: FormData) {
  await requireAdminSession(); await assertProject(projectId);
  const name = text(formData, "name");
  const source = await resolveEntityImageSource(projectId, formData, { title: name || "Spezies" });
  const created = await createRace(projectId, raceInput(formData, source.image, source.mediaId));
  redirect(`/admin/projects/${projectId}/races/${created.raceId}`);
}

export async function updateRaceAction(projectId: number, raceId: number, formData: FormData) {
  await requireAdminSession(); await assertProject(projectId);
  const current = await getRace(projectId, raceId); if (!current) throw new Error("Spezies wurde nicht gefunden.");
  const source = await resolveEntityImageSource(projectId, formData, { current: current.image, title: current.name });
  await updateRace(projectId, raceId, raceInput(formData, source.image, source.mediaId));
  revalidatePath(`/admin/projects/${projectId}/races`);
  revalidatePath(`/admin/projects/${projectId}/races/${raceId}`);
  revalidatePath(`/admin/projects/${projectId}/npcs`);
}

export async function archiveRaceAction(projectId: number, raceId: number) {
  await requireAdminSession(); await assertProject(projectId);
  await archiveRace(projectId, raceId);
  redirect(`/admin/projects/${projectId}/races`);
}
