import "server-only";

import { z } from "zod";
import { pool } from "@/lib/db";
import { clampPagination,paginatedResult,type Pagination } from "@/lib/pagination";

export const LOCATION_KINDS=["world","continent","country","region","province","city","town","village","district","building","landmark","wilderness","other"] as const;
export type LocationKind=(typeof LOCATION_KINDS)[number];

const locationSchema=z.object({
  name:z.string().trim().min(1).max(100),
  locationType:z.string().trim().max(80).optional(),
  locationKind:z.enum(LOCATION_KINDS).default("other"),
  slug:z.string().trim().max(140).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).nullable().optional(),
  description:z.string().max(100_000).optional(),
  coatOfArm:z.string().trim().max(4000).optional(),
  parentLocId:z.coerce.number().int().positive().nullable().optional(),
  ownerNpcId:z.coerce.number().int().positive().nullable().optional(),
  capitalLocId:z.coerce.number().int().positive().nullable().optional(),
  population:z.coerce.number().int().nonnegative().nullable().optional(),
  mapId:z.coerce.number().int().positive().nullable().optional(),
  mapFeatureId:z.coerce.number().int().positive().nullable().optional(),
  visibilityMode:z.enum(["admin_only","all_players","selected_players"]).default("admin_only"),
});

export type LocationListItem={
  loc_id:number;name:string;coat_of_arm:string|null;parent_loc_id:number|null;location_type:string|null;location_kind:LocationKind;slug:string|null;description:string|null;owner_n_id:number|null;capital_loc_id:number|null;population:string|null;visibility_mode:string;map_id:string|null;map_feature_id:string|null;parent_name:string|null;owner_name:string|null;capital_name:string|null;
};
export type LocationListFilters={query?:string;visibility?:"admin_only"|"all_players"|"selected_players";kind?:LocationKind};

const locationSelect=`SELECT l.loc_id,l.name,l.coat_of_arm,l.parent_loc_id,l.location_type,l.location_kind,l.slug,l.description,l.owner_n_id,l.capital_loc_id,l.population,l.visibility_mode,l.map_id,l.map_feature_id,p.name AS parent_name,o.name AS owner_name,c.name AS capital_name FROM locations l LEFT JOIN locations p ON p.loc_id=l.parent_loc_id AND p.camp_id=l.camp_id LEFT JOIN npcs o ON o.n_id=l.owner_n_id AND o.camp_id=l.camp_id LEFT JOIN locations c ON c.loc_id=l.capital_loc_id AND c.camp_id=l.camp_id`;
const locationListSelect=`SELECT l.loc_id,l.name,
  CASE WHEN l.coat_of_arm ~ '^/api/media/[0-9]+$' THEN '/api/admin/projects/'||l.camp_id||'/entity-images/location/'||l.loc_id||'/avatar' ELSE l.coat_of_arm END AS coat_of_arm,
  l.parent_loc_id,l.location_type,l.location_kind,l.slug,NULL::text AS description,l.owner_n_id,l.capital_loc_id,l.population,l.visibility_mode,l.map_id,l.map_feature_id,p.name AS parent_name,o.name AS owner_name,c.name AS capital_name
  FROM locations l LEFT JOIN locations p ON p.loc_id=l.parent_loc_id AND p.camp_id=l.camp_id LEFT JOIN npcs o ON o.n_id=l.owner_n_id AND o.camp_id=l.camp_id LEFT JOIN locations c ON c.loc_id=l.capital_loc_id AND c.camp_id=l.camp_id`;

function listFilter(projectId:number,filters:LocationListFilters={}){
  const values:unknown[]=[projectId];
  const where=["l.camp_id=$1","l.archived_at IS NULL"];
  if(filters.query?.trim()){
    values.push(`%${filters.query.trim()}%`);
    const p=`$${values.length}`;
    where.push(`(l.name ILIKE ${p} OR COALESCE(l.location_type,'') ILIKE ${p} OR l.location_kind ILIKE ${p} OR COALESCE(l.description,'') ILIKE ${p} OR COALESCE(l.slug,'') ILIKE ${p} OR COALESCE(p.name,'') ILIKE ${p} OR COALESCE(o.name,'') ILIKE ${p})`);
  }
  if(filters.visibility){values.push(filters.visibility);where.push(`l.visibility_mode=$${values.length}`);}
  if(filters.kind){values.push(filters.kind);where.push(`l.location_kind=$${values.length}`);}
  return{values,where};
}

