import "server-only";

import { pool } from "@/lib/db";

export type PlayerNpc={id:string;name:string;description:string|null;image:string|null;title:string|null;locationName:string|null;mapId:string|null;mapFeatureId:string|null};

export async function getPlayerContext(projectId:number,playerId:number){const result=await pool.query<{player_name:string;project_name:string}>(`SELECT COALESCE(u.display_name,u.name) AS player_name,c.name AS project_name FROM users u JOIN campaigns c ON c.camp_id=u.camp_id WHERE u.user_id=$2 AND u.camp_id=$1 AND u.active=true AND c.status<>'archived'`,[projectId,playerId]);return result.rows[0]??null;}

export async function listVisibleNpcsForPlayer(projectId:number,playerId:number):Promise<PlayerNpc[]>{const result=await pool.query<{id:string;name:string;description:string|null;image:string|null;title:string|null;locationName:string|null;mapId:string|null;mapFeatureId:string|null}>(
`WITH visible_people AS (
 SELECT n.n_id,COALESCE(v.name_override,n.name) AS name,COALESCE(v.description_override,n.public_description) AS description,COALESCE(v.image_override,n.image) AS image,n.title,
        CASE WHEN l.loc_id IS NOT NULL AND COALESCE(lev.visible,l.visibility_mode='all_players') THEN l.name ELSE NULL END AS location_name,
        CASE WHEN l.loc_id IS NOT NULL AND COALESCE(lev.visible,l.visibility_mode='all_players') AND mf.feature_id IS NOT NULL
                  AND (ml.visibility_mode='all_players' OR (ml.visibility_mode='selected_players' AND EXISTS(SELECT 1 FROM map_layer_visibility mlv WHERE mlv.layer_id=ml.layer_id AND mlv.player_id=$2 AND mlv.visible)))
                  AND (mf.visibility_mode='all_players' OR (mf.visibility_mode='selected_players' AND EXISTS(SELECT 1 FROM map_feature_visibility mfv WHERE mfv.feature_id=mf.feature_id AND mfv.player_id=$2 AND mfv.visible)))
             THEN l.map_id ELSE NULL END AS map_id,
        CASE WHEN l.loc_id IS NOT NULL AND COALESCE(lev.visible,l.visibility_mode='all_players') AND mf.feature_id IS NOT NULL
                  AND (ml.visibility_mode='all_players' OR (ml.visibility_mode='selected_players' AND EXISTS(SELECT 1 FROM map_layer_visibility mlv WHERE mlv.layer_id=ml.layer_id AND mlv.player_id=$2 AND mlv.visible)))
                  AND (mf.visibility_mode='all_players' OR (mf.visibility_mode='selected_players' AND EXISTS(SELECT 1 FROM map_feature_visibility mfv WHERE mfv.feature_id=mf.feature_id AND mfv.player_id=$2 AND mfv.visible)))
             THEN l.map_feature_id ELSE NULL END AS map_feature_id
 FROM npcs n
 JOIN charakters c ON c.n_id=n.n_id
 LEFT JOIN entity_visibility ev ON ev.project_id=n.camp_id AND ev.player_id=$2 AND ev.entity_type='person' AND ev.entity_id=n.n_id
 LEFT JOIN player_entity_variants v ON v.project_id=n.camp_id AND v.player_id=$2 AND v.entity_type='person' AND v.entity_id=n.n_id AND v.mode='override'
 LEFT JOIN locations l ON l.camp_id=n.camp_id AND l.loc_id=c.loc_id AND l.archived_at IS NULL
 LEFT JOIN entity_visibility lev ON lev.project_id=l.camp_id AND lev.player_id=$2 AND lev.entity_type='location' AND lev.entity_id=l.loc_id
 LEFT JOIN map_features mf ON mf.project_id=l.camp_id AND mf.map_id=l.map_id AND mf.feature_id=l.map_feature_id
 LEFT JOIN project_map_layers ml ON ml.project_id=mf.project_id AND ml.map_id=mf.map_id AND ml.layer_id=mf.layer_id
 WHERE n.camp_id=$1 AND n.archived_at IS NULL AND COALESCE(ev.visible,n.visibility_mode='all_players')
),decoys AS (
 SELECT v.variant_id,COALESCE(NULLIF(v.name_override,''),'Unbekannt') AS name,v.description_override AS description,v.image_override AS image,NULL::varchar AS title,NULL::varchar AS location_name,NULL::bigint AS map_id,NULL::bigint AS map_feature_id
 FROM player_entity_variants v WHERE v.project_id=$1 AND v.player_id=$2 AND v.entity_type='person' AND v.mode='standalone_decoy'
)
SELECT n_id::text AS id,name,description,image,title,location_name AS "locationName",map_id::text AS "mapId",map_feature_id::text AS "mapFeatureId" FROM visible_people
UNION ALL SELECT ('decoy:'||variant_id::text),name,description,image,title,location_name,map_id::text,map_feature_id::text FROM decoys ORDER BY name`,[projectId,playerId]);return result.rows;}

export async function getPlayerHomeStats(projectId:number,playerId:number){const result=await pool.query<{npcs:number;locations:number;groups:number;events:number}>(`SELECT
 (SELECT count(*)::int FROM npcs n JOIN charakters c ON c.n_id=n.n_id LEFT JOIN entity_visibility ev ON ev.project_id=n.camp_id AND ev.player_id=$2 AND ev.entity_type='person' AND ev.entity_id=n.n_id WHERE n.camp_id=$1 AND n.archived_at IS NULL AND COALESCE(ev.visible,n.visibility_mode='all_players')) AS npcs,
 (SELECT count(*)::int FROM locations l LEFT JOIN entity_visibility ev ON ev.project_id=l.camp_id AND ev.player_id=$2 AND ev.entity_type='location' AND ev.entity_id=l.loc_id WHERE l.camp_id=$1 AND l.archived_at IS NULL AND COALESCE(ev.visible,l.visibility_mode='all_players')) AS locations,
 (SELECT count(*)::int FROM groups g LEFT JOIN entity_visibility ev ON ev.project_id=g.camp_id AND ev.player_id=$2 AND ev.entity_type='group' AND ev.entity_id=g.gr_id WHERE g.camp_id=$1 AND g.archived_at IS NULL AND COALESCE(ev.visible,g.visibility_mode='all_players')) AS groups,
 (SELECT count(*)::int FROM events e LEFT JOIN entity_visibility ev ON ev.project_id=e.camp_id AND ev.player_id=$2 AND ev.entity_type='event' AND ev.entity_id=e.e_id WHERE e.camp_id=$1 AND e.archived_at IS NULL AND COALESCE(ev.visible,e.visibility_mode='all_players')) AS events`,[projectId,playerId]);return result.rows[0]??{npcs:0,locations:0,groups:0,events:0};}
