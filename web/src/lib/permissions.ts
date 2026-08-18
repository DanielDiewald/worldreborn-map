import "server-only";

import { pool } from "@/lib/db";
import { resolveEntityReference, type CanonicalEntityType } from "@/lib/entity-reference";

type EntityVisibility={project_id:number;visibility_mode:"admin_only"|"all_players"|"selected_players"};

async function getCanonicalVisibility(projectId:number,entityType:CanonicalEntityType,entityId:number){
  const queries:Partial<Record<CanonicalEntityType,string>>={
    person:`SELECT camp_id AS project_id,visibility_mode FROM npcs WHERE camp_id=$1 AND n_id=$2 AND archived_at IS NULL`,
    location:`SELECT camp_id AS project_id,visibility_mode FROM locations WHERE camp_id=$1 AND loc_id=$2 AND archived_at IS NULL`,
    group:`SELECT camp_id AS project_id,visibility_mode FROM groups WHERE camp_id=$1 AND gr_id=$2 AND archived_at IS NULL`,
    event:`SELECT camp_id AS project_id,visibility_mode FROM events WHERE camp_id=$1 AND e_id=$2 AND archived_at IS NULL`,
    map_marker:`SELECT project_id,visibility_mode FROM map_markers WHERE project_id=$1 AND marker_id=$2`,
    relationship:`SELECT project_id,visibility_mode FROM relationships WHERE project_id=$1 AND relationship_id=$2`,
  };
  const query=queries[entityType];if(!query)return null;const r=await pool.query<EntityVisibility>(query,[projectId,entityId]);return r.rows[0]??null;
}

export async function canPlayerViewEntity(args:{projectId:number;playerId:number;entityType:string;entityId:number}){
  const player=await pool.query("SELECT 1 FROM users WHERE user_id=$1 AND camp_id=$2 AND active=true",[args.playerId,args.projectId]);if(player.rowCount!==1)return false;
  let ref;try{ref=await resolveEntityReference({projectId:args.projectId,entityType:args.entityType,entityId:args.entityId});}catch{return false;}
  const entity=await getCanonicalVisibility(args.projectId,ref.type,ref.id);if(!entity)return false;
  const explicit=await pool.query<{visible:boolean}>("SELECT visible FROM entity_visibility WHERE project_id=$1 AND player_id=$2 AND entity_type=$3 AND entity_id=$4 LIMIT 1",[args.projectId,args.playerId,ref.type,ref.id]);
  if(explicit.rowCount===1)return explicit.rows[0].visible;return entity.visibility_mode==="all_players";
}

export async function canPlayerViewPerson(projectId:number,playerId:number,nId:number){return canPlayerViewEntity({projectId,playerId,entityType:"person",entityId:nId});}

export async function getEntityForPlayer(args:{projectId:number;playerId:number;entityType:string;entityId:number}){
  let ref;try{ref=await resolveEntityReference({projectId:args.projectId,entityType:args.entityType,entityId:args.entityId});}catch{return null;}
  if(!(await canPlayerViewEntity({projectId:args.projectId,playerId:args.playerId,entityType:ref.type,entityId:ref.id})))return null;
  const baseQueries:Partial<Record<CanonicalEntityType,string>>={
    person:`SELECT n.n_id AS id,n.name,n.public_description AS description,n.image,c.loc_id AS location_id,
                   CASE WHEN g.g_id IS NOT NULL THEN 'god' ELSE 'character' END AS kind
              FROM npcs n LEFT JOIN charakters c ON c.n_id=n.n_id LEFT JOIN gods g ON g.n_id=n.n_id
             WHERE n.camp_id=$1 AND n.n_id=$2 AND n.archived_at IS NULL`,
    location:`SELECT loc_id AS id,name,description,coat_of_arm AS image,loc_id AS location_id,NULL::text AS kind FROM locations WHERE camp_id=$1 AND loc_id=$2 AND archived_at IS NULL`,
    group:`SELECT gr_id AS id,name,NULL::text AS description,image,loc_id AS location_id,NULL::text AS kind FROM groups WHERE camp_id=$1 AND gr_id=$2 AND archived_at IS NULL`,
    event:`SELECT e_id AS id,name,NULL::text AS description,image,loc_id AS location_id,NULL::text AS kind FROM events WHERE camp_id=$1 AND e_id=$2 AND archived_at IS NULL`,
  };
  const query=baseQueries[ref.type];if(!query)return null;
  const base=await pool.query<{id:number;name:string;description:string|null;image:string|null;location_id:number|null;kind:string|null}>(query,[args.projectId,ref.id]);if(base.rowCount!==1)return null;
  const variant=await pool.query<{name_override:string|null;description_override:string|null;image_override:string|null;location_override:number|null}>("SELECT name_override,description_override,image_override,location_override FROM player_entity_variants WHERE project_id=$1 AND player_id=$2 AND entity_type=$3 AND entity_id=$4 AND mode='override' LIMIT 1",[args.projectId,args.playerId,ref.type,ref.id]);
  const item=base.rows[0],override=variant.rows[0];if(!override)return item;return{...item,name:override.name_override??item.name,description:override.description_override??item.description,image:override.image_override??item.image,location_id:override.location_override??item.location_id};
}
