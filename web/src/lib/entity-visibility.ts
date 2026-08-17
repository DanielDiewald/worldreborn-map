import "server-only";

import { z } from "zod";
import { pool } from "@/lib/db";
import { assertEntityBelongsToProject } from "@/lib/entity-project";

const variantSchema = z.object({
  name: z.string().trim().max(200).optional(),
  description: z.string().max(100_000).optional(),
  image: z.string().trim().max(4000).optional(),
});

export type PlayerEntityAccess = {
  playerId: number;
  playerName: string;
  visible: boolean;
  explicit: boolean;
  hasVariant: boolean;
  variantName: string | null;
  variantDescription: string | null;
};

export async function listPlayerEntityAccess(args: { projectId: number; entityType: string; entityId: number; baseVisibility: string }) {
  await assertEntityBelongsToProject(args.projectId,args.entityType,args.entityId);
  const result = await pool.query<{player_id:number;player_name:string;explicit_visible:boolean|null;variant_name:string|null;variant_description:string|null;variant_id:string|null}>(
    `SELECT u.user_id AS player_id,COALESCE(u.display_name,u.name) AS player_name,ev.visible AS explicit_visible,v.name_override AS variant_name,v.description_override AS variant_description,v.variant_id
       FROM users u
       LEFT JOIN entity_visibility ev ON ev.project_id=u.camp_id AND ev.player_id=u.user_id AND ev.entity_type=$2 AND ev.entity_id=$3
       LEFT JOIN player_entity_variants v ON v.project_id=u.camp_id AND v.player_id=u.user_id AND v.entity_type=$2 AND v.entity_id=$3 AND v.mode='override'
      WHERE u.camp_id=$1 ORDER BY COALESCE(u.display_name,u.name),u.user_id`,[args.projectId,args.entityType,args.entityId]);
  return result.rows.map((row):PlayerEntityAccess=>({playerId:row.player_id,playerName:row.player_name,visible:row.explicit_visible??args.baseVisibility==="all_players",explicit:row.explicit_visible!==null,hasVariant:row.variant_id!==null,variantName:row.variant_name,variantDescription:row.variant_description}));
}

export async function setPlayerEntityVisibility(args:{projectId:number;playerId:number;entityType:string;entityId:number;visible:boolean}){
  await assertEntityBelongsToProject(args.projectId,args.entityType,args.entityId);
  const player=await pool.query("SELECT 1 FROM users WHERE camp_id=$1 AND user_id=$2",[args.projectId,args.playerId]);if(player.rowCount!==1)throw new Error("Player does not belong to this project.");
  await pool.query(`INSERT INTO entity_visibility(project_id,player_id,entity_type,entity_id,visible) VALUES($1,$2,$3,$4,$5) ON CONFLICT(project_id,player_id,entity_type,entity_id) DO UPDATE SET visible=EXCLUDED.visible,updated_at=now()`,[args.projectId,args.playerId,args.entityType,args.entityId,args.visible]);
  await pool.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,'admin','visibility.changed',$2,$3,$4::jsonb)`,[args.projectId,args.entityType,args.entityId,JSON.stringify({player_id:args.playerId,visible:args.visible})]);
}

export async function upsertPlayerVariant(args:{projectId:number;playerId:number;entityType:string;entityId:number;input:unknown}){
  const input=variantSchema.parse(args.input);await assertEntityBelongsToProject(args.projectId,args.entityType,args.entityId);const player=await pool.query("SELECT 1 FROM users WHERE camp_id=$1 AND user_id=$2",[args.projectId,args.playerId]);if(player.rowCount!==1)throw new Error("Player does not belong to this project.");
  await pool.query(`INSERT INTO player_entity_variants(project_id,player_id,entity_type,entity_id,mode,name_override,description_override,image_override) VALUES($1,$2,$3,$4,'override',$5,$6,$7) ON CONFLICT(project_id,player_id,entity_type,entity_id) WHERE mode='override' DO UPDATE SET name_override=EXCLUDED.name_override,description_override=EXCLUDED.description_override,image_override=EXCLUDED.image_override,updated_at=now()`,[args.projectId,args.playerId,args.entityType,args.entityId,input.name||null,input.description||null,input.image||null]);
  await setPlayerEntityVisibility({...args,visible:true});
  await pool.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,'admin','variant.upserted',$2,$3,$4::jsonb)`,[args.projectId,args.entityType,args.entityId,JSON.stringify({player_id:args.playerId})]);
}

export async function deletePlayerVariant(args:{projectId:number;playerId:number;entityType:string;entityId:number}){
  await assertEntityBelongsToProject(args.projectId,args.entityType,args.entityId);
  await pool.query(`DELETE FROM player_entity_variants WHERE project_id=$1 AND player_id=$2 AND entity_type=$3 AND entity_id=$4 AND mode='override'`,[args.projectId,args.playerId,args.entityType,args.entityId]);
}