async function validateReferences(projectId:number,parentLocId?:number|null,ownerNpcId?:number|null,capitalLocId?:number|null,mapId?:number|null,mapFeatureId?:number|null){
  if(parentLocId){const parent=await pool.query("SELECT 1 FROM locations WHERE camp_id=$1 AND loc_id=$2 AND archived_at IS NULL",[projectId,parentLocId]);if(parent.rowCount!==1)throw new Error("Parent location does not belong to this project.");}
  if(ownerNpcId){const owner=await pool.query("SELECT 1 FROM npcs WHERE camp_id=$1 AND n_id=$2 AND archived_at IS NULL",[projectId,ownerNpcId]);if(owner.rowCount!==1)throw new Error("Owner does not belong to this project.");}
  if(capitalLocId){const capital=await pool.query("SELECT 1 FROM locations WHERE camp_id=$1 AND loc_id=$2 AND archived_at IS NULL",[projectId,capitalLocId]);if(capital.rowCount!==1)throw new Error("Capital does not belong to this project.");}
  if(mapId){const map=await pool.query("SELECT 1 FROM project_maps WHERE project_id=$1 AND map_id=$2",[projectId,mapId]);if(map.rowCount!==1)throw new Error("Map does not belong to this project.");}
  if(mapFeatureId){
    const feature=await pool.query("SELECT map_id FROM map_features WHERE project_id=$1 AND feature_id=$2",[projectId,mapFeatureId]);
    if(feature.rowCount!==1)throw new Error("Map feature does not belong to this project.");
    if(mapId&&Number(feature.rows[0].map_id)!==mapId)throw new Error("Map feature does not belong to the selected map.");
  }
}

async function assertNoHierarchyCycle(projectId:number,locationId:number,parentLocId?:number|null){
  if(!parentLocId)return;
  if(parentLocId===locationId)throw new Error("A location cannot be its own parent.");
  const cycle=await pool.query(`
    WITH RECURSIVE descendants(loc_id) AS (
      SELECT loc_id FROM locations WHERE camp_id=$1 AND parent_loc_id=$2 AND archived_at IS NULL
      UNION
      SELECT l.loc_id FROM locations l JOIN descendants d ON l.parent_loc_id=d.loc_id WHERE l.camp_id=$1 AND l.archived_at IS NULL
    )
    SELECT 1 FROM descendants WHERE loc_id=$3 LIMIT 1
  `,[projectId,locationId,parentLocId]);
  if(cycle.rowCount)throw new Error("This parent would create a location hierarchy cycle.");
}

export async function listLocations(projectId:number){const result=await pool.query<LocationListItem>(`${locationSelect} WHERE l.camp_id=$1 AND l.archived_at IS NULL ORDER BY l.location_kind,l.name,l.loc_id`,[projectId]);return result.rows;}
export async function listLocationsPaginated(projectId:number,filters:LocationListFilters,pagination:Pagination){const {values,where}=listFilter(projectId,filters);const count=await pool.query<{total:number}>(`SELECT count(*)::int AS total FROM locations l LEFT JOIN locations p ON p.loc_id=l.parent_loc_id AND p.camp_id=l.camp_id LEFT JOIN npcs o ON o.n_id=l.owner_n_id AND o.camp_id=l.camp_id WHERE ${where.join(" AND ")}`,values);const total=count.rows[0]?.total??0;const page=clampPagination(total,pagination);const pageValues=[...values,page.limit,page.offset];const rows=await pool.query<LocationListItem>(`${locationListSelect} WHERE ${where.join(" AND ")} ORDER BY l.location_kind,l.name,l.loc_id LIMIT $${pageValues.length-1} OFFSET $${pageValues.length}`,pageValues);return paginatedResult(rows.rows,total,page);}
export async function getLocation(projectId:number,locationId:number){const result=await pool.query<LocationListItem>(`${locationSelect} WHERE l.camp_id=$1 AND l.loc_id=$2 AND l.archived_at IS NULL`,[projectId,locationId]);return result.rows[0]??null;}

