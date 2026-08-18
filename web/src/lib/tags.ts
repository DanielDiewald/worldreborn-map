import "server-only";

import { z } from "zod";
import { pool } from "@/lib/db";
import { assertEntityBelongsToProject } from "@/lib/entity-project";

const tagName = z.string().trim().min(1).max(80).transform((value) => value.toLowerCase());
const entityType = z.string().trim().min(1).max(40);

export async function listTags(projectId:number){const result=await pool.query<{tag_id:string;name:string;usage_count:number}>(
`SELECT t.tag_id,t.name,count(et.entity_tag_id)::int AS usage_count
   FROM tags t LEFT JOIN entity_tags et ON et.tag_id=t.tag_id AND et.project_id=t.project_id
  WHERE t.project_id=$1 GROUP BY t.tag_id,t.name ORDER BY t.name`,[projectId]);return result.rows;}

export async function createTag(projectId:number,name:unknown){const normalized=tagName.parse(name);const result=await pool.query<{tag_id:string}>(
`INSERT INTO tags(project_id,name) SELECT c.camp_id,$2 FROM campaigns c WHERE c.camp_id=$1 AND c.status<>'archived'
 ON CONFLICT(project_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING tag_id`,[projectId,normalized]);if(result.rowCount!==1)throw new Error("Project not found or archived.");return Number(result.rows[0].tag_id);}

export async function tagEntity(args:{projectId:number;tagId:number;entityType:string;entityId:number}){entityType.parse(args.entityType);const ref=await assertEntityBelongsToProject(args.projectId,args.entityType,args.entityId);const result=await pool.query(
`INSERT INTO entity_tags(project_id,tag_id,entity_type,entity_id)
 SELECT $1,t.tag_id,$3,$4 FROM tags t WHERE t.project_id=$1 AND t.tag_id=$2
 ON CONFLICT(project_id,tag_id,entity_type,entity_id) DO NOTHING`,[args.projectId,args.tagId,ref.type,ref.id]);if(result.rowCount===0){const tag=await pool.query("SELECT 1 FROM tags WHERE project_id=$1 AND tag_id=$2",[args.projectId,args.tagId]);if(tag.rowCount!==1)throw new Error("Tag does not belong to this project.");}}

export async function untagEntity(args:{projectId:number;tagId:number;entityType:string;entityId:number}){const ref=await assertEntityBelongsToProject(args.projectId,args.entityType,args.entityId);await pool.query(
`DELETE FROM entity_tags WHERE project_id=$1 AND tag_id=$2 AND entity_type=$3 AND entity_id=$4`,[args.projectId,args.tagId,ref.type,ref.id]);}

export async function listEntityTags(args:{projectId:number;entityType:string;entityId:number}){const ref=await assertEntityBelongsToProject(args.projectId,args.entityType,args.entityId);const result=await pool.query<{tag_id:string;name:string}>(
`SELECT t.tag_id,t.name FROM entity_tags et JOIN tags t ON t.tag_id=et.tag_id AND t.project_id=et.project_id
 WHERE et.project_id=$1 AND et.entity_type=$2 AND et.entity_id=$3 ORDER BY t.name`,[args.projectId,ref.type,ref.id]);return result.rows;}

export async function deleteTag(projectId:number,tagId:number){await pool.query("DELETE FROM tags WHERE project_id=$1 AND tag_id=$2",[projectId,tagId]);}
