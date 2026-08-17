import "server-only";

import { pool } from "@/lib/db";

export type ProjectEntityType = "npc"|"god"|"character"|"location"|"group"|"event"|"map_marker"|"media"|"relationship"|"player";

export async function entityBelongsToProject(projectId:number,entityType:string,entityId:number){
 switch(entityType as ProjectEntityType){
  case "npc": return (await pool.query("SELECT 1 FROM npcs WHERE camp_id=$1 AND n_id=$2 AND archived_at IS NULL",[projectId,entityId])).rowCount===1;
  case "god": return (await pool.query("SELECT 1 FROM gods g JOIN npcs n ON n.n_id=g.n_id WHERE n.camp_id=$1 AND g.g_id=$2 AND n.archived_at IS NULL",[projectId,entityId])).rowCount===1;
  case "character": return (await pool.query("SELECT 1 FROM charakters c JOIN npcs n ON n.n_id=c.n_id WHERE n.camp_id=$1 AND c.char_id=$2 AND n.archived_at IS NULL",[projectId,entityId])).rowCount===1;
  case "location": return (await pool.query("SELECT 1 FROM locations WHERE camp_id=$1 AND loc_id=$2 AND archived_at IS NULL",[projectId,entityId])).rowCount===1;
  case "group": return (await pool.query("SELECT 1 FROM groups WHERE camp_id=$1 AND gr_id=$2 AND archived_at IS NULL",[projectId,entityId])).rowCount===1;
  case "event": return (await pool.query("SELECT 1 FROM events WHERE camp_id=$1 AND e_id=$2 AND archived_at IS NULL",[projectId,entityId])).rowCount===1;
  case "map_marker": return (await pool.query("SELECT 1 FROM map_markers WHERE project_id=$1 AND marker_id=$2",[projectId,entityId])).rowCount===1;
  case "media": return (await pool.query("SELECT 1 FROM media WHERE project_id=$1 AND media_id=$2",[projectId,entityId])).rowCount===1;
  case "relationship": return (await pool.query("SELECT 1 FROM relationships WHERE project_id=$1 AND relationship_id=$2",[projectId,entityId])).rowCount===1;
  case "player": return (await pool.query("SELECT 1 FROM users WHERE camp_id=$1 AND user_id=$2",[projectId,entityId])).rowCount===1;
  default: return false;
 }
}

export async function assertEntityBelongsToProject(projectId:number,entityType:string,entityId:number){if(!(await entityBelongsToProject(projectId,entityType,entityId)))throw new Error("Entity does not belong to this project.");}
