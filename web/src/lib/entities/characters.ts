import "server-only";

import { z } from "zod";
import { pool } from "@/lib/db";

const characterSchema = z.object({
  name:z.string().trim().min(1).max(100), gender:z.string().trim().max(10).default("unknown"),
  image:z.string().trim().max(4000).optional(), publicDescription:z.string().max(100000).optional(), adminNotes:z.string().max(100000).optional(),
  locationId:z.coerce.number().int().positive(), race:z.string().trim().max(40).default("unknown"),
  alive:z.coerce.boolean().default(true), birthday:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default("2000-01-01"),
  follower:z.coerce.boolean().default(false), className:z.string().trim().max(50).default("unknown"), age:z.coerce.number().int().min(0).max(100000).default(0),
  visibilityMode:z.enum(["admin_only","all_players","selected_players"]).default("admin_only"),
});

async function assertLocation(projectId:number,locationId:number){const r=await pool.query("SELECT 1 FROM locations WHERE camp_id=$1 AND loc_id=$2 AND archived_at IS NULL",[projectId,locationId]);if(r.rowCount!==1)throw new Error("Location does not belong to this project.");}

const characterSelect = `SELECT c.char_id,n.n_id,n.name,n.image,c.race,c.alive,c.class,c.age,l.name AS location_name,
        u.user_id AS player_id,COALESCE(u.display_name,u.name) AS player_name,n.visibility_mode
   FROM charakters c JOIN npcs n ON n.n_id=c.n_id
   JOIN locations l ON l.loc_id=c.loc_id AND l.camp_id=n.camp_id
   LEFT JOIN chars a ON a.n_id=n.n_id
   LEFT JOIN users u ON u.user_id=a.user_id AND u.camp_id=n.camp_id`;

type CharacterListRow={char_id:number;n_id:number;name:string;image:string;race:string;alive:boolean;class:string;age:number;location_name:string;player_id:number|null;player_name:string|null;visibility_mode:string};

/** All normal world characters/NPCs, regardless of player assignment. */
export async function listCharacters(projectId:number){const r=await pool.query<CharacterListRow>(`${characterSelect} WHERE n.camp_id=$1 AND n.archived_at IS NULL ORDER BY n.name,c.char_id`,[projectId]);return r.rows;}

/** Only actual Player Characters: a Character person joined through chars and users. */
export async function listPlayerCharacters(projectId:number){const r=await pool.query<CharacterListRow>(`${characterSelect} WHERE n.camp_id=$1 AND n.archived_at IS NULL AND a.user_id IS NOT NULL AND u.user_id IS NOT NULL ORDER BY COALESCE(u.display_name,u.name),n.name`,[projectId]);return r.rows;}

/** Character persons that are valid candidates for player assignment. */
export async function listUnassignedCharacters(projectId:number){const r=await pool.query<CharacterListRow>(`${characterSelect} WHERE n.camp_id=$1 AND n.archived_at IS NULL AND a.n_id IS NULL ORDER BY n.name,c.char_id`,[projectId]);return r.rows;}

export async function getCharacter(projectId:number,charId:number){const r=await pool.query(
`SELECT c.*,n.name,n.gender,n.image,n.notes,n.public_description,n.admin_notes,n.visibility_mode,
        n.n_id AS person_id,u.user_id AS player_id,COALESCE(u.display_name,u.name) AS player_name
   FROM charakters c JOIN npcs n ON n.n_id=c.n_id
   LEFT JOIN chars a ON a.n_id=n.n_id LEFT JOIN users u ON u.user_id=a.user_id AND u.camp_id=n.camp_id
  WHERE n.camp_id=$1 AND c.char_id=$2 AND n.archived_at IS NULL`,[projectId,charId]);return r.rows[0]??null;}

