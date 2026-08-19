import "server-only";

import { pool } from "@/lib/db";

export async function listVisibleGods(projectId:number,playerId:number){const r=await pool.query<{id:number;name:string;title:string;domain:string;faction:string;description:string|null;image:string}>(
`SELECT n.n_id AS id,COALESCE(v.name_override,n.name) AS name,g.title,g.domain,g.faction,COALESCE(v.description_override,n.public_description) AS description,COALESCE(v.image_override,n.image) AS image
 FROM gods g JOIN npcs n ON n.n_id=g.n_id
 LEFT JOIN entity_visibility ev ON ev.project_id=n.camp_id AND ev.player_id=$2 AND ev.entity_type='person' AND ev.entity_id=n.n_id
 LEFT JOIN player_entity_variants v ON v.project_id=n.camp_id AND v.player_id=$2 AND v.entity_type='person' AND v.entity_id=n.n_id AND v.mode='override'
 WHERE n.camp_id=$1 AND n.archived_at IS NULL AND COALESCE(ev.visible,n.visibility_mode='all_players') ORDER BY COALESCE(v.name_override,n.name)`,[projectId,playerId]);return r.rows;}

export async function listVisibleLocations(projectId:number,playerId:number){const r=await pool.query<{id:number;name:string;location_type:string|null;location_kind:string;description:string|null;parent_id:number|null;parent_name:string|null;population:string|null;map_id:string|null;map_feature_id:string|null}>(
`SELECT l.loc_id AS id,l.name,l.location_type,l.location_kind,l.description,l.parent_loc_id AS parent_id,p.name AS parent_name,l.population,
 CASE WHEN mf.feature_id IS NOT NULL
        AND (ml.visibility_mode='all_players' OR (ml.visibility_mode='selected_players' AND EXISTS(SELECT 1 FROM map_layer_visibility mlv WHERE mlv.layer_id=ml.layer_id AND mlv.player_id=$2 AND mlv.visible)))
        AND (mf.visibility_mode='all_players' OR (mf.visibility_mode='selected_players' AND EXISTS(SELECT 1 FROM map_feature_visibility mfv WHERE mfv.feature_id=mf.feature_id AND mfv.player_id=$2 AND mfv.visible)))
      THEN l.map_id ELSE NULL END AS map_id,
 CASE WHEN mf.feature_id IS NOT NULL
        AND (ml.visibility_mode='all_players' OR (ml.visibility_mode='selected_players' AND EXISTS(SELECT 1 FROM map_layer_visibility mlv WHERE mlv.layer_id=ml.layer_id AND mlv.player_id=$2 AND mlv.visible)))
        AND (mf.visibility_mode='all_players' OR (mf.visibility_mode='selected_players' AND EXISTS(SELECT 1 FROM map_feature_visibility mfv WHERE mfv.feature_id=mf.feature_id AND mfv.player_id=$2 AND mfv.visible)))
      THEN l.map_feature_id ELSE NULL END AS map_feature_id
 FROM locations l
 LEFT JOIN entity_visibility ev ON ev.project_id=l.camp_id AND ev.player_id=$2 AND ev.entity_type='location' AND ev.entity_id=l.loc_id
 LEFT JOIN locations p ON p.loc_id=l.parent_loc_id AND p.camp_id=l.camp_id
 LEFT JOIN entity_visibility pv ON pv.project_id=l.camp_id AND pv.player_id=$2 AND pv.entity_type='location' AND pv.entity_id=p.loc_id
 LEFT JOIN map_features mf ON mf.project_id=l.camp_id AND mf.map_id=l.map_id AND mf.feature_id=l.map_feature_id
 LEFT JOIN project_map_layers ml ON ml.project_id=mf.project_id AND ml.map_id=mf.map_id AND ml.layer_id=mf.layer_id
 WHERE l.camp_id=$1 AND l.archived_at IS NULL AND COALESCE(ev.visible,l.visibility_mode='all_players') AND (p.loc_id IS NULL OR COALESCE(pv.visible,p.visibility_mode='all_players')) ORDER BY l.name`,[projectId,playerId]);return r.rows;}

export async function listVisibleGroups(projectId:number,playerId:number){const r=await pool.query<{id:number;name:string;group_type:string|null;notes:string;motto:string;image:string;location_name:string|null;members:number;known_members:number}>(
`SELECT g.gr_id AS id,g.name,g.group_type,g.notes,g.motto,g.image,l.name AS location_name,g.members,
 (SELECT count(*)::int FROM group_memberships gm
   WHERE gm.project_id=g.camp_id AND gm.group_id=g.gr_id
     AND (gm.entity_type<>'person' OR EXISTS(
       SELECT 1 FROM npcs pn
       LEFT JOIN entity_visibility pev ON pev.project_id=pn.camp_id AND pev.player_id=$2 AND pev.entity_type='person' AND pev.entity_id=pn.n_id
       WHERE pn.camp_id=$1 AND pn.n_id=gm.entity_id AND pn.archived_at IS NULL AND COALESCE(pev.visible,pn.visibility_mode='all_players')
     ))) AS known_members
 FROM groups g
 LEFT JOIN entity_visibility ev ON ev.project_id=g.camp_id AND ev.player_id=$2 AND ev.entity_type='group' AND ev.entity_id=g.gr_id
 LEFT JOIN locations l ON l.loc_id=g.loc_id AND l.camp_id=g.camp_id
 LEFT JOIN entity_visibility lv ON lv.project_id=g.camp_id AND lv.player_id=$2 AND lv.entity_type='location' AND lv.entity_id=l.loc_id
 WHERE g.camp_id=$1 AND g.archived_at IS NULL AND COALESCE(ev.visible,g.visibility_mode='all_players') AND (l.loc_id IS NULL OR COALESCE(lv.visible,l.visibility_mode='all_players')) ORDER BY g.name`,[projectId,playerId]);return r.rows;}

export async function getMyCharacter(projectId:number,playerId:number){const r=await pool.query<{char_id:number;n_id:number;name:string;image:string;race:string;class:string;age:number;alive:boolean;public_description:string|null;location_name:string}>(
`SELECT c.char_id,n.n_id,n.name,n.image,c.race,c.class,c.age,c.alive,n.public_description,l.name AS location_name
 FROM chars a JOIN users u ON u.user_id=a.user_id AND u.camp_id=$1
 JOIN npcs n ON n.n_id=a.n_id AND n.camp_id=u.camp_id
 JOIN charakters c ON c.n_id=n.n_id JOIN locations l ON l.loc_id=c.loc_id AND l.camp_id=n.camp_id
 WHERE a.user_id=$2 AND n.archived_at IS NULL`,[projectId,playerId]);if((r.rowCount??0)>1)throw new Error("Player character uniqueness invariant violated.");return r.rows[0]??null;}

export async function listVisibleMaps(projectId:number){const r=await pool.query<{map_id:string;name:string;map_type:string;tile_url:string|null;image_path:string|null;min_zoom:number;max_zoom:number;center_lat:number|null;center_lng:number|null;bounds:unknown;config:Record<string,unknown>;is_primary:boolean}>("SELECT map_id,name,map_type,tile_url,image_path,min_zoom,max_zoom,center_lat,center_lng,bounds,config,is_primary FROM project_maps WHERE project_id=$1 ORDER BY is_primary DESC,map_id",[projectId]);return r.rows;}
