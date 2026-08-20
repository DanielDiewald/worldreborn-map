import "server-only";

import { z } from "zod";
import { pool } from "@/lib/db";
import { clampPagination, paginatedResult, type Pagination } from "@/lib/pagination";

const visibility=z.enum(["admin_only","all_players","selected_players"]);
const godSchema=z.object({name:z.string().trim().min(1).max(100),gender:z.enum(["unknown","male","female","hermaphrodite"]),image:z.string().trim().max(4000).optional(),publicDescription:z.string().max(100000).optional(),adminNotes:z.string().max(100000).optional(),species:z.string().trim().max(80).optional(),profession:z.string().trim().max(120).optional(),personTitle:z.string().trim().max(120).optional(),godTitle:z.string().trim().max(30).optional(),faction:z.string().trim().max(30).optional(),domain:z.string().trim().max(30).optional(),visibilityMode:visibility.default("admin_only")});

export type GodListFilters={query?:string;visibility?:"admin_only"|"all_players"|"selected_players"};
type GodListRow={god_id:number;person_id:number;npc_id:number;name:string;image:string;title:string;domain:string;faction:string;person_title:string|null;species:string|null;profession:string|null;public_description:string|null;visibility_mode:string};

function godFilter(projectId:number,filters:GodListFilters={}){
  const values:unknown[]=[projectId];
  const where=["n.camp_id=$1","n.archived_at IS NULL"];
  if(filters.query?.trim()){
    values.push(`%${filters.query.trim()}%`);const p=`$${values.length}`;
    where.push(`(n.name ILIKE ${p} OR n.title ILIKE ${p} OR n.species ILIKE ${p} OR n.profession ILIKE ${p} OR g.title ILIKE ${p} OR g.domain ILIKE ${p} OR g.faction ILIKE ${p})`);
  }
  if(filters.visibility){values.push(filters.visibility);where.push(`n.visibility_mode=$${values.length}`);}
  return {values,where};
}

const godSelect=`SELECT g.g_id AS god_id,n.n_id AS person_id,n.n_id AS npc_id,n.name,n.image,g.title,g.domain,g.faction,n.title AS person_title,n.species,n.profession,n.public_description,n.visibility_mode FROM gods g JOIN npcs n ON n.n_id=g.n_id`;

export async function listGods(projectId:number){const r=await pool.query<GodListRow>(`${godSelect} WHERE n.camp_id=$1 AND n.archived_at IS NULL ORDER BY n.name,n.n_id`,[projectId]);return r.rows;}

export async function listGodsPaginated(projectId:number,filters:GodListFilters,pagination:Pagination){
  const {values,where}=godFilter(projectId,filters);
  const count=await pool.query<{total:number}>(`SELECT count(*)::int AS total FROM gods g JOIN npcs n ON n.n_id=g.n_id WHERE ${where.join(" AND ")}`,values);
  const total=count.rows[0]?.total??0;const page=clampPagination(total,pagination);const pageValues=[...values,page.limit,page.offset];
  const rows=await pool.query<GodListRow>(`${godSelect} WHERE ${where.join(" AND ")} ORDER BY n.name,n.n_id LIMIT $${pageValues.length-1} OFFSET $${pageValues.length}`,pageValues);
  return paginatedResult(rows.rows,total,page);
}

export async function getGod(projectId:number,personId:number){const r=await pool.query(
`SELECT g.g_id AS god_id,n.n_id AS person_id,n.n_id AS npc_id,n.name,n.gender,n.image,n.notes,n.public_description,n.admin_notes,n.title AS person_title,n.species,n.profession,n.visibility_mode,g.title AS god_title,g.faction,g.domain
 FROM gods g JOIN npcs n ON n.n_id=g.n_id WHERE n.camp_id=$1 AND n.n_id=$2 AND n.archived_at IS NULL`,[projectId,personId]);return r.rows[0]??null;}

export async function createGod(projectId:number,input:unknown){const d=godSchema.parse(input);const client=await pool.connect();try{await client.query("BEGIN");const n=await client.query<{n_id:number}>(
`INSERT INTO npcs(camp_id,name,notes,gender,image,public_description,admin_notes,title,species,profession,visibility_mode,metadata,updated_at)
 SELECT c.camp_id,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'{}'::jsonb,now() FROM campaigns c WHERE c.camp_id=$1 AND c.status<>'archived' RETURNING n_id`,[projectId,d.name,d.adminNotes||"no notes yet",d.gender,d.image||"noimage",d.publicDescription||null,d.adminNotes||null,d.personTitle||null,d.species||null,d.profession||null,d.visibilityMode]);if(n.rowCount!==1)throw new Error("Project not found or archived.");const personId=n.rows[0].n_id;const g=await client.query<{g_id:number}>("INSERT INTO gods(n_id,faction,title,domain) VALUES($1,$2,$3,$4) RETURNING g_id",[personId,d.faction||"unknown",d.godTitle||"unknown",d.domain||"unknown"]);await client.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,'admin','god.created','person',$2,$3::jsonb)`,[projectId,personId,JSON.stringify({god_row_id:g.rows[0].g_id})]);await client.query("COMMIT");return personId;}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}}

export async function updateGod(projectId:number,personId:number,input:unknown){const d=godSchema.parse(input);const client=await pool.connect();try{await client.query("BEGIN");const row=await client.query<{g_id:number}>("SELECT g.g_id FROM gods g JOIN npcs n ON n.n_id=g.n_id WHERE n.camp_id=$1 AND n.n_id=$2 AND n.archived_at IS NULL FOR UPDATE",[projectId,personId]);if(row.rowCount!==1)throw new Error("God not found in this project.");const godRowId=row.rows[0].g_id;await client.query(`UPDATE npcs SET name=$3,notes=$4,gender=$5,image=$6,public_description=$7,admin_notes=$8,title=$9,species=$10,profession=$11,visibility_mode=$12,updated_at=now() WHERE camp_id=$1 AND n_id=$2`,[projectId,personId,d.name,d.adminNotes||"no notes yet",d.gender,d.image||"noimage",d.publicDescription||null,d.adminNotes||null,d.personTitle||null,d.species||null,d.profession||null,d.visibilityMode]);await client.query("UPDATE gods SET faction=$2,title=$3,domain=$4 WHERE n_id=$1",[personId,d.faction||"unknown",d.godTitle||"unknown",d.domain||"unknown"]);await client.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,'admin','person.updated','person',$2,$3::jsonb)`,[projectId,personId,JSON.stringify({god_row_id:godRowId})]);await client.query("COMMIT");}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}}

export async function archiveGod(projectId:number,personId:number){const r=await pool.query("UPDATE npcs n SET archived_at=now(),updated_at=now() WHERE n.camp_id=$1 AND n.n_id=$2 AND n.archived_at IS NULL AND EXISTS(SELECT 1 FROM gods g WHERE g.n_id=n.n_id)",[projectId,personId]);if(r.rowCount!==1)throw new Error("God not found in this project.");await pool.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id) VALUES($1,'admin','person.archived','person',$2)`,[projectId,personId]);}
