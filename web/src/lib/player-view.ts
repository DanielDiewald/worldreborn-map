import "server-only";

import { pool } from "@/lib/db";

export type PlayerNpc={id:string;name:string;description:string|null;image:string|null;title:string|null};

export async function getPlayerContext(projectId:number,playerId:number){const result=await pool.query<{player_name:string;project_name:string}>(`SELECT COALESCE(u.display_name,u.name) AS player_name,c.name AS project_name FROM users u JOIN campaigns c ON c.camp_id=u.camp_id WHERE u.user_id=$2 AND u.camp_id=$1 AND u.active=true AND c.status<>'archived'`,[projectId,playerId]);return result.rows[0]??null;}

export async function listVisibleNpcsForPlayer(projectId:number,playerId:number):Promise<PlayerNpc[]>{const result=await pool.query<{id:string;name:string;description:string|null;image:string|null;title:string|null}>(
`WITH visible_people AS (
 SELECT n.n_id,COALESCE(v.name_override,n.name) AS name,COALESCE(v.description_override,n.public_description) AS description,COALESCE(v.image_override,n.image) AS image,n.title
 FROM npcs n JOIN charakters c ON c.n_id=n.n_id
 LEFT JOIN entity_visibility ev ON ev.project_id=n.camp_id AND ev.player_id=$2 AND ev.entity_type='person' AND ev.entity_id=n.n_id
 LEFT JOIN player_entity_variants v ON v.project_id=n.camp_id AND v.player_id=$2 AND v.entity_type='person' AND v.entity_id=n.n_id AND v.mode='override'
 WHERE n.camp_id=$1 AND n.archived_at IS NULL AND COALESCE(ev.visible,n.visibility_mode='all_players')
),decoys AS (
 SELECT v.variant_id,COALESCE(NULLIF(v.name_override,''),'Unbekannt') AS name,v.description_override AS description,v.image_override AS image,NULL::varchar AS title
 FROM player_entity_variants v WHERE v.project_id=$1 AND v.player_id=$2 AND v.entity_type='person' AND v.mode='standalone_decoy'
)
SELECT n_id::text AS id,name,description,image,title FROM visible_people
UNION ALL SELECT ('decoy:'||variant_id::text),name,description,image,title FROM decoys ORDER BY name`,[projectId,playerId]);return result.rows;}

export async function getPlayerHomeStats(projectId:number,playerId:number){const result=await pool.query<{npcs:number;locations:number;groups:number;events:number}>(`SELECT
 (SELECT count(*)::int FROM npcs n JOIN charakters c ON c.n_id=n.n_id LEFT JOIN entity_visibility ev ON ev.project_id=n.camp_id AND ev.player_id=$2 AND ev.entity_type='person' AND ev.entity_id=n.n_id WHERE n.camp_id=$1 AND n.archived_at IS NULL AND COALESCE(ev.visible,n.visibility_mode='all_players')) AS npcs,
 (SELECT count(*)::int FROM locations l LEFT JOIN entity_visibility ev ON ev.project_id=l.camp_id AND ev.player_id=$2 AND ev.entity_type='location' AND ev.entity_id=l.loc_id WHERE l.camp_id=$1 AND l.archived_at IS NULL AND COALESCE(ev.visible,l.visibility_mode='all_players')) AS locations,
 (SELECT count(*)::int FROM groups g LEFT JOIN entity_visibility ev ON ev.project_id=g.camp_id AND ev.player_id=$2 AND ev.entity_type='group' AND ev.entity_id=g.gr_id WHERE g.camp_id=$1 AND g.archived_at IS NULL AND COALESCE(ev.visible,g.visibility_mode='all_players')) AS groups,
 (SELECT count(*)::int FROM events e LEFT JOIN entity_visibility ev ON ev.project_id=e.camp_id AND ev.player_id=$2 AND ev.entity_type='event' AND ev.entity_id=e.e_id WHERE e.camp_id=$1 AND e.archived_at IS NULL AND COALESCE(ev.visible,e.visibility_mode='all_players')) AS events`,[projectId,playerId]);return result.rows[0]??{npcs:0,locations:0,groups:0,events:0};}
