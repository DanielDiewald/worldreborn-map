import "server-only";

import { z } from "zod";
import { pool } from "@/lib/db";

const querySchema=z.string().trim().min(1).max(120);
export type SearchResult={entityType:string;entityId:number;name:string;subtitle:string|null;href:string};

export async function searchProject(projectId:number,rawQuery:unknown):Promise<SearchResult[]>{
  const query=querySchema.parse(rawQuery);const pattern=`%${query}%`;
  const result=await pool.query<{entity_type:string;entity_id:number;name:string;subtitle:string|null;kind:string|null}>(
`SELECT 'person'::text AS entity_type,n.n_id::int AS entity_id,n.name,
        CASE WHEN g.g_id IS NOT NULL THEN concat_ws(' · ',NULLIF(g.title,''),NULLIF(g.domain,''))
             ELSE concat_ws(' · ',NULLIF(c.race,''),NULLIF(c.class,'')) END AS subtitle,
        CASE WHEN g.g_id IS NOT NULL THEN 'god' ELSE 'character' END AS kind
 FROM npcs n
 LEFT JOIN charakters c ON c.n_id=n.n_id
 LEFT JOIN gods g ON g.n_id=n.n_id
 WHERE n.camp_id=$1 AND n.archived_at IS NULL
   AND (n.name ILIKE $2 OR n.title ILIKE $2 OR n.species ILIKE $2 OR n.profession ILIKE $2
        OR c.race ILIKE $2 OR c.class ILIKE $2 OR g.title ILIKE $2 OR g.domain ILIKE $2 OR g.faction ILIKE $2)
 UNION ALL SELECT 'location',l.loc_id,l.name,l.location_type,NULL FROM locations l WHERE l.camp_id=$1 AND l.archived_at IS NULL AND (l.name ILIKE $2 OR l.location_type ILIKE $2 OR l.description ILIKE $2)
 UNION ALL SELECT 'group',gr.gr_id,gr.name,gr.group_type,NULL FROM groups gr WHERE gr.camp_id=$1 AND gr.archived_at IS NULL AND (gr.name ILIKE $2 OR gr.group_type ILIKE $2 OR gr.notes ILIKE $2)
 UNION ALL SELECT 'event',e.e_id,e.name,COALESCE(e.display_date,e.date::text),NULL FROM events e WHERE e.camp_id=$1 AND e.archived_at IS NULL AND (e.name ILIKE $2 OR e.notes ILIKE $2 OR e.display_date ILIKE $2)
 ORDER BY name LIMIT 100`,[projectId,pattern]);
  return result.rows.map((r)=>({entityType:r.entity_type,entityId:r.entity_id,name:r.name,subtitle:r.subtitle,href:r.entity_type==="person"?`/admin/projects/${projectId}/${r.kind==="god"?"gods":"npcs"}/${r.entity_id}`:`/admin/projects/${projectId}/${r.entity_type==="location"?"locations":r.entity_type==="group"?"groups":"timeline"}/${r.entity_id}`}));
}

export async function searchForPlayer(projectId:number,playerId:number,rawQuery:unknown):Promise<SearchResult[]>{
  const query=querySchema.parse(rawQuery);const pattern=`%${query}%`;
  const result=await pool.query<{entity_type:string;entity_id:number;name:string;subtitle:string|null;kind:string|null}>(
`SELECT 'person'::text AS entity_type,n.n_id::int AS entity_id,COALESCE(v.name_override,n.name) AS name,
        CASE WHEN g.g_id IS NOT NULL THEN concat_ws(' · ',NULLIF(g.title,''),NULLIF(g.domain,''))
             ELSE concat_ws(' · ',NULLIF(c.race,''),NULLIF(c.class,'')) END AS subtitle,
        CASE WHEN g.g_id IS NOT NULL THEN 'god' ELSE 'character' END AS kind
 FROM npcs n
 LEFT JOIN charakters c ON c.n_id=n.n_id LEFT JOIN gods g ON g.n_id=n.n_id
 LEFT JOIN entity_visibility ev ON ev.project_id=n.camp_id AND ev.player_id=$2 AND ev.entity_type='person' AND ev.entity_id=n.n_id
 LEFT JOIN player_entity_variants v ON v.project_id=n.camp_id AND v.player_id=$2 AND v.entity_type='person' AND v.entity_id=n.n_id AND v.mode='override'
 WHERE n.camp_id=$1 AND n.archived_at IS NULL AND COALESCE(ev.visible,n.visibility_mode='all_players') AND COALESCE(v.name_override,n.name) ILIKE $3
 UNION ALL SELECT 'location',l.loc_id,l.name,l.location_type,NULL FROM locations l LEFT JOIN entity_visibility ev ON ev.project_id=l.camp_id AND ev.player_id=$2 AND ev.entity_type='location' AND ev.entity_id=l.loc_id WHERE l.camp_id=$1 AND l.archived_at IS NULL AND COALESCE(ev.visible,l.visibility_mode='all_players') AND l.name ILIKE $3
 UNION ALL SELECT 'group',gr.gr_id,gr.name,gr.group_type,NULL FROM groups gr LEFT JOIN entity_visibility ev ON ev.project_id=gr.camp_id AND ev.player_id=$2 AND ev.entity_type='group' AND ev.entity_id=gr.gr_id WHERE gr.camp_id=$1 AND gr.archived_at IS NULL AND COALESCE(ev.visible,gr.visibility_mode='all_players') AND gr.name ILIKE $3
 UNION ALL SELECT 'event',e.e_id,e.name,COALESCE(e.display_date,e.date::text),NULL FROM events e LEFT JOIN entity_visibility ev ON ev.project_id=e.camp_id AND ev.player_id=$2 AND ev.entity_type='event' AND ev.entity_id=e.e_id WHERE e.camp_id=$1 AND e.archived_at IS NULL AND COALESCE(ev.visible,e.visibility_mode='all_players') AND e.name ILIKE $3
 ORDER BY name LIMIT 100`,[projectId,playerId,pattern]);
  return result.rows.map((r)=>({entityType:r.entity_type,entityId:r.entity_id,name:r.name,subtitle:r.subtitle,href:r.entity_type==="person"?`/player/${r.kind==="god"?"gods":"npcs"}/${r.entity_id}`:`/player/${r.entity_type==="location"?"locations":r.entity_type==="group"?"groups":"timeline"}/${r.entity_id}`}));
}
