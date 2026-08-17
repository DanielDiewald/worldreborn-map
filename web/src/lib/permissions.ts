import "server-only";

import { pool } from "@/lib/db";

type EntityType = "npc" | "god" | "character" | "location" | "group" | "event";

type EntityVisibility = {
  project_id: number;
  visibility_mode: "admin_only" | "all_players" | "selected_players";
};

async function getEntityVisibility(projectId: number, entityType: EntityType, entityId: number) {
  const queries: Record<EntityType, string> = {
    npc: `SELECT camp_id AS project_id, visibility_mode FROM npcs WHERE camp_id = $1 AND n_id = $2 AND archived_at IS NULL`,
    god: `SELECT n.camp_id AS project_id, n.visibility_mode FROM gods g JOIN npcs n ON n.n_id = g.n_id WHERE n.camp_id = $1 AND g.g_id = $2 AND n.archived_at IS NULL`,
    character: `SELECT n.camp_id AS project_id, n.visibility_mode FROM charakters c JOIN npcs n ON n.n_id = c.n_id WHERE n.camp_id = $1 AND c.char_id = $2 AND n.archived_at IS NULL`,
    location: `SELECT camp_id AS project_id, visibility_mode FROM locations WHERE camp_id = $1 AND loc_id = $2 AND archived_at IS NULL`,
    group: `SELECT camp_id AS project_id, visibility_mode FROM groups WHERE camp_id = $1 AND gr_id = $2 AND archived_at IS NULL`,
    event: `SELECT camp_id AS project_id, visibility_mode FROM events WHERE camp_id = $1 AND e_id = $2 AND archived_at IS NULL`,
  };

  const result = await pool.query<EntityVisibility>(queries[entityType], [projectId, entityId]);
  return result.rows[0] ?? null;
}

export async function canPlayerViewEntity(args: {
  projectId: number;
  playerId: number;
  entityType: EntityType;
  entityId: number;
}) {
  const player = await pool.query<{ user_id: number }>(
    `SELECT user_id
       FROM users
      WHERE user_id = $1
        AND camp_id = $2
        AND active = true`,
    [args.playerId, args.projectId],
  );
  if (player.rowCount !== 1) return false;

  const entity = await getEntityVisibility(args.projectId, args.entityType, args.entityId);
  if (!entity) return false;

  const explicit = await pool.query<{ visible: boolean }>(
    `SELECT visible
       FROM entity_visibility
      WHERE project_id = $1
        AND player_id = $2
        AND entity_type = $3
        AND entity_id = $4
      LIMIT 1`,
    [args.projectId, args.playerId, args.entityType, args.entityId],
  );

  if (explicit.rowCount === 1) return explicit.rows[0].visible;
  return entity.visibility_mode === "all_players";
}

export async function getEntityForPlayer(args: {
  projectId: number;
  playerId: number;
  entityType: EntityType;
  entityId: number;
}) {
  if (!(await canPlayerViewEntity(args))) return null;

  const baseQueries: Record<EntityType, string> = {
    npc: `SELECT n_id AS id, name, public_description AS description, image, NULL::integer AS location_id FROM npcs WHERE camp_id = $1 AND n_id = $2`,
    god: `SELECT g.g_id AS id, n.name, n.public_description AS description, n.image, NULL::integer AS location_id FROM gods g JOIN npcs n ON n.n_id = g.n_id WHERE n.camp_id = $1 AND g.g_id = $2`,
    character: `SELECT c.char_id AS id, n.name, n.public_description AS description, n.image, c.loc_id AS location_id FROM charakters c JOIN npcs n ON n.n_id = c.n_id WHERE n.camp_id = $1 AND c.char_id = $2`,
    location: `SELECT loc_id AS id, name, description, coat_of_arm AS image, loc_id AS location_id FROM locations WHERE camp_id = $1 AND loc_id = $2`,
    group: `SELECT gr_id AS id, name, NULL::text AS description, image, loc_id AS location_id FROM groups WHERE camp_id = $1 AND gr_id = $2`,
    event: `SELECT e_id AS id, name, NULL::text AS description, image, loc_id AS location_id FROM events WHERE camp_id = $1 AND e_id = $2`,
  };

  const base = await pool.query<{
    id: number;
    name: string;
    description: string | null;
    image: string | null;
    location_id: number | null;
  }>(baseQueries[args.entityType], [args.projectId, args.entityId]);
  if (base.rowCount !== 1) return null;

  const variant = await pool.query<{
    name_override: string | null;
    description_override: string | null;
    image_override: string | null;
    location_override: number | null;
  }>(
    `SELECT name_override, description_override, image_override, location_override
       FROM player_entity_variants
      WHERE project_id = $1
        AND player_id = $2
        AND entity_type = $3
        AND entity_id = $4
        AND mode = 'override'
      LIMIT 1`,
    [args.projectId, args.playerId, args.entityType, args.entityId],
  );

  const item = base.rows[0];
  const override = variant.rows[0];
  if (!override) return item;

  return {
    ...item,
    name: override.name_override ?? item.name,
    description: override.description_override ?? item.description,
    image: override.image_override ?? item.image,
    location_id: override.location_override ?? item.location_id,
  };
}
