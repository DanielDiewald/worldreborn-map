import "server-only";

import { z } from "zod";
import { pool } from "@/lib/db";

const locationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  locationType: z.string().trim().max(80).optional(),
  description: z.string().max(100_000).optional(),
  coatOfArm: z.string().trim().max(4000).optional(),
  parentLocId: z.coerce.number().int().positive().nullable().optional(),
  ownerNpcId: z.coerce.number().int().positive().nullable().optional(),
  population: z.coerce.number().int().nonnegative().nullable().optional(),
  visibilityMode: z.enum(["admin_only", "all_players", "selected_players"]).default("admin_only"),
});

async function validateReferences(projectId: number, parentLocId?: number | null, ownerNpcId?: number | null) {
  if (parentLocId) {
    const parent = await pool.query("SELECT 1 FROM locations WHERE camp_id=$1 AND loc_id=$2 AND archived_at IS NULL", [projectId, parentLocId]);
    if (parent.rowCount !== 1) throw new Error("Parent location does not belong to this project.");
  }
  if (ownerNpcId) {
    const owner = await pool.query("SELECT 1 FROM npcs WHERE camp_id=$1 AND n_id=$2 AND archived_at IS NULL", [projectId, ownerNpcId]);
    if (owner.rowCount !== 1) throw new Error("Owner does not belong to this project.");
  }
}

export async function listLocations(projectId: number) {
  const result = await pool.query(
    `SELECT l.loc_id, l.name, l.coat_of_arm, l.parent_loc_id, l.location_type,
            l.description, l.owner_n_id, l.population, l.visibility_mode,
            p.name AS parent_name, o.name AS owner_name
       FROM locations l
       LEFT JOIN locations p ON p.loc_id=l.parent_loc_id AND p.camp_id=l.camp_id
       LEFT JOIN npcs o ON o.n_id=l.owner_n_id AND o.camp_id=l.camp_id
      WHERE l.camp_id=$1 AND l.archived_at IS NULL
      ORDER BY l.name, l.loc_id`, [projectId]);
  return result.rows;
}

export async function getLocation(projectId: number, locationId: number) {
  const result = await pool.query(
    `SELECT * FROM locations WHERE camp_id=$1 AND loc_id=$2 AND archived_at IS NULL`,
    [projectId, locationId]);
  return result.rows[0] ?? null;
}

export async function createLocation(projectId: number, input: unknown) {
  const data = locationSchema.parse(input);
  await validateReferences(projectId, data.parentLocId, data.ownerNpcId);
  const result = await pool.query<{ loc_id: number }>(
    `INSERT INTO locations (
       camp_id, name, coat_of_arm, parent_loc_id, location_type, description,
       owner_n_id, population, visibility_mode, metadata, updated_at
     )
     SELECT c.camp_id,$2,$3,$4,$5,$6,$7,$8,$9,'{}'::jsonb,now()
       FROM campaigns c WHERE c.camp_id=$1 AND c.status <> 'archived'
     RETURNING loc_id`,
    [projectId, data.name, data.coatOfArm || null, data.parentLocId || null, data.locationType || null,
      data.description || null, data.ownerNpcId || null, data.population ?? null, data.visibilityMode]);
  if (result.rowCount !== 1) throw new Error("Project not found or archived.");
  return result.rows[0].loc_id;
}

export async function updateLocation(projectId: number, locationId: number, input: unknown) {
  const data = locationSchema.parse(input);
  if (data.parentLocId === locationId) throw new Error("A location cannot be its own parent.");
  await validateReferences(projectId, data.parentLocId, data.ownerNpcId);
  const result = await pool.query(
    `UPDATE locations SET name=$3, coat_of_arm=$4, parent_loc_id=$5,
       location_type=$6, description=$7, owner_n_id=$8, population=$9,
       visibility_mode=$10, updated_at=now()
     WHERE camp_id=$1 AND loc_id=$2 AND archived_at IS NULL`,
    [projectId, locationId, data.name, data.coatOfArm || null, data.parentLocId || null,
      data.locationType || null, data.description || null, data.ownerNpcId || null,
      data.population ?? null, data.visibilityMode]);
  if (result.rowCount !== 1) throw new Error("Location not found in this project.");
}

export async function archiveLocation(projectId: number, locationId: number) {
  const result = await pool.query(
    `UPDATE locations SET archived_at=now(), updated_at=now()
      WHERE camp_id=$1 AND loc_id=$2 AND archived_at IS NULL`, [projectId, locationId]);
  if (result.rowCount !== 1) throw new Error("Location not found in this project.");
}

export async function getLocationTree(projectId: number) {
  const rows = await listLocations(projectId);
  return rows;
}
