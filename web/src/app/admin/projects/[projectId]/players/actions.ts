"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/session";
import { formOptionalText, formText } from "@/lib/form-data";
import {
  createPlayer,
  issuePlayerCode,
  revokePlayerCode,
  setPlayerActive,
} from "@/lib/players";
import { getProject } from "@/lib/projects";

export type PlayerCodeState = { code: string | null; error: string | null };
async function assertProject(projectId:number){if(!Number.isSafeInteger(projectId)||projectId<=0||!(await getProject(projectId)))throw new Error("Die ausgewählte Welt wurde nicht gefunden oder ist archiviert.");}
function assertPlayerId(playerId:number){if(!Number.isSafeInteger(playerId)||playerId<=0)throw new Error("Ungültige Spieler-ID.");}

export async function createPlayerAction(projectId: number, formData: FormData) {
  await requireAdminSession();await assertProject(projectId);
  const name=formText(formData,"name");if(!name)throw new Error("Spielername ist ein Pflichtfeld.");if(name.length>120)throw new Error("Der Spielername darf höchstens 120 Zeichen enthalten.");
  const displayName=formOptionalText(formData,"displayName");if(displayName&&displayName.length>120)throw new Error("Der Anzeigename darf höchstens 120 Zeichen enthalten.");
  await createPlayer(projectId,{name,displayName:displayName??undefined});
  revalidatePath(`/admin/projects/${projectId}/players`);
}

export async function issuePlayerCodeAction(projectId: number, playerId: number, _previousState: PlayerCodeState): Promise<PlayerCodeState> {
  await requireAdminSession();await assertProject(projectId);assertPlayerId(playerId);
  try { const code = await issuePlayerCode(projectId, playerId); revalidatePath(`/admin/projects/${projectId}/players`); return { code, error: null }; }
  catch (error) { return { code: null, error: error instanceof Error ? error.message : "Code konnte nicht erstellt werden." }; }
}

export async function revokePlayerCodeAction(projectId: number, playerId: number) { await requireAdminSession();await assertProject(projectId);assertPlayerId(playerId);await revokePlayerCode(projectId, playerId);revalidatePath(`/admin/projects/${projectId}/players`); }
export async function togglePlayerAction(projectId: number, playerId: number, active: boolean) { await requireAdminSession();await assertProject(projectId);assertPlayerId(playerId);await setPlayerActive(projectId, playerId, active);revalidatePath(`/admin/projects/${projectId}/players`); }
