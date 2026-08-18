import "server-only";

import { asc } from "drizzle-orm";
import { z } from "zod";
import { db, pool } from "@/lib/db";
import { campaigns } from "@/lib/schema";

const projectInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(20_000).optional(),
  image: z.string().trim().max(4000).optional(),
  logo: z.string().trim().max(4000).optional(),
  inWorldDate: z.string().trim().max(200).optional(),
  status: z.enum(["active", "planning", "archived"]).optional(),
});

export async function listProjects() {
  return db
    .select({
      id: campaigns.campId,
      name: campaigns.name,
      description: campaigns.description,
      image: campaigns.image,
      logo: campaigns.logo,
      status: campaigns.status,
      inWorldDate: campaigns.inWorldDate,
    })
    .from(campaigns)
    .orderBy(asc(campaigns.campId));
}

export async function getProject(projectId: number) {
  const result = await pool.query<{
    camp_id: number;
    name: string;
    description: string;
    image: string;
    logo: string | null;
    status: string;
    in_world_date: string | null;
    primary_map_id: string | null;
    settings: Record<string, unknown>;
  }>(
    `SELECT camp_id, name, description, image, logo, status,
            in_world_date, primary_map_id, settings
       FROM campaigns
      WHERE camp_id = $1`,
    [projectId],
  );

  return result.rows[0] ?? null;
}

export async function createProject(input: unknown) {
  const parsed = projectInputSchema.parse(input);
  const result = await pool.query<{ camp_id: number; name: string }>(
    `INSERT INTO campaigns (
       name, description, image, logo, status, settings, in_world_date
     ) VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, $6)
     RETURNING camp_id, name`,
    [
      parsed.name,
      parsed.description || "unknown",
      parsed.image || "noimage",
      parsed.logo || null,
      parsed.status || "active",
      parsed.inWorldDate || null,
    ],
  );

  return result.rows[0];
}

export async function updateProject(projectId: number, input: unknown) {
  const parsed = projectInputSchema.parse(input);
  const result = await pool.query(
    `UPDATE campaigns
        SET name = $2,
            description = $3,
            image = $4,
            logo = $5,
            status = $6,
            in_world_date = $7,
            updated_at = now()
      WHERE camp_id = $1`,
    [
      projectId,
      parsed.name,
      parsed.description || "unknown",
      parsed.image || "noimage",
      parsed.logo || null,
      parsed.status || "active",
      parsed.inWorldDate || null,
    ],
  );

  if (result.rowCount !== 1) throw new Error("Project not found.");
}

export async function archiveProject(projectId: number) {
  const result = await pool.query(
    `UPDATE campaigns SET status = 'archived', updated_at = now() WHERE camp_id = $1`,
    [projectId],
  );
  if (result.rowCount !== 1) throw new Error("Project not found.");
}
