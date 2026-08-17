import "server-only";

import { z } from "zod";
import { pool } from "@/lib/db";

const filtersSchema = z.object({
  action: z.string().trim().max(120).optional(),
  entityType: z.string().trim().max(40).optional(),
  limit: z.number().int().min(1).max(500).default(100),
});

export async function listAuditLog(projectId: number, input: unknown = {}) {
  const filters = filtersSchema.parse(input);
  const values: unknown[] = [projectId];
  const where = ["project_id = $1"];

  if (filters.action) {
    values.push(`%${filters.action}%`);
    where.push(`action ILIKE $${values.length}`);
  }
  if (filters.entityType) {
    values.push(filters.entityType);
    where.push(`entity_type = $${values.length}`);
  }
  values.push(filters.limit);

  const result = await pool.query<{
    audit_id: string;
    actor_type: string;
    actor_user_id: number | null;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    metadata: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT audit_id, actor_type, actor_user_id, action, entity_type, entity_id, metadata, created_at
       FROM audit_log
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC, audit_id DESC
      LIMIT $${values.length}`,
    values,
  );
  return result.rows;
}
