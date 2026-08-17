import "server-only";

import { asc } from "drizzle-orm";
import { db, pool } from "@/lib/db";
import { campaigns } from "@/lib/schema";

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
  }>(
    `SELECT camp_id, name, description, image, logo, status
       FROM campaigns
      WHERE camp_id = $1`,
    [projectId],
  );

  return result.rows[0] ?? null;
}

export async function createProject(input: { name: string; description?: string }) {
  const result = await pool.query<{ camp_id: number; name: string }>(
    `INSERT INTO campaigns (name, description)
     VALUES ($1, $2)
     RETURNING camp_id, name`,
    [input.name, input.description?.trim() || "unknown"],
  );

  return result.rows[0];
}
