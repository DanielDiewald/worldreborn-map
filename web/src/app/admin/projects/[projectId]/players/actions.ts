"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/session";
import {
  createPlayer,
  issuePlayerCode,
  revokePlayerCode,
  setPlayerActive,
} from "@/lib/players";

const positiveId = z.number().int().positive();

export async function createPlayerAction(projectId: number, formData: FormData) {
  await requireAdminSession();
  positiveId.parse(projectId);
  await createPlayer(projectId, {
    name: formData.get("name"),
    displayName: formData.get("displayName") || undefined,
  });
  revalidatePath(`/admin/projects/${projectId}/players`);
}

export async function issuePlayerCodeAction(
  projectId: number,
  playerId: number,
  _previousState: { code: string | null; error: string | null },
) {
  await requireAdminSession();
  positiveId.parse(projectId);
  positiveId.parse(playerId);

  try {
    const code = await issuePlayerCode(projectId, playerId);
    revalidatePath(`/admin/projects/${projectId}/players`);
    return { code, error: null };
  } catch (error) {
    return {
      code: null,
      error: error instanceof Error ? error.message : "Code konnte nicht erstellt werden.",
    };
  }
}

export async function revokePlayerCodeAction(projectId: number, playerId: number) {
  await requireAdminSession();
  positiveId.parse(projectId);
  positiveId.parse(playerId);
  await revokePlayerCode(projectId, playerId);
  revalidatePath(`/admin/projects/${projectId}/players`);
}

export async function togglePlayerAction(projectId: number, playerId: number, active: boolean) {
  await requireAdminSession();
  positiveId.parse(projectId);
  positiveId.parse(playerId);
  await setPlayerActive(projectId, playerId, active);
  revalidatePath(`/admin/projects/${projectId}/players`);
}
