import "server-only";

import { resolveEntityReference } from "@/lib/entity-reference";

export type ProjectEntityType =
  | "person"
  | "npc"
  | "god"
  | "character"
  | "location"
  | "group"
  | "event"
  | "map"
  | "map_marker"
  | "media"
  | "relationship"
  | "player";

export async function entityBelongsToProject(projectId: number, entityType: string, entityId: number) {
  try {
    await resolveEntityReference({ projectId, entityType, entityId });
    return true;
  } catch {
    return false;
  }
}

export async function assertEntityBelongsToProject(projectId: number, entityType: string, entityId: number) {
  return resolveEntityReference({ projectId, entityType, entityId });
}
