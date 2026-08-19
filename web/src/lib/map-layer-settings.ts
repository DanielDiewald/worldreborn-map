import "server-only";

import { z } from "zod";
import { pool } from "@/lib/db";

const schema=z.object({visibleByDefault:z.boolean().optional(),opacity:z.number().min(0).max(1).optional(),zIndex:z.number().int().min(-100000).max(100000).optional(),name:z.string().trim().min(1).max(120).optional(),locked:z.boolean().optional(),style:z.record(z.string(),z.unknown()).optional()});
export async function updateMapLayerSettings(projectId:number,mapId:number,layerId:number,input:unknown){const data=schema.parse(input);const result=await pool.query(`UPDATE project_map_layers SET visible_by_default=COALESCE($4,visible_by_default),opacity=COALESCE($5,opacity),z_index=COALESCE($6,z_index),name=COALESCE($7,name),locked=COALESCE($8,locked),style=COALESCE($9::jsonb,style),updated_at=now() WHERE project_id=$1 AND map_id=$2 AND layer_id=$3`,[projectId,mapId,layerId,data.visibleByDefault??null,data.opacity??null,data.zIndex??null,data.name??null,data.locked??null,data.style?JSON.stringify(data.style):null]);if(result.rowCount!==1)throw new Error("Layer not found in this map.");}
