import "server-only";

import { pool } from "@/lib/db";

export async function canPlayerReadMapLayerMedia(mediaId:number,projectId:number,playerId:number){const result=await pool.query(`SELECT 1 FROM project_map_layers l WHERE l.project_id=$1 AND l.media_id=$2 AND (l.visibility_mode='all_players' OR (l.visibility_mode='selected_players' AND EXISTS(SELECT 1 FROM map_layer_visibility v WHERE v.layer_id=l.layer_id AND v.player_id=$3 AND v.visible))) LIMIT 1`,[projectId,mediaId,playerId]);return result.rowCount===1;}
