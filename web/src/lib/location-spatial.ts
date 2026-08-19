import "server-only";

import { pool } from "@/lib/db";
import type { LocationKind } from "@/lib/entities/locations";

export type LocationSpatialSummary = {
  childCount: number;
  descendantCount: number;
  directNpcCount: number;
  descendantNpcCount: number;
  countryCount: number;
  regionCount: number;
  provinceCount: number;
  settlementCount: number;
};

export async function getLocationSpatialSummary(projectId: number, locationId: number): Promise<LocationSpatialSummary> {
  const result = await pool.query<{
    child_count: number;
    descendant_count: number;
    direct_npc_count: number;
    descendant_npc_count: number;
    country_count: number;
    region_count: number;
    province_count: number;
    settlement_count: number;
  }>(`
    WITH RECURSIVE tree AS (
      SELECT loc_id,location_kind,0 AS depth
        FROM locations
       WHERE camp_id=$1 AND loc_id=$2 AND archived_at IS NULL
      UNION
      SELECT l.loc_id,l.location_kind,t.depth+1
        FROM locations l
        JOIN tree t ON l.parent_loc_id=t.loc_id
       WHERE l.camp_id=$1 AND l.archived_at IS NULL
    )
    SELECT
      (SELECT COUNT(*)::int FROM locations l WHERE l.camp_id=$1 AND l.parent_loc_id=$2 AND l.archived_at IS NULL) AS child_count,
      (SELECT COUNT(*)::int FROM tree WHERE depth>0) AS descendant_count,
      (SELECT COUNT(*)::int FROM charakters c JOIN npcs n ON n.n_id=c.n_id WHERE n.camp_id=$1 AND n.archived_at IS NULL AND c.loc_id=$2) AS direct_npc_count,
      (SELECT COUNT(*)::int FROM charakters c JOIN npcs n ON n.n_id=c.n_id JOIN tree t ON t.loc_id=c.loc_id WHERE n.camp_id=$1 AND n.archived_at IS NULL) AS descendant_npc_count,
      (SELECT COUNT(*)::int FROM tree WHERE depth>0 AND location_kind='country') AS country_count,
      (SELECT COUNT(*)::int FROM tree WHERE depth>0 AND location_kind='region') AS region_count,
      (SELECT COUNT(*)::int FROM tree WHERE depth>0 AND location_kind='province') AS province_count,
      (SELECT COUNT(*)::int FROM tree WHERE depth>0 AND location_kind IN ('city','town','village')) AS settlement_count
  `, [projectId, locationId]);
  const row = result.rows[0];
  return {
    childCount: row?.child_count ?? 0,
    descendantCount: row?.descendant_count ?? 0,
    directNpcCount: row?.direct_npc_count ?? 0,
    descendantNpcCount: row?.descendant_npc_count ?? 0,
    countryCount: row?.country_count ?? 0,
    regionCount: row?.region_count ?? 0,
    provinceCount: row?.province_count ?? 0,
    settlementCount: row?.settlement_count ?? 0,
  };
}

export async function listLocationChildren(projectId: number, locationId: number, limit = 20) {
  const result = await pool.query<{
    loc_id: number;
    name: string;
    location_kind: LocationKind;
    map_id: string | null;
    map_feature_id: string | null;
  }>(`
    SELECT loc_id,name,location_kind,map_id,map_feature_id
      FROM locations
     WHERE camp_id=$1 AND parent_loc_id=$2 AND archived_at IS NULL
     ORDER BY CASE location_kind
       WHEN 'country' THEN 1 WHEN 'region' THEN 2 WHEN 'province' THEN 3
       WHEN 'city' THEN 4 WHEN 'town' THEN 5 WHEN 'village' THEN 6
       WHEN 'district' THEN 7 WHEN 'building' THEN 8 ELSE 9 END,
       name,loc_id
     LIMIT $3
  `, [projectId, locationId, Math.max(1, Math.min(100, limit))]);
  return result.rows;
}
