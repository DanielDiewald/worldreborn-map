import "server-only";

import { pool } from "@/lib/db";

export type SearchEntityType = "person" | "group" | "location";
export type EntitySearchResult = {
  entityType: SearchEntityType;
  entityId: number;
  name: string;
  kind: string;
  subtitle: string | null;
  image: string | null;
};

type SearchArgs = {
  projectId: number;
  query?: string;
  types?: SearchEntityType[];
  limit?: number;
  excludeGroupId?: number | null;
  excludeFamilyTreeId?: number | null;
};

const ALL_TYPES: SearchEntityType[] = ["person", "group", "location"];

function boundedLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return 20;
  return Math.max(1, Math.min(25, Math.trunc(value!)));
}

function normalizedTypes(types: SearchEntityType[] | undefined) {
  const requested = [...new Set(types?.filter((type) => ALL_TYPES.includes(type)) ?? ALL_TYPES)];
  return requested.length ? requested : ALL_TYPES;
}

export async function searchProjectEntities({ projectId, query = "", types, limit, excludeGroupId = null, excludeFamilyTreeId = null }: SearchArgs) {
  const term = query.trim().slice(0, 120);
  const like = `%${term}%`;
  const selectedTypes = normalizedTypes(types);
  const maxRows = boundedLimit(limit);
  const result = await pool.query<EntitySearchResult>(`
    WITH candidates AS (
      SELECT 'person'::text AS "entityType",
             n.n_id::int AS "entityId",
             n.name,
             CASE
               WHEN gd.g_id IS NOT NULL THEN 'God'
               WHEN EXISTS(SELECT 1 FROM chars pc WHERE pc.n_id=n.n_id) THEN 'Player Character'
               ELSE 'NPC / Character'
             END AS kind,
             NULLIF(CONCAT_WS(' · ', NULLIF(c.race,'unknown'), l.name), '') AS subtitle,
             NULLIF(n.image,'noimage') AS image
        FROM npcs n
        LEFT JOIN charakters c ON c.n_id=n.n_id
        LEFT JOIN locations l ON l.loc_id=c.loc_id AND l.camp_id=n.camp_id
        LEFT JOIN gods gd ON gd.n_id=n.n_id
       WHERE n.camp_id=$1
         AND n.archived_at IS NULL
         AND 'person'=ANY($4::text[])
         AND ($2='' OR n.name ILIKE $3 OR c.race ILIKE $3 OR c.class ILIKE $3 OR n.title ILIKE $3)
         AND ($6::int IS NULL OR NOT EXISTS(
              SELECT 1 FROM group_memberships gm
               WHERE gm.project_id=$1 AND gm.group_id=$6 AND gm.entity_type='person' AND gm.entity_id=n.n_id
         ))
         AND ($7::int IS NULL OR NOT EXISTS(
              SELECT 1 FROM family_tree_members ftm
              JOIN family_trees ft ON ft.family_tree_id=ftm.family_tree_id
               WHERE ft.project_id=$1 AND ftm.family_tree_id=$7 AND ftm.person_id=n.n_id
         ))
      UNION ALL
      SELECT 'group'::text,
             g.gr_id::int,
             g.name,
             'Group'::text,
             NULLIF(CONCAT_WS(' · ', NULLIF(g.group_type,''), l.name), ''),
             NULLIF(g.image,'noimage')
        FROM groups g
        LEFT JOIN locations l ON l.loc_id=g.loc_id AND l.camp_id=g.camp_id
       WHERE g.camp_id=$1
         AND g.archived_at IS NULL
         AND 'group'=ANY($4::text[])
         AND ($2='' OR g.name ILIKE $3 OR g.group_type ILIKE $3 OR g.motto ILIKE $3 OR l.name ILIKE $3)
      UNION ALL
      SELECT 'location'::text,
             l.loc_id::int,
             l.name,
             'Location'::text,
             NULLIF(CONCAT_WS(' · ', NULLIF(l.location_type,''), p.name), ''),
             NULLIF(l.coat_of_arm,'noimage')
        FROM locations l
        LEFT JOIN locations p ON p.loc_id=l.parent_loc_id AND p.camp_id=l.camp_id
       WHERE l.camp_id=$1
         AND l.archived_at IS NULL
         AND 'location'=ANY($4::text[])
         AND ($2='' OR l.name ILIKE $3 OR l.location_type ILIKE $3 OR p.name ILIKE $3)
    )
    SELECT "entityType", "entityId", name, kind, subtitle, image
      FROM candidates
     ORDER BY CASE
                WHEN $2<>'' AND lower(name)=lower($2) THEN 0
                WHEN $2<>'' AND name ILIKE ($2 || '%') THEN 1
                ELSE 2
              END,
              name,
              "entityType",
              "entityId"
     LIMIT $5
  `,[projectId,term,like,selectedTypes,maxRows,excludeGroupId,excludeFamilyTreeId]);
  return result.rows;
}

export async function getProjectEntityOption(projectId:number,entityType:SearchEntityType,entityId:number){
  if(!Number.isSafeInteger(entityId)||entityId<=0)return null;
  const result=await pool.query<EntitySearchResult>(`
    SELECT x."entityType",x."entityId",x.name,x.kind,x.subtitle,x.image FROM (
      SELECT 'person'::text AS "entityType",n.n_id::int AS "entityId",n.name,
             CASE WHEN gd.g_id IS NOT NULL THEN 'God' WHEN EXISTS(SELECT 1 FROM chars pc WHERE pc.n_id=n.n_id) THEN 'Player Character' ELSE 'NPC / Character' END AS kind,
             NULLIF(CONCAT_WS(' · ',NULLIF(c.race,'unknown'),l.name),'') AS subtitle,NULLIF(n.image,'noimage') AS image
        FROM npcs n LEFT JOIN charakters c ON c.n_id=n.n_id LEFT JOIN locations l ON l.loc_id=c.loc_id AND l.camp_id=n.camp_id LEFT JOIN gods gd ON gd.n_id=n.n_id
       WHERE n.camp_id=$1 AND n.n_id=$3 AND n.archived_at IS NULL AND $2='person'
      UNION ALL
      SELECT 'group',g.gr_id::int,g.name,'Group',NULLIF(CONCAT_WS(' · ',NULLIF(g.group_type,''),l.name),''),NULLIF(g.image,'noimage')
        FROM groups g LEFT JOIN locations l ON l.loc_id=g.loc_id AND l.camp_id=g.camp_id
       WHERE g.camp_id=$1 AND g.gr_id=$3 AND g.archived_at IS NULL AND $2='group'
      UNION ALL
      SELECT 'location',l.loc_id::int,l.name,'Location',NULLIF(CONCAT_WS(' · ',NULLIF(l.location_type,''),p.name),''),NULLIF(l.coat_of_arm,'noimage')
        FROM locations l LEFT JOIN locations p ON p.loc_id=l.parent_loc_id AND p.camp_id=l.camp_id
       WHERE l.camp_id=$1 AND l.loc_id=$3 AND l.archived_at IS NULL AND $2='location'
    ) x LIMIT 1`,[projectId,entityType,entityId]);
  return result.rows[0]??null;
}
