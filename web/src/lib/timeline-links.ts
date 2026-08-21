import "server-only";

import { pool } from "@/lib/db";

export type ResolvedTimelineLink={entity_type:"person"|"group"|"location";entity_id:string;link_role:string|null;name:string;kind:string;image:string|null};

export async function listResolvedTimelineLinks(projectId:number,eventId:number){
  const result=await pool.query<ResolvedTimelineLink>(`SELECT tl.entity_type,tl.entity_id,tl.link_role,
    COALESCE(n.name,g.name,l.name,tl.entity_type||' #'||tl.entity_id::text) AS name,
    CASE WHEN n.n_id IS NOT NULL THEN CASE WHEN gd.g_id IS NOT NULL THEN 'Gottheit' WHEN EXISTS(SELECT 1 FROM chars pc WHERE pc.n_id=n.n_id) THEN 'Spielercharakter' ELSE 'NPC / Charakter' END WHEN g.gr_id IS NOT NULL THEN 'Gruppe' WHEN l.loc_id IS NOT NULL THEN 'Ort' ELSE tl.entity_type END AS kind,
    CASE
      WHEN n.n_id IS NOT NULL AND n.image IS NOT NULL AND n.image NOT IN ('noimage','/noimg.jpg') THEN CASE WHEN n.image ~ '^/api/media/[0-9]+$' OR n.image LIKE '/img/%' OR n.image LIKE '/images/%' OR n.image LIKE '/uploads/%' THEN '/api/admin/projects/'||tl.project_id||'/entity-images/person/'||n.n_id||'/avatar' ELSE n.image END
      WHEN g.gr_id IS NOT NULL AND g.image IS NOT NULL AND g.image NOT IN ('noimage','/noimg.jpg') THEN CASE WHEN g.image ~ '^/api/media/[0-9]+$' OR g.image LIKE '/img/%' OR g.image LIKE '/images/%' OR g.image LIKE '/uploads/%' THEN '/api/admin/projects/'||tl.project_id||'/entity-images/group/'||g.gr_id||'/avatar' ELSE g.image END
      WHEN l.loc_id IS NOT NULL AND l.coat_of_arm IS NOT NULL AND l.coat_of_arm NOT IN ('noimage','/noimg.jpg') THEN CASE WHEN l.coat_of_arm ~ '^/api/media/[0-9]+$' OR l.coat_of_arm LIKE '/img/%' OR l.coat_of_arm LIKE '/images/%' OR l.coat_of_arm LIKE '/uploads/%' THEN '/api/admin/projects/'||tl.project_id||'/entity-images/location/'||l.loc_id||'/avatar' ELSE l.coat_of_arm END
      ELSE NULL
    END AS image
   FROM timeline_links tl
   LEFT JOIN npcs n ON tl.entity_type='person' AND n.n_id=tl.entity_id AND n.camp_id=tl.project_id
   LEFT JOIN gods gd ON gd.n_id=n.n_id
   LEFT JOIN groups g ON tl.entity_type='group' AND g.gr_id=tl.entity_id AND g.camp_id=tl.project_id
   LEFT JOIN locations l ON tl.entity_type='location' AND l.loc_id=tl.entity_id AND l.camp_id=tl.project_id
   WHERE tl.project_id=$1 AND tl.event_id=$2
   ORDER BY tl.entity_type,name,tl.entity_id`,[projectId,eventId]);
  return result.rows;
}
