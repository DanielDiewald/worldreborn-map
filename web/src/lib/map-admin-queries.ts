import "server-only";

import { pool } from "@/lib/db";
import { clampPagination, paginatedResult, type Pagination } from "@/lib/pagination";

export type MapAdminFilters={query?:string};
export type MarkerAdminFilters={query?:string;markerType?:string;layer?:string;visibilityMode?:string};

export async function listProjectMapsPaginated(projectId:number,filters:MapAdminFilters,pagination:Pagination){
  const query=(filters.query??"").trim().slice(0,120);
  const like=`%${query}%`;
  const count=await pool.query<{count:string}>(
    `SELECT COUNT(*)::text AS count
       FROM project_maps
      WHERE project_id=$1
        AND ($2='' OR name ILIKE $3 OR map_type ILIKE $3 OR COALESCE(config->>'map_kind','') ILIKE $3)`,
    [projectId,query,like],
  );
  const total=Number(count.rows[0]?.count??0);
  const page=clampPagination(total,pagination);
  const result=await pool.query<{
    map_id:number;
    name:string;
    map_type:"tile"|"image";
    tile_url:string|null;
    image_path:string|null;
    min_zoom:number;
    max_zoom:number;
    center_lat:number|null;
    center_lng:number|null;
    config:Record<string,unknown>;
    is_primary:boolean;
    marker_count:number;
    layer_count:number;
    rock3_layer_count:number;
    feature_count:number;
    country_count:number;
    location_count:number;
  }>(
    `SELECT pm.map_id,
            pm.name,
            pm.map_type,
            pm.tile_url,
            pm.image_path,
            pm.min_zoom,
            pm.max_zoom,
            pm.center_lat,
            pm.center_lng,
            pm.config,
            pm.is_primary,
            (SELECT COUNT(*)::int FROM map_markers mm WHERE mm.project_id=pm.project_id AND mm.map_id=pm.map_id) AS marker_count,
            (SELECT COUNT(*)::int FROM project_map_layers ml WHERE ml.project_id=pm.project_id AND ml.map_id=pm.map_id) AS layer_count,
            (SELECT COUNT(*)::int FROM project_map_layers ml WHERE ml.project_id=pm.project_id AND ml.map_id=pm.map_id AND COALESCE((ml.config->>'rock3')::boolean,false)) AS rock3_layer_count,
            (SELECT COUNT(*)::int FROM map_features mf WHERE mf.project_id=pm.project_id AND mf.map_id=pm.map_id) AS feature_count,
            (SELECT COUNT(*)::int FROM locations l WHERE l.camp_id=pm.project_id AND l.map_id=pm.map_id AND l.location_kind='country' AND l.archived_at IS NULL) AS country_count,
            (SELECT COUNT(*)::int FROM locations l WHERE l.camp_id=pm.project_id AND l.map_id=pm.map_id AND l.archived_at IS NULL) AS location_count
       FROM project_maps pm
      WHERE pm.project_id=$1
        AND ($2='' OR pm.name ILIKE $3 OR pm.map_type ILIKE $3 OR COALESCE(pm.config->>'map_kind','') ILIKE $3)
      ORDER BY pm.is_primary DESC,pm.name,pm.map_id
      LIMIT $4 OFFSET $5`,
    [projectId,query,like,page.limit,page.offset],
  );
  return paginatedResult(result.rows,total,page);
}

export async function listMapMarkersPaginated(projectId:number,mapId:number,filters:MarkerAdminFilters,pagination:Pagination){
  const query=(filters.query??"").trim().slice(0,120);
  const markerType=(filters.markerType??"").trim().slice(0,80);
  const layer=(filters.layer??"").trim().slice(0,80);
  const visibilityMode=(filters.visibilityMode??"").trim().slice(0,40);
  const like=`%${query}%`;
  const params=[projectId,mapId,query,like,markerType,layer,visibilityMode] as const;
  const where=`m.project_id=$1 AND m.map_id=$2
        AND ($3='' OR m.label ILIKE $4 OR COALESCE(m.short_description,'') ILIKE $4 OR m.layer ILIKE $4 OR m.marker_type ILIKE $4
             OR COALESCE(n.name,l.name,g.name,e.name,'') ILIKE $4)
        AND ($5='' OR m.marker_type=$5)
        AND ($6='' OR m.layer=$6)
        AND ($7='' OR m.visibility_mode=$7)`;
  const joins=`LEFT JOIN npcs n ON m.entity_type='person' AND n.camp_id=m.project_id AND n.n_id=m.entity_id
       LEFT JOIN locations l ON m.entity_type='location' AND l.camp_id=m.project_id AND l.loc_id=m.entity_id
       LEFT JOIN groups g ON m.entity_type='group' AND g.camp_id=m.project_id AND g.gr_id=m.entity_id
       LEFT JOIN events e ON m.entity_type='event' AND e.camp_id=m.project_id AND e.e_id=m.entity_id`;
  const count=await pool.query<{count:string}>(
    `SELECT COUNT(*)::text AS count FROM map_markers m ${joins} WHERE ${where}`,
    [...params],
  );
  const total=Number(count.rows[0]?.count??0);
  const page=clampPagination(total,pagination);
  const result=await pool.query<{
    marker_id:number;
    marker_type:string;
    entity_type:string|null;
    entity_id:number|null;
    entity_label:string|null;
    coordinate_mode:"latlng"|"xy";
    lat:number|null;
    lng:number|null;
    x:number|null;
    y:number|null;
    label:string;
    short_description:string|null;
    visibility_mode:string;
    layer:string;
    z_index:number;
  }>(
    `SELECT m.marker_id,
            m.marker_type,
            m.entity_type,
            m.entity_id,
            COALESCE(n.name,l.name,g.name,e.name) AS entity_label,
            m.coordinate_mode,
            m.lat,
            m.lng,
            m.x,
            m.y,
            m.label,
            m.short_description,
            m.visibility_mode,
            m.layer,
            m.z_index
       FROM map_markers m
       ${joins}
      WHERE ${where}
      ORDER BY m.layer,m.z_index,m.label,m.marker_id
      LIMIT $8 OFFSET $9`,
    [...params,page.limit,page.offset],
  );
  return paginatedResult(result.rows,total,page);
}

export async function listMapMarkerFilterOptions(projectId:number,mapId:number){
  const [types,layers]=await Promise.all([
    pool.query<{value:string}>(`SELECT DISTINCT marker_type AS value FROM map_markers WHERE project_id=$1 AND map_id=$2 ORDER BY marker_type`,[projectId,mapId]),
    pool.query<{value:string}>(`SELECT DISTINCT layer AS value FROM map_markers WHERE project_id=$1 AND map_id=$2 ORDER BY layer`,[projectId,mapId]),
  ]);
  return {markerTypes:types.rows.map((row)=>row.value),layers:layers.rows.map((row)=>row.value)};
}
