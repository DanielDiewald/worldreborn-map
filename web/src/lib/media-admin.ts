import "server-only";

import { z } from "zod";
import { pool } from "@/lib/db";
import { deleteMedia } from "@/lib/media";

const metadataSchema=z.object({title:z.string().trim().max(300).optional(),altText:z.string().trim().max(1000).optional()});
export async function updateMediaMetadata(projectId:number,mediaId:number,input:unknown){const d=metadataSchema.parse(input);const result=await pool.query("UPDATE media SET title=$3,alt_text=$4 WHERE project_id=$1 AND media_id=$2",[projectId,mediaId,d.title||null,d.altText||null]);if(result.rowCount!==1)throw new Error("Medium nicht gefunden.");await pool.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,'admin','media.updated','media',$2,$3::jsonb)`,[projectId,mediaId,JSON.stringify({title:d.title||null})]);}
export async function deleteMediaSafely(projectId:number,mediaId:number){const used=await pool.query<{used:boolean}>(`SELECT EXISTS(SELECT 1 FROM npcs WHERE camp_id=$1 AND image_media_id=$2) OR EXISTS(SELECT 1 FROM groups WHERE camp_id=$1 AND image_media_id=$2) OR EXISTS(SELECT 1 FROM locations WHERE camp_id=$1 AND image_media_id=$2) OR EXISTS(SELECT 1 FROM events WHERE camp_id=$1 AND image_media_id=$2) OR EXISTS(SELECT 1 FROM campaigns WHERE camp_id=$1 AND (image_media_id=$2 OR logo_media_id=$2)) AS used`,[projectId,mediaId]);if(used.rows[0]?.used)throw new Error("Dieses Bild wird noch von einer Entity verwendet. Ersetze oder entferne dort zuerst das Bild.");await deleteMedia(projectId,mediaId);}
