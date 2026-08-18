"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/session";
import {
  deletePlayerVariant,
  setPlayerEntityVisibility,
  upsertPlayerVariant,
} from "@/lib/entity-visibility";

const id = z.coerce.number().int().positive();

function path(projectId: number, npcId: number) {
  return `/admin/projects/${projectId}/npcs/${npcId}/visibility`;
}

export async function setNpcVisibilityAction(
  projectId: number,
  npcId: number,
  playerId: number,
  visible: boolean,
) {
  await requireAdminSession();
  const parsed = {
    projectId: id.parse(projectId),
    npcId: id.parse(npcId),
    playerId: id.parse(playerId),
  };
  await setPlayerEntityVisibility({
    projectId: parsed.projectId,
    playerId: parsed.playerId,
    entityType: "npc",
    entityId: parsed.npcId,
    visible,
  });
  revalidatePath(path(parsed.projectId, parsed.npcId));
}

export async function saveNpcVariantAction(
  projectId: number,
  npcId: number,
  playerId: number,
  formData: FormData,
) {
  await requireAdminSession();
  const parsed = {
    projectId: id.parse(projectId),
    npcId: id.parse(npcId),
    playerId: id.parse(playerId),
  };
  await upsertPlayerVariant({
    projectId: parsed.projectId,
    playerId: parsed.playerId,
    entityType: "npc",
    entityId: parsed.npcId,
    input: {
      name: formData.get("name") || undefined,
      description: formData.get("description") || undefined,
      image: formData.get("image") || undefined,
    },
  });
  revalidatePath(path(parsed.projectId, parsed.npcId));
}

export async function deleteNpcVariantAction(projectId: number, npcId: number, playerId: number) {
  await requireAdminSession();
  const parsed = {
    projectId: id.parse(projectId),
    npcId: id.parse(npcId),
    playerId: id.parse(playerId),
  };
  await deletePlayerVariant({
    projectId: parsed.projectId,
    playerId: parsed.playerId,
    entityType: "npc",
    entityId: parsed.npcId,
  });
  revalidatePath(path(parsed.projectId, parsed.npcId));
}