export async function createCharacter(projectId:number,input:unknown){const d=characterSchema.parse(input);await assertLocation(projectId,d.locationId);const client=await pool.connect();try{await client.query("BEGIN");const n=await client.query<{n_id:number}>(
`INSERT INTO npcs(camp_id,name,notes,gender,image,public_description,admin_notes,visibility_mode,metadata,updated_at)
 SELECT c.camp_id,$2,$3,$4,$5,$6,$7,$8,'{}'::jsonb,now() FROM campaigns c WHERE c.camp_id=$1 AND c.status<>'archived' RETURNING n_id`,
[projectId,d.name,d.adminNotes||"no notes yet",d.gender,d.image||"noimage",d.publicDescription||null,d.adminNotes||null,d.visibilityMode]);if(n.rowCount!==1)throw new Error("Project not found or archived.");const c=await client.query<{char_id:number}>(
`INSERT INTO charakters(n_id,loc_id,race,alive,birthday,follower,class,age) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING char_id`,
[n.rows[0].n_id,d.locationId,d.race,d.alive,d.birthday,d.follower,d.className,d.age]);await client.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,'admin','character.created','person',$2,$3::jsonb)`,[projectId,n.rows[0].n_id,JSON.stringify({character_row_id:c.rows[0].char_id})]);await client.query("COMMIT");return c.rows[0].char_id;}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}}

export async function updateCharacter(projectId:number,charId:number,input:unknown){const d=characterSchema.parse(input);await assertLocation(projectId,d.locationId);const client=await pool.connect();try{await client.query("BEGIN");const r=await client.query<{n_id:number}>("SELECT n.n_id FROM charakters c JOIN npcs n ON n.n_id=c.n_id WHERE n.camp_id=$1 AND c.char_id=$2 AND n.archived_at IS NULL FOR UPDATE",[projectId,charId]);if(r.rowCount!==1)throw new Error("Character not found in this project.");const nId=r.rows[0].n_id;await client.query("UPDATE npcs SET name=$3,notes=$4,gender=$5,image=$6,public_description=$7,admin_notes=$8,visibility_mode=$9,updated_at=now() WHERE camp_id=$1 AND n_id=$2",[projectId,nId,d.name,d.adminNotes||"no notes yet",d.gender,d.image||"noimage",d.publicDescription||null,d.adminNotes||null,d.visibilityMode]);await client.query("UPDATE charakters SET loc_id=$3,race=$4,alive=$5,birthday=$6,follower=$7,class=$8,age=$9 WHERE char_id=$2 AND n_id=$1",[nId,charId,d.locationId,d.race,d.alive,d.birthday,d.follower,d.className,d.age]);await client.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,'admin','person.updated','person',$2,$3::jsonb)`,[projectId,nId,JSON.stringify({character_row_id:charId})]);await client.query("COMMIT");}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}}

export async function assignCharacterToPlayer(projectId:number,charId:number,playerId:number|null){const client=await pool.connect();try{await client.query("BEGIN");const c=await client.query<{n_id:number}>("SELECT n.n_id FROM charakters ch JOIN npcs n ON n.n_id=ch.n_id WHERE ch.char_id=$2 AND n.camp_id=$1 AND n.archived_at IS NULL",[projectId,charId]);if(c.rowCount!==1)throw new Error("Character not found in this project.");const nId=c.rows[0].n_id;await client.query("DELETE FROM chars WHERE n_id=$1",[nId]);if(playerId){const p=await client.query("SELECT 1 FROM users WHERE camp_id=$1 AND user_id=$2 AND active=true",[projectId,playerId]);if(p.rowCount!==1)throw new Error("Player does not belong to this project.");await client.query("DELETE FROM chars a USING npcs n WHERE a.n_id=n.n_id AND n.camp_id=$1 AND a.user_id=$2",[projectId,playerId]);await client.query("INSERT INTO chars(n_id,user_id) VALUES($1,$2)",[nId,playerId]);}await client.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,'admin',$2,'person',$3,$4::jsonb)`,[projectId,playerId?"player.assigned":"player.unassigned",nId,JSON.stringify({player_id:playerId,character_row_id:charId})]);await client.query("COMMIT");}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}}

export async function archiveCharacter(projectId:number,charId:number){const r=await pool.query<{n_id:number}>("UPDATE npcs n SET archived_at=now(),updated_at=now() FROM charakters c WHERE c.char_id=$2 AND c.n_id=n.n_id AND n.camp_id=$1 AND n.archived_at IS NULL RETURNING n.n_id",[projectId,charId]);if(r.rowCount!==1)throw new Error("Character not found in this project.");await pool.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,'admin','person.archived','person',$2,$3::jsonb)`,[projectId,r.rows[0].n_id,JSON.stringify({character_row_id:charId})]);}
