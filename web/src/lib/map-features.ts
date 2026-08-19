import "server-only";

import { z } from "zod";
import { pool } from "@/lib/db";

const geometrySchema = z.object({
  type: z.enum(["Point","LineString","Polygon","MultiPoint","MultiLineString","MultiPolygon"]),
  coordinates: z.unknown(),
}).passthrough();

const featureInputSchema = z.object({
  layerId: z.coerce.number().int().positive(),
  geometry: geometrySchema,
  entityType: z.string().trim().max(40).nullable().optional(),
  entityId: z.coerce.number().int().positive().nullable().optional(),
  label: z.string().trim().min(1).max(200),
  shortDescription: z.string().trim().max(10000).nullable().optional(),
  visibilityMode: z.enum(["admin_only","all_players","selected_players"]).default("admin_only"),
  selectedPlayerIds: z.array(z.coerce.number().int().positive()).default([]),
  style: z.record(z.string(),z.unknown()).default({}),
  metadata: z.record(z.string(),z.unknown()).default({}),
});

const layerInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  layerType: z.enum(["raster","vector"]),
  sourceType: z.enum(["image","tile","geojson","drawn"]),
  sourceUrl: z.string().trim().max(4000).nullable().optional(),
  opacity: z.coerce.number().min(0).max(1).default(1),
  zIndex: z.coerce.number().int().min(-100000).max(100000).default(0),
  visibleByDefault: z.coerce.boolean().default(true),
  visibilityMode: z.enum(["admin_only","all_players","selected_players"]).default("admin_only"),
  style: z.record(z.string(),z.unknown()).default({}),
  config: z.record(z.string(),z.unknown()).default({}),
}).superRefine((value,ctx)=>{
  if(value.sourceType!=="drawn"&&!value.sourceUrl){
    ctx.addIssue({code:"custom",message:"Source URL is required for image, tile and GeoJSON layers."});
  }
});

export type ProjectMapLayer = {
  layer_id:string;
  project_id:number;
  map_id:string;
  name:string;
  layer_type:"raster"|"vector";
  source_type:"image"|"tile"|"geojson"|"drawn";
  source_url:string|null;
  opacity:number;
  z_index:number;
  visible_by_default:boolean;
  visibility_mode:"admin_only"|"all_players"|"selected_players";
  style:Record<string,unknown>;
  config:Record<string,unknown>;
};

export type MapFeatureRow = {
  feature_id:string;
  project_id:number;
  map_id:string;
  layer_id:string;
  geometry_type:string;
  geometry:{type:string;coordinates:unknown};
  entity_type:string|null;
  entity_id:string|null;
  label:string;
  short_description:string|null;
  visibility_mode:string;
  style:Record<string,unknown>;
  metadata:Record<string,unknown>;
};

export async function listMapLayers(projectId:number,mapId:number){
  const result=await pool.query<ProjectMapLayer>(
    `SELECT layer_id,project_id,map_id,name,layer_type,source_type,source_url,opacity,z_index,
            visible_by_default,visibility_mode,style,config
       FROM project_map_layers
      WHERE project_id=$1 AND map_id=$2
      ORDER BY z_index,layer_id`,
    [projectId,mapId],
  );
  return result.rows;
}

export async function listMapFeatures(projectId:number,mapId:number){
  const result=await pool.query<MapFeatureRow>(
    `SELECT feature_id,project_id,map_id,layer_id,geometry_type,geometry,entity_type,entity_id,
            label,short_description,visibility_mode,style,metadata
       FROM map_features
      WHERE project_id=$1 AND map_id=$2
      ORDER BY feature_id`,
    [projectId,mapId],
  );
  return result.rows;
}

export async function listVisibleMapLayers(projectId:number,mapId:number,playerId:number){
  const result=await pool.query<ProjectMapLayer>(
    `SELECT l.layer_id,l.project_id,l.map_id,l.name,l.layer_type,l.source_type,l.source_url,l.opacity,l.z_index,
            l.visible_by_default,l.visibility_mode,l.style,l.config
       FROM project_map_layers l
      WHERE l.project_id=$1 AND l.map_id=$2
        AND (
          l.visibility_mode='all_players'
          OR (l.visibility_mode='selected_players' AND EXISTS(
              SELECT 1 FROM map_layer_visibility v WHERE v.layer_id=l.layer_id AND v.player_id=$3 AND v.visible
          ))
        )
      ORDER BY l.z_index,l.layer_id`,
    [projectId,mapId,playerId],
  );
  return result.rows;
}

export async function listVisibleMapFeatures(projectId:number,mapId:number,playerId:number){
  const result=await pool.query<MapFeatureRow>(
    `SELECT f.feature_id,f.project_id,f.map_id,f.layer_id,f.geometry_type,f.geometry,f.entity_type,f.entity_id,
            f.label,f.short_description,f.visibility_mode,f.style,f.metadata
       FROM map_features f
       JOIN project_map_layers l ON l.layer_id=f.layer_id AND l.project_id=f.project_id AND l.map_id=f.map_id
      WHERE f.project_id=$1 AND f.map_id=$2
        AND (
          l.visibility_mode='all_players'
          OR (l.visibility_mode='selected_players' AND EXISTS(
              SELECT 1 FROM map_layer_visibility lv WHERE lv.layer_id=l.layer_id AND lv.player_id=$3 AND lv.visible
          ))
        )
        AND (
          f.visibility_mode='all_players'
          OR (f.visibility_mode='selected_players' AND EXISTS(
              SELECT 1 FROM map_feature_visibility fv WHERE fv.feature_id=f.feature_id AND fv.player_id=$3 AND fv.visible
          ))
        )
      ORDER BY f.feature_id`,
    [projectId,mapId,playerId],
  );
  return result.rows;
}

