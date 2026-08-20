import "server-only";

import { z } from "zod";
import { pool } from "@/lib/db";
import { clampPagination, paginatedResult, type Pagination } from "@/lib/pagination";
import type { PersonGender } from "@/lib/person-gender";

const npcInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  gender: z.enum(["unknown", "male", "female", "hermaphrodite"]),
  image: z.string().trim().max(4000).optional(),
  publicDescription: z.string().max(100_000).optional(),
  adminNotes: z.string().max(100_000).optional(),
  title: z.string().trim().max(120).optional(),
  profession: z.string().trim().max(120).optional(),
  locationId: z.coerce.number().int().positive(),
  raceId: z.coerce.number().int().positive(),
  alive: z.coerce.boolean().default(true),
  follower: z.coerce.boolean().default(false),
  className: z.string().trim().max(50).default("unknown"),
});

export type NpcInput = z.input<typeof npcInputSchema>;
export type NpcListFilters = {
  query?: string;
  visibility?: "admin_only" | "all_players" | "selected_players";
  alive?: boolean;
  follower?: boolean;
  gender?: PersonGender;
  locationId?: number;
  raceId?: number;
  className?: string;
};

export type NpcFilterOptions = {
  races: Array<{ id: number; name: string; parentName: string | null; isUnknown: boolean }>;
  classes: string[];
};

type NpcRow={
  nId:number;charId:number;campId:number;name:string;gender:string;image:string;imageMediaId:number|null;notes:string;publicDescription:string|null;adminNotes:string|null;title:string|null;species:string|null;profession:string|null;visibilityMode:string;locId:number;location:string;raceId:number|null;race:string;raceBaseName:string;raceParentName:string|null;alive:boolean;birthday:string;follower:boolean;className:string;age:number;birthEra:"before"|"after"|null;birthYear:number|null;birthMonth:number|null;birthDay:number|null;birthPrecision:string|null;deathEra:"before"|"after"|null;deathYear:number|null;deathMonth:number|null;deathDay:number|null;deathPrecision:string|null;deathCauseCode:string|null;deathCauseDetail:string|null;
};

const characterJoin=`FROM npcs n
  JOIN charakters c ON c.n_id=n.n_id
  LEFT JOIN races r ON r.race_id=c.race_id AND r.project_id=n.camp_id
  LEFT JOIN races rp ON rp.race_id=r.parent_race_id AND rp.project_id=n.camp_id AND rp.archived_at IS NULL`;

function npcFilter(projectId:number,filters:NpcListFilters){
  const values:unknown[]=[projectId];
  const where=["n.camp_id=$1","n.archived_at IS NULL"];
  if(filters.query?.trim()){
    values.push(`%${filters.query.trim()}%`);
    const p=`$${values.length}`;
    where.push(`(n.name ILIKE ${p} OR COALESCE(n.title,'') ILIKE ${p} OR COALESCE(n.species,'') ILIKE ${p} OR COALESCE(n.profession,'') ILIKE ${p} OR COALESCE(c.race,'') ILIKE ${p} OR COALESCE(r.name,'') ILIKE ${p} OR COALESCE(rp.name,'') ILIKE ${p} OR COALESCE(r.masculine_name,'') ILIKE ${p} OR COALESCE(r.feminine_name,'') ILIKE ${p} OR COALESCE(r.hermaphrodite_name,'') ILIKE ${p} OR COALESCE(c.class,'') ILIKE ${p})`);
  }
  if(filters.visibility){values.push(filters.visibility);where.push(`n.visibility_mode=$${values.length}`);}
  if(typeof filters.alive==="boolean"){values.push(filters.alive);where.push(`c.alive=$${values.length}`);}
  if(typeof filters.follower==="boolean"){values.push(filters.follower);where.push(`c.follower=$${values.length}`);}
  if(filters.gender){values.push(filters.gender);where.push(`n.gender=$${values.length}`);}
  if(Number.isSafeInteger(filters.locationId)&&Number(filters.locationId)>0){values.push(filters.locationId);where.push(`c.loc_id=$${values.length}`);}
  if(Number.isSafeInteger(filters.raceId)&&Number(filters.raceId)>0){values.push(filters.raceId);where.push(`c.race_id=$${values.length}`);}
  if(filters.className?.trim()){values.push(filters.className.trim());where.push(`LOWER(COALESCE(c.class,''))=LOWER($${values.length})`);}
  return {values,where};
}

