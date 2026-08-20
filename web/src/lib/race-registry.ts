import "server-only";

import { pool } from "@/lib/db";

export type RaceRegistryRow = {
  raceId: number;
  projectId: number;
  name: string;
  parentRaceId: number | null;
  parentName: string | null;
  isUnknown: boolean;
  masculineName: string | null;
  feminineName: string | null;
  hermaphroditeName: string | null;
  description: string | null;
  image: string;
  originMapId: number | null;
  originMapName: string | null;
  characterCount: number;
  childCount: number;
};

export async function listRaceRegistry(projectId: number) {
  const result = await pool.query<RaceRegistryRow>(`
    WITH character_counts AS (
      SELECT n.camp_id AS project_id,c.race_id,count(*)::int AS character_count
        FROM charakters c
        JOIN npcs n ON n.n_id=c.n_id AND n.archived_at IS NULL
       WHERE n.camp_id=$1
       GROUP BY n.camp_id,c.race_id
    ), child_counts AS (
      SELECT project_id,parent_race_id,count(*)::int AS child_count
        FROM races
       WHERE project_id=$1 AND archived_at IS NULL AND parent_race_id IS NOT NULL
       GROUP BY project_id,parent_race_id
    )
    SELECT r.race_id::int AS "raceId",r.project_id AS "projectId",r.name,
           r.parent_race_id::int AS "parentRaceId",p.name AS "parentName",r.is_unknown AS "isUnknown",
           r.masculine_name AS "masculineName",r.feminine_name AS "feminineName",r.hermaphrodite_name AS "hermaphroditeName",
           LEFT(r.description,320) AS description,
           CASE WHEN r.image ~ '^/api/media/[0-9]+$'
             THEN '/api/admin/projects/'||r.project_id||'/entity-images/race/'||r.race_id||'/avatar'
             ELSE r.image END AS image,
           r.origin_map_id::int AS "originMapId",pm.name AS "originMapName",
           COALESCE(cc.character_count,0)::int AS "characterCount",
           COALESCE(ch.child_count,0)::int AS "childCount"
      FROM races r
      LEFT JOIN races p ON p.project_id=r.project_id AND p.race_id=r.parent_race_id AND p.archived_at IS NULL
      LEFT JOIN project_maps pm ON pm.project_id=r.project_id AND pm.map_id=r.origin_map_id
      LEFT JOIN character_counts cc ON cc.project_id=r.project_id AND cc.race_id=r.race_id
      LEFT JOIN child_counts ch ON ch.project_id=r.project_id AND ch.parent_race_id=r.race_id
     WHERE r.project_id=$1 AND r.archived_at IS NULL
     ORDER BY r.is_unknown DESC,COALESCE(p.name,r.name),CASE WHEN r.parent_race_id IS NULL THEN 0 ELSE 1 END,r.name,r.race_id
  `,[projectId]);
  return result.rows;
}