export async function getLocationPath(projectId:number,locationId:number){
  const result=await pool.query<{loc_id:number;name:string;location_kind:LocationKind;depth:number}>(`
    WITH RECURSIVE path AS (
      SELECT loc_id,name,location_kind,parent_loc_id,0 AS depth,ARRAY[loc_id]::int[] AS visited
        FROM locations
       WHERE camp_id=$1 AND loc_id=$2 AND archived_at IS NULL
      UNION ALL
      SELECT p.loc_id,p.name,p.location_kind,p.parent_loc_id,path.depth+1,path.visited||p.loc_id
        FROM locations p
        JOIN path ON path.parent_loc_id=p.loc_id
       WHERE p.camp_id=$1
         AND p.archived_at IS NULL
         AND NOT p.loc_id=ANY(path.visited)
    )
    SELECT loc_id,name,location_kind,depth FROM path ORDER BY depth DESC
  `,[projectId,locationId]);
  return result.rows;
}

export async function createLocation(projectId:number,input:unknown){const data=locationSchema.parse(input);await validateReferences(projectId,data.parentLocId,data.ownerNpcId,data.capitalLocId,data.mapId,data.mapFeatureId);const result=await pool.query<{loc_id:number}>(`INSERT INTO locations(camp_id,name,coat_of_arm,parent_loc_id,location_type,location_kind,slug,description,owner_n_id,capital_loc_id,population,visibility_mode,map_id,map_feature_id,metadata,updated_at) SELECT c.camp_id,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'{}'::jsonb,now() FROM campaigns c WHERE c.camp_id=$1 AND c.status<>'archived' RETURNING loc_id`,[projectId,data.name,data.coatOfArm||null,data.parentLocId||null,data.locationType||null,data.locationKind,data.slug||null,data.description||null,data.ownerNpcId||null,data.capitalLocId||null,data.population??null,data.visibilityMode,data.mapId??null,data.mapFeatureId??null]);if(result.rowCount!==1)throw new Error("Project not found or archived.");return result.rows[0].loc_id;}
export async function updateLocation(projectId:number,locationId:number,input:unknown){const data=locationSchema.parse(input);await assertNoHierarchyCycle(projectId,locationId,data.parentLocId);if(data.capitalLocId===locationId)throw new Error("A location cannot be its own capital.");await validateReferences(projectId,data.parentLocId,data.ownerNpcId,data.capitalLocId,data.mapId,data.mapFeatureId);const result=await pool.query(`UPDATE locations SET name=$3,coat_of_arm=$4,parent_loc_id=$5,location_type=$6,location_kind=$7,slug=$8,description=$9,owner_n_id=$10,capital_loc_id=$11,population=$12,visibility_mode=$13,map_id=$14,map_feature_id=$15,updated_at=now() WHERE camp_id=$1 AND loc_id=$2 AND archived_at IS NULL`,[projectId,locationId,data.name,data.coatOfArm||null,data.parentLocId||null,data.locationType||null,data.locationKind,data.slug||null,data.description||null,data.ownerNpcId||null,data.capitalLocId||null,data.population??null,data.visibilityMode,data.mapId??null,data.mapFeatureId??null]);if(result.rowCount!==1)throw new Error("Location not found in this project.");}
export async function archiveLocation(projectId:number,locationId:number){const result=await pool.query(`UPDATE locations SET archived_at=now(),updated_at=now() WHERE camp_id=$1 AND loc_id=$2 AND archived_at IS NULL`,[projectId,locationId]);if(result.rowCount!==1)throw new Error("Location not found in this project.");}
export async function getLocationTree(projectId:number){return listLocations(projectId);}