async function assertLocation(projectId:number,locationId:number){
  const result=await pool.query("SELECT 1 FROM locations WHERE camp_id=$1 AND loc_id=$2 AND archived_at IS NULL",[projectId,locationId]);
  if(result.rowCount!==1)throw new Error("Location does not belong to this project.");
}

async function canonicalRace(projectId:number,raceId:number){
  const result=await pool.query<{name:string}>("SELECT name FROM races WHERE project_id=$1 AND race_id=$2 AND archived_at IS NULL",[projectId,raceId]);
  if(result.rowCount!==1)throw new Error("Die gewählte Spezies oder Subspezies gehört nicht zu dieser Welt oder ist archiviert.");
  return result.rows[0].name;
}

const npcSelect=`SELECT n.n_id AS "nId",c.char_id AS "charId",n.camp_id AS "campId",n.name,n.gender,n.image,n.image_media_id AS "imageMediaId",n.notes,n.public_description AS "publicDescription",n.admin_notes AS "adminNotes",n.title,n.species,n.profession,n.visibility_mode AS "visibilityMode",c.loc_id AS "locId",l.name AS location,c.race_id::int AS "raceId",
  COALESCE(CASE n.gender WHEN 'male' THEN NULLIF(r.masculine_name,'') WHEN 'female' THEN NULLIF(r.feminine_name,'') WHEN 'hermaphrodite' THEN NULLIF(r.hermaphrodite_name,'') ELSE NULL END,NULLIF(r.name,''),NULLIF(c.race,''),'Unbekannt') AS race,
  COALESCE(NULLIF(r.name,''),NULLIF(c.race,''),'Unbekannt') AS "raceBaseName",rp.name AS "raceParentName",c.alive,c.birthday::text,c.follower,c.class AS "className",c.age,
  birth_fd.era AS "birthEra",birth_fd.year AS "birthYear",birth_fd.month AS "birthMonth",birth_fd.day AS "birthDay",birth_fd.precision AS "birthPrecision",
  death_fd.era AS "deathEra",death_fd.year AS "deathYear",death_fd.month AS "deathMonth",death_fd.day AS "deathDay",death_fd.precision AS "deathPrecision",
  n.metadata->>'death_cause_code' AS "deathCauseCode",n.metadata->>'death_cause_detail' AS "deathCauseDetail"
  ${characterJoin}
  JOIN locations l ON l.loc_id=c.loc_id AND l.camp_id=n.camp_id
  LEFT JOIN fantasy_dates birth_fd ON birth_fd.project_id=n.camp_id AND birth_fd.entity_type='person' AND birth_fd.entity_id=n.n_id AND birth_fd.field_key='birth'
  LEFT JOIN fantasy_dates death_fd ON death_fd.project_id=n.camp_id AND death_fd.entity_type='person' AND death_fd.entity_id=n.n_id AND death_fd.field_key='death'`;

export async function listNpcFilterOptions(projectId:number):Promise<NpcFilterOptions>{
  const [races,classes]=await Promise.all([
    pool.query<{id:number;name:string;parentName:string|null;isUnknown:boolean}>(`SELECT r.race_id::int AS id,r.name,p.name AS "parentName",r.is_unknown AS "isUnknown" FROM races r LEFT JOIN races p ON p.project_id=r.project_id AND p.race_id=r.parent_race_id AND p.archived_at IS NULL WHERE r.project_id=$1 AND r.archived_at IS NULL ORDER BY r.is_unknown DESC,COALESCE(p.name,r.name),CASE WHEN r.parent_race_id IS NULL THEN 0 ELSE 1 END,r.name,r.race_id LIMIT 500`,[projectId]),
    pool.query<{value:string}>(`SELECT DISTINCT BTRIM(c.class) AS value FROM npcs n JOIN charakters c ON c.n_id=n.n_id WHERE n.camp_id=$1 AND n.archived_at IS NULL AND NULLIF(BTRIM(c.class),'') IS NOT NULL ORDER BY value LIMIT 200`,[projectId]),
  ]);
  return {races:races.rows,classes:classes.rows.map((row)=>row.value)};
}

