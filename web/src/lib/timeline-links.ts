import "server-only";

import { pool } from "@/lib/db";

export type ResolvedTimelineLink={entity_type:"person"|"group"|"location";entity_id:string;link_role:string|null;name:string;kind:string;image:string|null};

export async function listResolvedTimelineLinks(projectId:number,eventId:number){
  const result=await pool.query<ResolvedTimelineLink>(`SELECT tl.entity_type,tl.entity_id,tl.link_role,
    COALESCE(n.name,g.name,l.name,tl.entity_type||' #'||tl.entity_id::text) AS name,
    CASE WHEN n.n_id IS NOT NULL THEN CASE WHEN gd.g_id IS NOT NULL THEN 'God' WHEN EXISTS(SELECT 1 FROM chars pc WHERE pc.n_id=n.n_id) THEN 'Player Character' ELSE 'NPC / Character' END WHEN g.gr_id IS NOT NULL THEN 'Group' WHEN l.loc_id IS NOT NULL THEN 'Location' ELSE tl.entity_type END AS kind,
    COALESCE(NULLIF(n.image,'noimage'),NULLIF(g.image,'noimage'),NULLIF(l.coat_of_arm,'noimage')) AS image
   FROM timeline_links tl
   LEFT JOIN npcs n ON tl.entity_type='person' AND n.n_id=tl.entity_id AND n.camp_id=tl.project_id
   LEFT JOIN gods gd ON gd.n_id=n.n_id
   LEFT JOIN groups g ON tl.entity_type='group' AND g.gr_id=tl.entity_id AND g.camp_id=tl.project_id
   LEFT JOIN locations l ON tl.entity_type='location' AND l.loc_id=tl.entity_id AND l.camp_id=tl.project_id
   WHERE tl.project_id=$1 AND tl.event_id=$2
   ORDER BY tl.entity_type,name,tl.entity_id`,[projectId,eventId]);
  return result.rows;
}
