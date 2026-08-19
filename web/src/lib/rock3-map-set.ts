import "server-only";

import { pool } from "@/lib/db";
import { saveMediaUpload } from "@/lib/media";

export type Rock3LayerPreset={role:string;name:string;match:string[];opacity:number;zIndex:number;visible:boolean;category:string};
export const ROCK3_LAYER_PRESETS:Rock3LayerPreset[]=[
  {role:"satellite",name:"Satellite",match:["satellite color"],opacity:1,zIndex:0,visible:true,category:"terrain"},
  {role:"biomes",name:"Biomes · Köppen-Geiger",match:["biomes koppen-geiger","biomes köppen-geiger"],opacity:.72,zIndex:20,visible:false,category:"climate"},
  {role:"rainfall_annual",name:"Rainfall · Annual Total",match:["rainfall annual total"],opacity:.72,zIndex:30,visible:false,category:"climate"},
  {role:"rainfall_equinox",name:"Rainfall · Equinox",match:["rainfall equinox"],opacity:.72,zIndex:31,visible:false,category:"climate"},
  {role:"rainfall_summer",name:"Rainfall · Summer",match:["rainfall summer"],opacity:.72,zIndex:32,visible:false,category:"climate"},
  {role:"rainfall_winter",name:"Rainfall · Winter",match:["rainfall winter"],opacity:.72,zIndex:33,visible:false,category:"climate"},
  {role:"temperature_annual",name:"Temperature · Annual Mean",match:["temperature annual mean"],opacity:.72,zIndex:40,visible:false,category:"climate"},
  {role:"temperature_equinox",name:"Temperature · Equinox",match:["temperature equinox"],opacity:.72,zIndex:41,visible:false,category:"climate"},
  {role:"temperature_summer",name:"Temperature · Summer",match:["temperature summer"],opacity:.72,zIndex:42,visible:false,category:"climate"},
  {role:"temperature_winter",name:"Temperature · Winter",match:["temperature winter"],opacity:.72,zIndex:43,visible:false,category:"climate"},
  {role:"elevation_land",name:"Terrain · Elevation Above Sea Level",match:["terrain elevation above sea level"],opacity:.75,zIndex:50,visible:false,category:"terrain"},
  {role:"elevation_sea",name:"Terrain · Elevation Below Sea Level",match:["terrain elevation below sea level"],opacity:.75,zIndex:51,visible:false,category:"terrain"},
  {role:"elevation_full",name:"Terrain · Full Elevation",match:["terrain full elevation"],opacity:.75,zIndex:52,visible:false,category:"terrain"},
  {role:"land_mask",name:"Terrain · Land Mask",match:["terrain land mask"],opacity:.58,zIndex:60,visible:false,category:"editing"},
];
function normalize(name:string){return name.toLowerCase().replace(/\.[^.]+$/g,"").replace(/[–—_-]+/g," ").replace(/[^a-z0-9äöüß ]+/g," ").replace(/\s+/g," ").trim();}
export function detectRock3Preset(filename:string){const normalized=normalize(filename);return ROCK3_LAYER_PRESETS.find(p=>p.match.some(m=>normalized.includes(normalize(m))))??null;}

async function ensureEditorLayers(projectId:number,mapId:number){const defaults=[
  {name:"Political",role:"political",z:200,opacity:.38,style:{fill:"#7c6ee6",stroke:"#ffffff",strokeWidth:2}},
  {name:"Settlements",role:"settlements",z:220,opacity:1,style:{fill:"#f0b35a",stroke:"#ffffff",strokeWidth:2}},
  {name:"Routes & Rivers",role:"routes",z:230,opacity:1,style:{stroke:"#67a9cf",strokeWidth:3}},
];for(const layer of defaults)await pool.query(`INSERT INTO project_map_layers(project_id,map_id,name,layer_type,source_type,layer_role,opacity,z_index,visible_by_default,visibility_mode,style,config) VALUES($1,$2,$3,'vector','drawn',$4,$5,$6,true,'admin_only',$7::jsonb,'{}'::jsonb) ON CONFLICT(project_id,map_id,name) DO UPDATE SET layer_role=COALESCE(project_map_layers.layer_role,EXCLUDED.layer_role)`,[projectId,mapId,layer.name,layer.role,layer.opacity,layer.z,JSON.stringify(layer.style)]);}

export async function importRock3Files(projectId:number,mapId:number,files:File[],options:{setSatelliteAsBase?:boolean}={}){
  const map=await pool.query("SELECT 1 FROM project_maps WHERE project_id=$1 AND map_id=$2",[projectId,mapId]);if(map.rowCount!==1)throw new Error("Map not found in this project.");await ensureEditorLayers(projectId,mapId);
  const imported:Array<{filename:string;mediaId:number;role:string;layerId:number}>=[];const skipped:string[]=[];
  for(const file of files){if(!(file instanceof File)||file.size===0)continue;const preset=detectRock3Preset(file.name);if(!preset){skipped.push(file.name);continue;}const mediaId=await saveMediaUpload(projectId,file,{title:`Rock 3 · ${preset.name}`,altText:`Rock 3 ${preset.name} map layer`});const media=await pool.query<{width:number|null;height:number|null}>("SELECT NULLIF(metadata->>'width','')::int AS width,NULLIF(metadata->>'height','')::int AS height FROM media WHERE project_id=$1 AND media_id=$2",[projectId,mediaId]);const row=await pool.query<{layer_id:string}>(`INSERT INTO project_map_layers(project_id,map_id,name,layer_type,source_type,media_id,layer_role,opacity,z_index,visible_by_default,visibility_mode,style,config) VALUES($1,$2,$3,'raster','media',$4,$5,$6,$7,$8,'admin_only','{}'::jsonb,$9::jsonb) ON CONFLICT(project_id,map_id,name) DO UPDATE SET source_type='media',source_url=NULL,media_id=EXCLUDED.media_id,layer_role=EXCLUDED.layer_role,opacity=EXCLUDED.opacity,z_index=EXCLUDED.z_index,visible_by_default=EXCLUDED.visible_by_default,config=EXCLUDED.config,updated_at=now() RETURNING layer_id`,[projectId,mapId,preset.name,mediaId,preset.role,preset.opacity,preset.zIndex,preset.visible,JSON.stringify({category:preset.category,rock3:true,originalFilename:file.name})]);const layerId=Number(row.rows[0].layer_id);imported.push({filename:file.name,mediaId,role:preset.role,layerId});if(preset.role==="satellite"&&options.setSatelliteAsBase!==false){const width=media.rows[0]?.width??8192,height=media.rows[0]?.height??4096;await pool.query(`UPDATE project_maps SET map_type='image',image_path=$3,tile_url=NULL,bounds=$4::jsonb,config=COALESCE(config,'{}'::jsonb)||$5::jsonb,updated_at=now() WHERE project_id=$1 AND map_id=$2`,[projectId,mapId,String(mediaId),JSON.stringify([[0,0],[height,width]]),JSON.stringify({width,height,crs:"simple",rock3:true})]);}}
  return{imported,skipped,expectedRoles:ROCK3_LAYER_PRESETS.map(p=>p.role)};
}
