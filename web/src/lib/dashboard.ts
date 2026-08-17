import "server-only";

import { pool } from "@/lib/db";

export type DashboardStats = {
  npcs: number;
  gods: number;
  characters: number;
  locations: number;
  groups: number;
  events: number;
  players: number;
  markers: number;
};

export type RecentNpc = {
  id: number;
  name: string;
  title: string | null;
  image: string;
  updatedAt: Date;
};

export async function getProjectDashboard(projectId: number): Promise<{ stats: DashboardStats; recentNpcs: RecentNpc[] }> {
  const [statsResult, recentResult] = await Promise.all([
    pool.query<DashboardStats>(
      `SELECT
         (SELECT count(*)::int FROM npcs n WHERE n.camp_id = $1 AND n.archived_at IS NULL) AS npcs,
         (SELECT count(*)::int FROM gods g JOIN npcs n ON n.n_id = g.n_id WHERE n.camp_id = $1 AND n.archived_at IS NULL) AS gods,
         (SELECT count(*)::int FROM charakters c JOIN npcs n ON n.n_id = c.n_id WHERE n.camp_id = $1 AND n.archived_at IS NULL) AS characters,
         (SELECT count(*)::int FROM locations l WHERE l.camp_id = $1 AND l.archived_at IS NULL) AS locations,
         (SELECT count(*)::int FROM groups gr WHERE gr.camp_id = $1 AND gr.archived_at IS NULL) AS groups,
         (SELECT count(*)::int FROM events e WHERE e.camp_id = $1 AND e.archived_at IS NULL) AS events,
         (SELECT count(*)::int FROM users u WHERE u.camp_id = $1 AND u.active = true) AS players,
         (SELECT count(*)::int FROM map_markers m WHERE m.project_id = $1) AS markers`,
      [projectId],
    ),
    pool.query<{ id: number; name: string; title: string | null; image: string; updated_at: Date }>(
      `SELECT n.n_id AS id, n.name, n.title, n.image, n.updated_at
         FROM npcs n
        WHERE n.camp_id = $1 AND n.archived_at IS NULL
        ORDER BY n.updated_at DESC, n.n_id DESC
        LIMIT 6`,
      [projectId],
    ),
  ]);

  const raw = statsResult.rows[0];
  return {
    stats: {
      npcs: raw?.npcs ?? 0,
      gods: raw?.gods ?? 0,
      characters: raw?.characters ?? 0,
      locations: raw?.locations ?? 0,
      groups: raw?.groups ?? 0,
      events: raw?.events ?? 0,
      players: raw?.players ?? 0,
      markers: raw?.markers ?? 0,
    },
    recentNpcs: recentResult.rows.map((row) => ({ id: row.id, name: row.name, title: row.title, image: row.image, updatedAt: row.updated_at })),
  };
}