export async function createMapFeature(projectId:number,mapId:number,input:unknown){
  const data=featureInputSchema.parse(input);
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const layer=await client.query(
      "SELECT 1 FROM project_map_layers WHERE project_id=$1 AND map_id=$2 AND layer_id=$3 FOR SHARE",
      [projectId,mapId,data.layerId],
    );
    if(layer.rowCount!==1)throw new Error("Layer not found in this map.");
    const result=await client.query<{feature_id:string}>(
      `INSERT INTO map_features(project_id,map_id,layer_id,geometry_type,geometry,entity_type,entity_id,label,short_description,visibility_mode,style,metadata)
       VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)
       RETURNING feature_id`,
      [projectId,mapId,data.layerId,data.geometry.type,JSON.stringify(data.geometry),data.entityType??null,data.entityId??null,
       data.label,data.shortDescription??null,data.visibilityMode,JSON.stringify(data.style),JSON.stringify(data.metadata)],
    );
    const featureId=Number(result.rows[0].feature_id);
    if(data.visibilityMode==="selected_players"&&data.selectedPlayerIds.length){
      await client.query(
        `INSERT INTO map_feature_visibility(feature_id,player_id,visible)
         SELECT $1,u.user_id,true FROM users u WHERE u.camp_id=$2 AND u.user_id=ANY($3::int[])
         ON CONFLICT(feature_id,player_id) DO UPDATE SET visible=true`,
        [featureId,projectId,data.selectedPlayerIds],
      );
    }
    await client.query("COMMIT");
    return featureId;
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}

export async function updateMapFeature(projectId:number,mapId:number,featureId:number,input:unknown){
  const data=featureInputSchema.parse(input);
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const existing=await client.query("SELECT 1 FROM map_features WHERE project_id=$1 AND map_id=$2 AND feature_id=$3 FOR UPDATE",[projectId,mapId,featureId]);
    if(existing.rowCount!==1)throw new Error("Feature not found in this map.");
    const layer=await client.query("SELECT 1 FROM project_map_layers WHERE project_id=$1 AND map_id=$2 AND layer_id=$3",[projectId,mapId,data.layerId]);
    if(layer.rowCount!==1)throw new Error("Layer not found in this map.");
    await client.query(
      `UPDATE map_features SET layer_id=$4,geometry_type=$5,geometry=$6::jsonb,entity_type=$7,entity_id=$8,
              label=$9,short_description=$10,visibility_mode=$11,style=$12::jsonb,metadata=$13::jsonb,updated_at=now()
        WHERE project_id=$1 AND map_id=$2 AND feature_id=$3`,
      [projectId,mapId,featureId,data.layerId,data.geometry.type,JSON.stringify(data.geometry),data.entityType??null,data.entityId??null,
       data.label,data.shortDescription??null,data.visibilityMode,JSON.stringify(data.style),JSON.stringify(data.metadata)],
    );
    await client.query("DELETE FROM map_feature_visibility WHERE feature_id=$1",[featureId]);
    if(data.visibilityMode==="selected_players"&&data.selectedPlayerIds.length){
      await client.query(
        `INSERT INTO map_feature_visibility(feature_id,player_id,visible)
         SELECT $1,u.user_id,true FROM users u WHERE u.camp_id=$2 AND u.user_id=ANY($3::int[])`,
        [featureId,projectId,data.selectedPlayerIds],
      );
    }
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}

export async function deleteMapFeature(projectId:number,mapId:number,featureId:number){
  const result=await pool.query("DELETE FROM map_features WHERE project_id=$1 AND map_id=$2 AND feature_id=$3",[projectId,mapId,featureId]);
  if(result.rowCount!==1)throw new Error("Feature not found in this map.");
}

export async function createMapLayer(projectId:number,mapId:number,input:unknown){
  const data=layerInputSchema.parse(input);
  const result=await pool.query<{layer_id:string}>(
    `INSERT INTO project_map_layers(project_id,map_id,name,layer_type,source_type,source_url,opacity,z_index,visible_by_default,visibility_mode,style,config)
     SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb
      WHERE EXISTS(SELECT 1 FROM project_maps WHERE project_id=$1 AND map_id=$2)
     RETURNING layer_id`,
    [projectId,mapId,data.name,data.layerType,data.sourceType,data.sourceUrl??null,data.opacity,data.zIndex,data.visibleByDefault,
     data.visibilityMode,JSON.stringify(data.style),JSON.stringify(data.config)],
  );
  if(result.rowCount!==1)throw new Error("Map not found in this project.");
  return Number(result.rows[0].layer_id);
}