export async function listNpcs(projectId:number,filters:NpcListFilters={}){
  const {values,where}=npcFilter(projectId,filters);
  const result=await pool.query<NpcRow>(`${npcSelect} WHERE ${where.join(" AND ")} ORDER BY n.name,n.n_id`,values);
  return result.rows;
}

export async function listNpcsPaginated(projectId:number,filters:NpcListFilters,pagination:Pagination){
  const {values,where}=npcFilter(projectId,filters);
  const count=await pool.query<{total:number}>(`SELECT count(*)::int AS total ${characterJoin} WHERE ${where.join(" AND ")}`,values);
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
  const data=npcInputSchema.parse(input);const [raceName]=await Promise.all([canonicalRace(projectId,data.raceId),assertLocation(projectId,data.locationId)]);
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const base=await client.query<{n_id:number}>(`INSERT INTO npcs(camp_id,name,notes,gender,image,public_description,admin_notes,title,species,profession,visibility_mode,metadata,updated_at)
      SELECT c.camp_id,$2,$3,$4,$5,$6,$7,$8,NULL,$9,'admin_only','{}'::jsonb,now()
        FROM campaigns c WHERE c.camp_id=$1 AND c.status<>'archived' RETURNING n_id`,[projectId,data.name,data.adminNotes?.trim()||"no notes yet",data.gender,data.image?.trim()||"noimage",data.publicDescription?.trim()||null,data.adminNotes?.trim()||null,data.title?.trim()||null,data.profession?.trim()||null]);
    if(base.rowCount!==1)throw new Error("Project not found or archived.");
    const personId=base.rows[0].n_id;
    await client.query(`INSERT INTO charakters(n_id,loc_id,race,race_id,alive,birthday,follower,class,age) VALUES($1,$2,$3,$4,$5,'2000-01-01',$6,$7,0)`,[personId,data.locationId,raceName,data.raceId,data.alive,data.follower,data.className]);
    await client.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,'admin','person.created','person',$2,$3::jsonb)`,[projectId,personId,JSON.stringify({kind:"character",race_id:data.raceId,chronology:"fantasy_dates"})]);
    await client.query("COMMIT");
    return {nId:personId};
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}

export async function updateNpc(projectId:number,npcId:number,input:NpcInput){
  const data=npcInputSchema.parse(input);const [raceName]=await Promise.all([canonicalRace(projectId,data.raceId),assertLocation(projectId,data.locationId)]);
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const locked=await client.query("SELECT 1 FROM npcs n JOIN charakters c ON c.n_id=n.n_id WHERE n.camp_id=$1 AND n.n_id=$2 AND n.archived_at IS NULL FOR UPDATE",[projectId,npcId]);
    if(locked.rowCount!==1){await client.query("ROLLBACK");return null;}
    await client.query(`UPDATE npcs SET name=$3,notes=$4,gender=$5,image=$6,public_description=$7,admin_notes=$8,title=$9,profession=$10,updated_at=now() WHERE camp_id=$1 AND n_id=$2`,[projectId,npcId,data.name,data.adminNotes?.trim()||"no notes yet",data.gender,data.image?.trim()||"noimage",data.publicDescription?.trim()||null,data.adminNotes?.trim()||null,data.title?.trim()||null,data.profession?.trim()||null]);
    await client.query(`UPDATE charakters SET loc_id=$2,race=$3,race_id=$4,alive=$5,follower=$6,class=$7 WHERE n_id=$1`,[npcId,data.locationId,raceName,data.raceId,data.alive,data.follower,data.className]);
    await client.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,'admin','person.updated','person',$2,$3::jsonb)`,[projectId,npcId,JSON.stringify({race_id:data.raceId,legacy_race_shadow:raceName,legacy_age_preserved:true,legacy_birthday_preserved:true})]);
    await client.query("COMMIT");return {nId:npcId};
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}

export async function archiveNpc(projectId:number,npcId:number){
  const result=await pool.query(`UPDATE npcs n SET archived_at=now(),updated_at=now() WHERE n.camp_id=$1 AND n.n_id=$2 AND n.archived_at IS NULL AND EXISTS(SELECT 1 FROM charakters c WHERE c.n_id=n.n_id) RETURNING n.n_id`,[projectId,npcId]);
  if(result.rowCount===1)await pool.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id) VALUES($1,'admin','person.archived','person',$2)`,[projectId,npcId]);
  return result.rowCount===1?{id:npcId}:null;
}
