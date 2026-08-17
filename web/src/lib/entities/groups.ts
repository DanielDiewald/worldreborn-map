import "server-only";

import { z } from "zod";
import { pool } from "@/lib/db";

const groupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  image: z.string().trim().max(4000).optional(),
  notes: z.string().max(100_000).optional(),
  motto: z.string().max(10_000).optional(),
  locationId: z.coerce.number().int().positive(),
  groupType: z.string().trim().max(80).optional(),
  visibilityMode: z.enum(["admin_only", "all_players", "selected_players"]).default("admin_only"),
});

async function assertLocation(projectId: number, locationId: number) {
  const result = await pool.query("SELECT 1 FROM locations WHERE camp_id=$1 AND loc_id=$2 AND archived_at IS NULL", [projectId, locationId]);
  if (result.rowCount !== 1) throw new Error("Headquarters does not belong to this project.");
}

export async function listGroups(projectId: number) {
  const result = await pool.query(
    `SELECT g.gr_id, g.name, g.image, g.notes, g.motto, g.loc_id, g.members,
            g.group_type, g.visibility_mode, l.name AS location_name,
            (SELECT count(*)::int FROM group_memberships gm
              WHERE gm.project_id=g.camp_id AND gm.group_id=g.gr_id) AS relation_members
       FROM groups g JOIN locations l ON l.loc_id=g.loc_id AND l.camp_id=g.camp_id
      WHERE g.camp_id=$1 AND g.archived_at IS NULL
      ORDER BY g.name, g.gr_id`, [projectId]);
  return result.rows;
}

export async function getGroup(projectId: number, groupId: number) {
  const result = await pool.query(
    `SELECT g.*, l.name AS location_name
       FROM groups g JOIN locations l ON l.loc_id=g.loc_id AND l.camp_id=g.camp_id
      WHERE g.camp_id=$1 AND g.gr_id=$2 AND g.archived_at IS NULL`, [projectId, groupId]);
  return result.rows[0] ?? null;
}

export async function createGroup(projectId: number, input: unknown) {
  const data = groupSchema.parse(input);
  await assertLocation(projectId, data.locationId);
  const result = await pool.query<{ gr_id: number }>(
    `INSERT INTO groups (loc_id,name,image,notes,members,motto,camp_id,group_type,visibility_mode,metadata,updated_at)
     SELECT $2,$3,$4,$5,0,$6,c.camp_id,$7,$8,'{}'::jsonb,now()
       FROM campaigns c WHERE c.camp_id=$1 AND c.status <> 'archived'
     RETURNING gr_id`,
    [projectId, data.locationId, data.name, data.image || "noimage", data.notes || "no notes yet",
      data.motto || "unknown", data.groupType || null, data.visibilityMode]);
  if (result.rowCount !== 1) throw new Error("Project not found or archived.");
  return result.rows[0].gr_id;
}

export async function updateGroup(projectId: number, groupId: number, input: unknown) {
  const data = groupSchema.parse(input);
  await assertLocation(projectId, data.locationId);
  const result = await pool.query(
    `UPDATE groups SET loc_id=$3,name=$4,image=$5,notes=$6,motto=$7,
       group_type=$8,visibility_mode=$9,updated_at=now()
     WHERE camp_id=$1 AND gr_id=$2 AND archived_at IS NULL`,
    [projectId, groupId, data.locationId, data.name, data.image || "noimage",
      data.notes || "no notes yet", data.motto || "unknown", data.groupType || null, data.visibilityMode]);
  if (result.rowCount !== 1) throw new Error("Group not found in this project.");
}

export async function archiveGroup(projectId: number, groupId: number) {
  const result = await pool.query(
    `UPDATE groups SET archived_at=now(),updated_at=now()
      WHERE camp_id=$1 AND gr_id=$2 AND archived_at IS NULL`, [projectId, groupId]);
  if (result.rowCount !== 1) throw new Error("Group not found in this project.");
}

export async function setGroupMembership(args: { projectId:number; groupId:number; entityType:string; entityId:number; role?:string }) {
  const group = await pool.query("SELECT 1 FROM groups WHERE camp_id=$1 AND gr_id=$2 AND archived_at IS NULL", [args.projectId,args.groupId]);
  if (group.rowCount !== 1) throw new Error("Group not found in this project.");
  await pool.query(
    `INSERT INTO group_memberships(project_id,group_id,entity_type,entity_id,role)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(project_id,group_id,entity_type,entity_id)
     DO UPDATE SET role=EXCLUDED.role`,
    [args.projectId,args.groupId,args.entityType,args.entityId,args.role || null]);
  await pool.query(
    `UPDATE groups SET members=(SELECT count(*) FROM group_memberships WHERE project_id=$1 AND group_id=$2),updated_at=now()
      WHERE camp_id=$1 AND gr_id=$2`, [args.projectId,args.groupId]);
}

export async function removeGroupMembership(args:{projectId:number;groupId:number;entityType:string;entityId:number}) {
  await pool.query(`DELETE FROM group_memberships WHERE project_id=$1 AND group_id=$2 AND entity_type=$3 AND entity_id=$4`,
    [args.projectId,args.groupId,args.entityType,args.entityId]);
  await pool.query(
    `UPDATE groups SET members=(SELECT count(*) FROM group_memberships WHERE project_id=$1 AND group_id=$2),updated_at=now()
      WHERE camp_id=$1 AND gr_id=$2`, [args.projectId,args.groupId]);
}
