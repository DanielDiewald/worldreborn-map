import "server-only";

import { z } from "zod";
import { pool } from "@/lib/db";
import { clampPagination, paginatedResult, type Pagination } from "@/lib/pagination";

const npcInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  gender: z.string().trim().max(10).default("unknown"),
  image: z.string().trim().max(4000).optional(),
  publicDescription: z.string().max(100_000).optional(),
  adminNotes: z.string().max(100_000).optional(),
  title: z.string().trim().max(120).optional(),
  profession: z.string().trim().max(120).optional(),
  locationId: z.coerce.number().int().positive(),
  race: z.string().trim().max(80).default("unknown"),
  alive: z.coerce.boolean().default(true),
  follower: z.coerce.boolean().default(false),
  className: z.string().trim().max(50).default("unknown"),
});

export type NpcInput = z.input<typeof npcInputSchema>;
export type NpcListFilters = { query?: string; visibility?: "admin_only" | "all_players" | "selected_players" };

type NpcRow={
  nId:number;charId:number;campId:number;name:string;gender:string;image:string;imageMediaId:number|null;notes:string;publicDescription:string|null;adminNotes:string|null;title:string|null;species:string|null;profession:string|null;visibilityMode:string;locId:number;location:string;race:string;alive:boolean;birthday:string;follower:boolean;className:string;age:number;birthEra:"before"|"after"|null;birthYear:number|null;birthMonth:number|null;birthDay:number|null;birthPrecision:string|null;
};

function npcFilter(projectId:number,filters:NpcListFilters){
  const values:unknown[]=[projectId];
  const where=["n.camp_id=$1","n.archived_at IS NULL"];
  if(filters.query?.trim()){
    values.push(`%${filters.query.trim()}%`);
    const p=`$${values.length}`;
    where.push(`(n.name ILIKE ${p} OR n.title ILIKE ${p} OR n.species ILIKE ${p} OR n.profession ILIKE ${p} OR c.race ILIKE ${p} OR c.class ILIKE ${p})`);
  }
  if(filters.visibility){values.push(filters.visibility);where.push(`n.visibility_mode=$${values.length}`);}
  return {values,where};
}

async function assertLocation(projectId:number,locationId:number){
  const result=await pool.query("SELECT 1 FROM locations WHERE camp_id=$1 AND loc_id=$2 AND archived_at IS NULL",[projectId,locationId]);
  if(result.rowCount!==1)throw new Error("Location does not belong to this project.");
}

const npcSelect=`SELECT n.n_id AS "nId",c.char_id AS "charId",n.camp_id AS "campId",n.name,n.gender,n.image,n.image_media_id AS "imageMediaId",n.notes,n.public_description AS "publicDescription",n.admin_notes AS "adminNotes",n.title,n.species,n.profession,n.visibility_mode AS "visibilityMode",c.loc_id AS "locId",l.name AS location,c.race,c.alive,c.birthday::text,c.follower,c.class AS "className",c.age,
  fd.era AS "birthEra",fd.year AS "birthYear",fd.month AS "birthMonth",fd.day AS "birthDay",fd.precision AS "birthPrecision"
  FROM npcs n
  JOIN charakters c ON c.n_id=n.n_id
  JOIN locations l ON l.loc_id=c.loc_id AND l.camp_id=n.camp_id
  LEFT JOIN fantasy_dates fd ON fd.project_id=n.camp_id AND fd.entity_type='person' AND fd.entity_id=n.n_id AND fd.field_key='birth'`;

export async function listNpcs(projectId:number,filters:NpcListFilters={}){
  const {values,where}=npcFilter(projectId,filters);
  const result=await pool.query<NpcRow>(`${npcSelect} WHERE ${where.join(" AND ")} ORDER BY n.name,n.n_id`,values);
  return result.rows;
}

export async function listNpcsPaginated(projectId:number,filters:NpcListFilters,pagination:Pagination){
  const {values,where}=npcFilter(projectId,filters);
  const count=await pool.query<{total:number}>(`SELECT count(*)::int AS total FROM npcs n JOIN charakters c ON c.n_id=n.n_id WHERE ${where.join(" AND ")}`,values);
  const total=count.rows[0]?.total??0;
  const page=clampPagination(total,pagination);
  const pageValues=[...values,page.limit,page.offset];
  const rows=await pool.query<NpcRow>(`${npcSelect} WHERE ${where.join(" AND ")} ORDER BY n.name,n.n_id LIMIT $${pageValues.length-1} OFFSET $${pageValues.length}`,pageValues);
  return paginatedResult(rows.rows,total,page);
}

