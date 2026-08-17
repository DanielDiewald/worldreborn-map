import "server-only";

import path from "node:path";
import { z } from "zod";
import { pool } from "@/lib/db";
import { validateImageBuffer } from "@/lib/image-validation";
import { localStorage } from "@/lib/storage";

const metadataSchema=z.object({entityType:z.string().trim().max(40).nullable().optional(),entityId:z.coerce.number().int().positive().nullable().optional(),title:z.string().trim().max(300).optional(),altText:z.string().trim().max(1000).optional()}).superRefine((v,ctx)=>{if((v.entityType==null)!=(v.entityId==null))ctx.addIssue({code:"custom",message:"Entity type and ID must be set together."});});

export async function listMedia(projectId:number){const r=await pool.query<{media_id:string;entity_type:string|null;entity_id:string|null;original_filename:string|null;stored_filename:string|null;mime_type:string|null;size_bytes:string|null;title:string|null;alt_text:string|null;created_at:Date;metadata:Record<string,unknown>}>("SELECT media_id,entity_type,entity_id,original_filename,stored_filename,mime_type,size_bytes,title,alt_text,created_at,metadata FROM media WHERE project_id=$1 ORDER BY created_at DESC,media_id DESC",[projectId]);return r.rows;}

export async function saveMediaUpload(projectId:number,file:File,input:unknown){const meta=metadataSchema.parse(input);const buffer=Buffer.from(await file.arrayBuffer());const image=validateImageBuffer(buffer);const originalFilename=path.basename(file.name||"upload").slice(0,500);const project=await pool.query("SELECT 1 FROM campaigns WHERE camp_id=$1 AND status<>'archived'",[projectId]);if(project.rowCount!==1)throw new Error("Project not found or archived.");const saved=await localStorage.save(buffer,image.extension);try{const r=await pool.query<{media_id:string}>(
`INSERT INTO media(project_id,entity_type,entity_id,original_filename,stored_filename,storage_path,mime_type,size_bytes,title,alt_text,metadata)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) RETURNING media_id`,[projectId,meta.entityType??null,meta.entityId??null,originalFilename,saved.storedFilename,saved.storagePath,image.mimeType,buffer.length,meta.title||null,meta.altText||null,JSON.stringify({width:image.width,height:image.height})]);const mediaId=Number(r.rows[0].media_id);await pool.query("INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,'admin','media.uploaded','media',$2,$3::jsonb)",[projectId,mediaId,JSON.stringify({mime_type:image.mimeType,size_bytes:buffer.length})]);return mediaId;}catch(error){await localStorage.delete(saved.storagePath);throw error;}}

export async function getMediaRecord(mediaId:number){const r=await pool.query<{media_id:string;project_id:number;entity_type:string|null;entity_id:string|null;storage_path:string|null;external_url:string|null;mime_type:string|null;original_filename:string|null}>("SELECT media_id,project_id,entity_type,entity_id,storage_path,external_url,mime_type,original_filename FROM media WHERE media_id=$1",[mediaId]);return r.rows[0]??null;}

export async function canPlayerReadMedia(mediaId:number,projectId:number,playerId:number){const r=await pool.query(
`SELECT 1 FROM media m JOIN users u ON u.user_id=$3 AND u.camp_id=$2 AND u.active=true
 LEFT JOIN entity_visibility mv ON mv.project_id=m.project_id AND mv.player_id=$3 AND mv.entity_type='media' AND mv.entity_id=m.media_id
 WHERE m.media_id=$1 AND m.project_id=$2 AND COALESCE(mv.visible,false)=true`,[mediaId,projectId,playerId]);return r.rowCount===1;}

export async function readStoredMedia(storagePath:string){return localStorage.read(storagePath);}

export async function deleteMedia(projectId:number,mediaId:number){const r=await pool.query<{storage_path:string|null}>("DELETE FROM media WHERE project_id=$1 AND media_id=$2 RETURNING storage_path",[projectId,mediaId]);if(r.rowCount!==1)throw new Error("Media not found in this project.");if(r.rows[0].storage_path)await localStorage.delete(r.rows[0].storage_path);}
