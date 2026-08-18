import "server-only";

import { z } from "zod";
import { pool } from "@/lib/db";

const tileMapSchema = z.object({
  mapType: z.literal("tile"),
  name: z.string().trim().min(1).max(120),
  tileUrl: z.string().trim().min(1).max(4000),
  minZoom: z.coerce.number().int().min(-10).max(30).default(0),
  maxZoom: z.coerce.number().int().min(-10).max(30).default(6),
  centerLat: z.coerce.number().finite().nullable().optional(),
  centerLng: z.coerce.number().finite().nullable().optional(),
  noWrap: z.coerce.boolean().default(true),
  isPrimary: z.coerce.boolean().default(false),
});

const imageMapSchema = z.object({
  mapType: z.literal("image"),
  name: z.string().trim().min(1).max(120),
  imagePath: z.string().trim().min(1).max(4000),
  minZoom: z.coerce.number().int().min(-10).max(30).default(-2),
  maxZoom: z.coerce.number().int().min(-10).max(30).default(4),
  width: z.coerce.number().positive().max(1_000_000),
  height: z.coerce.number().positive().max(1_000_000),
  isPrimary: z.coerce.boolean().default(false),
});

const mapSchema = z.discriminatedUnion("mapType", [tileMapSchema, imageMapSchema]).superRefine((value,context)=>{
  if(value.maxZoom<value.minZoom)context.addIssue({code:"custom",message:"Max Zoom must be greater than or equal to Min Zoom."});
  if(value.mapType==="tile"&&(value.centerLat==null)!=(value.centerLng==null)){
    context.addIssue({code:"custom",message:"Map center requires both latitude and longitude."});
  }
});

export async function createProjectMap(projectId:number,input:unknown){
  const data=mapSchema.parse(input);
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const project=await client.query("SELECT 1 FROM campaigns WHERE camp_id=$1 AND status<>'archived' FOR UPDATE",[projectId]);
    if(project.rowCount!==1)throw new Error("Project not found or archived.");
    if(data.isPrimary)await client.query("UPDATE project_maps SET is_primary=false,updated_at=now() WHERE project_id=$1 AND is_primary",[projectId]);
    const config=data.mapType==="tile"?{no_wrap:data.noWrap}:{width:data.width,height:data.height,crs:"simple"};
    const result=await client.query<{map_id:string}>(
      `INSERT INTO project_maps(project_id,name,map_type,tile_url,image_path,min_zoom,max_zoom,center_lat,center_lng,bounds,config,is_primary)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12)
       RETURNING map_id`,
      [
        projectId,
        data.name,
        data.mapType,
        data.mapType==="tile"?data.tileUrl:null,
        data.mapType==="image"?data.imagePath:null,
        data.minZoom,
        data.maxZoom,
        data.mapType==="tile"?(data.centerLat??null):null,
        data.mapType==="tile"?(data.centerLng??null):null,
        data.mapType==="image"?JSON.stringify([[0,0],[data.height,data.width]]):null,
        JSON.stringify(config),
        data.isPrimary,
      ],
    );
    const id=Number(result.rows[0].map_id);
    if(data.isPrimary)await client.query("UPDATE campaigns SET primary_map_id=$2,updated_at=now() WHERE camp_id=$1",[projectId,id]);
    await client.query(
      `INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata)
       VALUES($1,'admin','map.created','map',$2,$3::jsonb)`,
      [projectId,id,JSON.stringify({map_type:data.mapType})],
    );
    await client.query("COMMIT");
    return id;
  }catch(error){
    await client.query("ROLLBACK");
    throw error;
  }finally{
    client.release();
  }
}

export async function updateProjectMap(projectId:number,mapId:number,input:unknown){
  const data=mapSchema.parse(input);
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const current=await client.query<{
      map_type:"tile"|"image";
      bounds:unknown;
      config:Record<string,unknown>|null;
    }>(
      "SELECT map_type,bounds,config FROM project_maps WHERE project_id=$1 AND map_id=$2 FOR UPDATE",
      [projectId,mapId],
    );
    if(current.rowCount!==1)throw new Error("Map not found in this project.");
    const existing=current.rows[0];
    if(existing.map_type!==data.mapType)throw new Error("Changing the map type of an existing map is not supported. Create a new map instead.");

    const previousConfig=existing.config??{};
    const config=data.mapType==="tile"
      ? {...previousConfig,no_wrap:data.noWrap}
      : {...previousConfig,width:data.width,height:data.height,crs:"simple"};
    const bounds=data.mapType==="image"?[[0,0],[data.height,data.width]]:existing.bounds;

    await client.query(
      `UPDATE project_maps
          SET name=$3,
              tile_url=$4,
              image_path=$5,
              min_zoom=$6,
              max_zoom=$7,
              center_lat=$8,
              center_lng=$9,
              bounds=$10::jsonb,
              config=$11::jsonb,
              updated_at=now()
        WHERE project_id=$1 AND map_id=$2`,
      [
        projectId,
        mapId,
        data.name,
        data.mapType==="tile"?data.tileUrl:null,
        data.mapType==="image"?data.imagePath:null,
        data.minZoom,
        data.maxZoom,
        data.mapType==="tile"?(data.centerLat??null):null,
        data.mapType==="tile"?(data.centerLng??null):null,
        bounds==null?null:JSON.stringify(bounds),
        JSON.stringify(config),
      ],
    );
    await client.query(
      `INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata)
       VALUES($1,'admin','map.updated','map',$2,$3::jsonb)`,
      [projectId,mapId,JSON.stringify({map_type:data.mapType})],
    );
    await client.query("COMMIT");
  }catch(error){
    await client.query("ROLLBACK");
    throw error;
  }finally{
    client.release();
  }
}

export async function setPrimaryMap(projectId:number,mapId:number){
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const map=await client.query("SELECT 1 FROM project_maps WHERE project_id=$1 AND map_id=$2 FOR UPDATE",[projectId,mapId]);
    if(map.rowCount!==1)throw new Error("Map does not belong to this project.");
    await client.query("UPDATE project_maps SET is_primary=(map_id=$2),updated_at=now() WHERE project_id=$1",[projectId,mapId]);
    await client.query("UPDATE campaigns SET primary_map_id=$2,updated_at=now() WHERE camp_id=$1",[projectId,mapId]);
    await client.query(
      `INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id)
       VALUES($1,'admin','map.primary_changed','map',$2)`,
      [projectId,mapId],
    );
    await client.query("COMMIT");
  }catch(error){
    await client.query("ROLLBACK");
    throw error;
  }finally{
    client.release();
  }
}

export async function deleteProjectMap(projectId:number,mapId:number){
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const map=await client.query<{is_primary:boolean}>("SELECT is_primary FROM project_maps WHERE project_id=$1 AND map_id=$2 FOR UPDATE",[projectId,mapId]);
    if(map.rowCount!==1)throw new Error("Map not found in this project.");
    if(map.rows[0].is_primary)throw new Error("Choose another primary map before deleting this map.");
    const markers=await client.query("SELECT 1 FROM map_markers WHERE project_id=$1 AND map_id=$2 LIMIT 1",[projectId,mapId]);
    if(markers.rowCount)throw new Error("Delete or move this map's markers before deleting the map.");
    await client.query("DELETE FROM project_maps WHERE project_id=$1 AND map_id=$2",[projectId,mapId]);
    await client.query(
      `INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id)
       VALUES($1,'admin','map.deleted','map',$2)`,
      [projectId,mapId],
    );
    await client.query("COMMIT");
  }catch(error){
    await client.query("ROLLBACK");
    throw error;
  }finally{
    client.release();
  }
}
