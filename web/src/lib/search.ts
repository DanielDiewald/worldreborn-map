import "server-only";

import { z } from "zod";
import { pool } from "@/lib/db";

const querySchema=z.string().trim().min(1).max(120);
export type SearchResult={entityType:string;entityId:number;name:string;subtitle:string|null;href:string};

export async function searchProject(projectId:number,rawQuery:unknown):Promise<SearchResult[]>{const query=querySchema.parse(rawQuery);const pattern=`%${query}%`;const result=await pool.query<{entity_type:string;entity_id:number;name:string;subtitle:string|null}>(
`SELECT 'npc'::text entity_type,n.n_id::int entity_id,n.name,n.title::text subtitle FROM npcs n WHERE n.camp_id=$1 AND n.archived_at IS NULL AND (n.name ILIKE $2 OR n.title ILIKE $2 OR n.species ILIKE $2 OR n.profession ILIKE $2)
 UNION ALL SELECT 'god',g.g_id,n.name,(g.title||' · '||g.domain) FROM gods g JOIN npcs n ON n.n_id=g.n_id WHERE n.camp_id=$1 AND n.archived_at IS NULL AND (n.name ILIKE $2 OR g.title ILIKE $2 OR g.domain ILIKE $2 OR g.faction ILIKE $2)
 UNION ALL SELECT 'character',c.char_id,n.name,(c.race||' · '||c.class) FROM charakters c JOIN npcs n ON n.n_id=c.n_id WHERE n.camp_id=$1 AND n.archived_at IS NULL AND (n.name ILIKE $2 OR c.race ILIKE $2 OR c.class ILIKE $2)
 UNION ALL SELECT 'location',l.loc_id,l.name,l.location_type FROM locations l WHERE l.camp_id=$1 AND l.archived_at IS NULL AND (l.name ILIKE $2 OR l.location_type ILIKE $2 OR l.description ILIKE $2)
 UNION ALL SELECT 'group',g.gr_id,g.name,g.group_type FROM groups g WHERE g.camp_id=$1 AND g.archived_at IS NULL AND (g.name ILIKE $2 OR g.group_type ILIKE $2 OR g.notes ILIKE $2)
 UNION ALL SELECT 'event',e.e_id,e.name,COALESCE(e.display_date,e.date::text) FROM events e WHERE e.camp_id=$1 AND e.archived_at IS NULL AND (e.name ILIKE $2 OR e.notes ILIKE $2 OR e.display_date ILIKE $2)
 ORDER BY name LIMIT 100`,[projectId,pattern]);
 return result.rows.map((r)=>({entityType:r.entity_type,entityId:r.entity_id,name:r.name,subtitle:r.subtitle,href:`/admin/projects/${projectId}/${r.entity_type==='character'?'characters':r.entity_type==='god'?'gods':r.entity_type==='npc'?'npcs':r.entity_type==='location'?'locations':r.entity_type==='group'?'groups':'timeline'}/${r.entity_id}`}));}

export async function searchForPlayer(projectId:number,playerId:number,rawQuery:unknown):Promise<SearchResult[]>{const query=querySchema.parse(rawQuery);const pattern=`%${query}%`;const result=await pool.query<{entity_type:string;entity_id:number;name:string;subtitle:string|null}>(
`SELECT 'npc'::text entity_type,n.n_id::int entity_id,COALESCE(v.name_override,n.name),n.title::text
 FROM npcs n
 LEFT JOIN entity_visibility ev ON ev.project_id=n.camp_id AND ev.player_id=$2 AND ev.entity_type='npc' AND ev.entity_id=n.n_id
 LEFT JOIN player_entity_variants v ON v.project_id=n.camp_id AND v.player_id=$2 AND v.entity_type='npc' AND v.entity_id=n.n_id AND v.mode='override'
 WHERE n.camp_id=$1 AND n.archived_at IS NULL AND COALESCE(ev.visible,n.visibility_mode='all_players') AND COALESCE(v.name_override,n.name) ILIKE $3
 UNION ALL SELECT 'location',l.loc_id,l.name,l.location_type FROM locations l LEFT JOIN entity_visibility ev ON ev.project_id=l.camp_id AND ev.player_id=$2 AND ev.entity_type='location' AND ev.entity_id=l.loc_id WHERE l.camp_id=$1 AND l.archived_at IS NULL AND COALESCE(ev.visible,l.visibility_mode='all_players') AND l.name ILIKE $3
 UNION ALL SELECT 'group',g.gr_id,g.name,g.group_type FROM groups g LEFT JOIN entity_visibility ev ON ev.project_id=g.camp_id AND ev.player_id=$2 AND ev.entity_type='group' AND ev.entity_id=g.gr_id WHERE g.camp_id=$1 AND g.archived_at IS NULL AND COALESCE(ev.visible,g.visibility_mode='all_players') AND g.name ILIKE $3
 UNION ALL SELECT 'event',e.e_id,e.name,COALESCE(e.display_date,e.date::text) FROM events e LEFT JOIN entity_visibility ev ON ev.project_id=e.camp_id AND ev.player_id=$2 AND ev.entity_type='event' AND ev.entity_id=e.e_id WHERE e.camp_id=$1 AND e.archived_at IS NULL AND COALESCE(ev.visible,e.visibility_mode='all_players') AND e.name ILIKE $3
 ORDER BY name LIMIT 100`,[projectId,playerId,pattern]);
 return result.rows.map((r)=>({entityType:r.entity_type,entityId:r.entity_id,name:r.name,subtitle:r.subtitle,href:`/player/${r.entity_type==='npc'?'npcs':r.entity_type==='location'?'locations':r.entity_type==='group'?'groups':'timeline'}/${r.entity_id}`}));}
