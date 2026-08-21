import "server-only";

import { pool } from "@/lib/db";

export type PersonKind = "character" | "god";
export type CanonicalEntityType =
  | "person"
  | "location"
  | "group"
  | "event"
  | "map"
  | "map_marker"
  | "media"
  | "relationship"
  | "player";

export type ResolvedEntityReference = {
  type: CanonicalEntityType;
  id: number;
  projectId: number;
  kind?: PersonKind;
};

export function isPersonReferenceType(entityType: string) {
  return entityType === "person" || entityType === "npc" || entityType === "character" || entityType === "god";
}

async function resolvePerson(projectId: number, entityType: string, entityId: number): Promise<ResolvedEntityReference> {
  if (entityType === "person" || entityType === "npc") {
    const result = await pool.query<{ n_id: number; has_character: boolean; has_god: boolean }>(
      `SELECT n.n_id,
              EXISTS(SELECT 1 FROM charakters c WHERE c.n_id=n.n_id) AS has_character,
              EXISTS(SELECT 1 FROM gods g WHERE g.n_id=n.n_id) AS has_god
         FROM npcs n
        WHERE n.camp_id=$1 AND n.n_id=$2 AND n.archived_at IS NULL`,
      [projectId, entityId],
    );
    if (result.rowCount !== 1) throw new Error("Die Person gehört nicht zu dieser Welt oder ist archiviert.");
    const row = result.rows[0];
    if (row.has_character === row.has_god) throw new Error("Der Personen-Datensatz besitzt keinen eindeutigen Charakter-/Gottheiten-Subtyp.");
    return { type: "person", id: row.n_id, projectId, kind: row.has_god ? "god" : "character" };
  }

  if (entityType === "character") {
    const result = await pool.query<{ n_id: number }>(
      `SELECT n.n_id
         FROM charakters c
         JOIN npcs n ON n.n_id=c.n_id
        WHERE n.camp_id=$1 AND c.char_id=$2 AND n.archived_at IS NULL`,
      [projectId, entityId],
    );
    if (result.rowCount !== 1) throw new Error("Der Charakter gehört nicht zu dieser Welt oder ist archiviert.");
    return { type: "person", id: result.rows[0].n_id, projectId, kind: "character" };
  }

  const result = await pool.query<{ n_id: number }>(
    `SELECT n.n_id
       FROM gods g
       JOIN npcs n ON n.n_id=g.n_id
      WHERE n.camp_id=$1 AND g.g_id=$2 AND n.archived_at IS NULL`,
    [projectId, entityId],
  );
  if (result.rowCount !== 1) throw new Error("Die Gottheit gehört nicht zu dieser Welt oder ist archiviert.");
  return { type: "person", id: result.rows[0].n_id, projectId, kind: "god" };
}

export async function resolveEntityReference(args: {
  projectId: number;
  entityType: string;
  entityId: number;
}): Promise<ResolvedEntityReference> {
  if (!Number.isSafeInteger(args.projectId) || args.projectId <= 0 || !Number.isSafeInteger(args.entityId) || args.entityId <= 0) {
    throw new Error("Ungültige Entitätsreferenz.");
  }

  if (isPersonReferenceType(args.entityType)) {
    return resolvePerson(args.projectId, args.entityType, args.entityId);
  }

  const queries: Partial<Record<CanonicalEntityType, string>> = {
    location: "SELECT 1 FROM locations WHERE camp_id=$1 AND loc_id=$2 AND archived_at IS NULL",
    group: "SELECT 1 FROM groups WHERE camp_id=$1 AND gr_id=$2 AND archived_at IS NULL",
    event: "SELECT 1 FROM events WHERE camp_id=$1 AND e_id=$2 AND archived_at IS NULL",
    map: "SELECT 1 FROM project_maps WHERE project_id=$1 AND map_id=$2",
    map_marker: "SELECT 1 FROM map_markers WHERE project_id=$1 AND marker_id=$2",
    media: "SELECT 1 FROM media WHERE project_id=$1 AND media_id=$2",
    relationship: "SELECT 1 FROM relationships WHERE project_id=$1 AND relationship_id=$2",
    player: "SELECT 1 FROM users WHERE camp_id=$1 AND user_id=$2",
  };
  const query = queries[args.entityType as CanonicalEntityType];
  if (!query) throw new Error(`Nicht unterstützter Entitätstyp: ${args.entityType}`);

  const result = await pool.query(query, [args.projectId, args.entityId]);
  if (result.rowCount !== 1) throw new Error("Die ausgewählte Entität gehört nicht zu dieser Welt oder existiert nicht mehr.");
  return { type: args.entityType as CanonicalEntityType, id: args.entityId, projectId: args.projectId };
}