export async function getNpc(projectId:number,npcId:number){
  const result=await pool.query<NpcRow>(`${npcSelect} WHERE n.camp_id=$1 AND n.n_id=$2 AND n.archived_at IS NULL`,[projectId,npcId]);
  return result.rows[0]??null;
}

export async function createNpc(projectId:number,input:NpcInput){
  const data=npcInputSchema.parse(input);await assertLocation(projectId,data.locationId);
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const base=await client.query<{n_id:number}>(`INSERT INTO npcs(camp_id,name,notes,gender,image,public_description,admin_notes,title,species,profession,visibility_mode,metadata,updated_at)
      SELECT c.camp_id,$2,$3,$4,$5,$6,$7,$8,NULL,$9,'admin_only','{}'::jsonb,now()
        FROM campaigns c WHERE c.camp_id=$1 AND c.status<>'archived' RETURNING n_id`,[projectId,data.name,data.adminNotes?.trim()||"no notes yet",data.gender,data.image?.trim()||"noimage",data.publicDescription?.trim()||null,data.adminNotes?.trim()||null,data.title?.trim()||null,data.profession?.trim()||null]);
    if(base.rowCount!==1)throw new Error("Project not found or archived.");
    const personId=base.rows[0].n_id;
    // Legacy birthday/age remain present for compatibility, but are no longer authored by the UI.
    await client.query(`INSERT INTO charakters(n_id,loc_id,race,alive,birthday,follower,class,age) VALUES($1,$2,$3,$4,'2000-01-01',$5,$6,0)`,[personId,data.locationId,data.race,data.alive,data.follower,data.className]);
    await client.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,'admin','person.created','person',$2,$3::jsonb)`,[projectId,personId,JSON.stringify({kind:"character",race_source:"charakters.race",chronology:"fantasy_dates"})]);
    await client.query("COMMIT");
    return {nId:personId};
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}

export async function updateNpc(projectId:number,npcId:number,input:NpcInput){
  const data=npcInputSchema.parse(input);await assertLocation(projectId,data.locationId);
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const locked=await client.query("SELECT 1 FROM npcs n JOIN charakters c ON c.n_id=n.n_id WHERE n.camp_id=$1 AND n.n_id=$2 AND n.archived_at IS NULL FOR UPDATE",[projectId,npcId]);
    if(locked.rowCount!==1){await client.query("ROLLBACK");return null;}
    // species is deliberately not updated: charakters.race is the canonical visible Character species/race field.
    await client.query(`UPDATE npcs SET name=$3,notes=$4,gender=$5,image=$6,public_description=$7,admin_notes=$8,title=$9,profession=$10,updated_at=now() WHERE camp_id=$1 AND n_id=$2`,[projectId,npcId,data.name,data.adminNotes?.trim()||"no notes yet",data.gender,data.image?.trim()||"noimage",data.publicDescription?.trim()||null,data.adminNotes?.trim()||null,data.title?.trim()||null,data.profession?.trim()||null]);
    // Legacy age/birthday stay untouched until the explicit calendar migration has reconciled them.
    await client.query(`UPDATE charakters SET loc_id=$2,race=$3,alive=$4,follower=$5,class=$6 WHERE n_id=$1`,[npcId,data.locationId,data.race,data.alive,data.follower,data.className]);
    await client.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,'admin','person.updated','person',$2,$3::jsonb)`,[projectId,npcId,JSON.stringify({race_source:"charakters.race",legacy_age_preserved:true,legacy_birthday_preserved:true})]);
    await client.query("COMMIT");return {nId:npcId};
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}

export async function archiveNpc(projectId:number,npcId:number){
  const result=await pool.query(`UPDATE npcs n SET archived_at=now(),updated_at=now() WHERE n.camp_id=$1 AND n.n_id=$2 AND n.archived_at IS NULL AND EXISTS(SELECT 1 FROM charakters c WHERE c.n_id=n.n_id) RETURNING n.n_id`,[projectId,npcId]);
  if(result.rowCount===1)await pool.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id) VALUES($1,'admin','person.archived','person',$2)`,[projectId,npcId]);
  return result.rowCount===1?{id:npcId}:null;
}
