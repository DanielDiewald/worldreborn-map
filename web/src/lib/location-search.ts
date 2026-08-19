import "server-only";

import { pool } from "@/lib/db";
import { LOCATION_KINDS, type LocationKind } from "@/lib/entities/locations";
import { allowedParentKinds } from "@/lib/location-presentation";

export type LocationSearchItem = {
  id: number;
  name: string;
  kind: LocationKind;
  parentName: string | null;
  grandparentName: string | null;
  pathLabel: string;
};

export async function searchLocationsForParent(projectId: number, query: string, parentFor?: LocationKind | null, limit = 20) {
  const term = query.trim().slice(0, 120);
  const like = `%${term}%`;
  const kinds = parentFor && LOCATION_KINDS.includes(parentFor) ? allowedParentKinds(parentFor) : [...LOCATION_KINDS];
  if (!kinds.length) return [];
  const result = await pool.query<{
    id:number;name:string;kind:LocationKind;parentName:string|null;grandparentName:string|null;
  }>(`
    SELECT l.loc_id::int AS id,
           l.name,
           l.location_kind AS kind,
           p.name AS "parentName",
           gp.name AS "grandparentName"
      FROM locations l
      LEFT JOIN locations p ON p.camp_id=l.camp_id AND p.loc_id=l.parent_loc_id AND p.archived_at IS NULL
      LEFT JOIN locations gp ON gp.camp_id=l.camp_id AND gp.loc_id=p.parent_loc_id AND gp.archived_at IS NULL
     WHERE l.camp_id=$1
       AND l.archived_at IS NULL
       AND l.location_kind=ANY($4::text[])
       AND ($2='' OR l.name ILIKE $3 OR COALESCE(p.name,'') ILIKE $3 OR COALESCE(gp.name,'') ILIKE $3 OR COALESCE(l.location_type,'') ILIKE $3)
     ORDER BY CASE WHEN $2<>'' AND lower(l.name)=lower($2) THEN 0 WHEN $2<>'' AND l.name ILIKE ($2 || '%') THEN 1 ELSE 2 END,
              l.name,l.loc_id
     LIMIT $5
  `,[projectId,term,like,kinds,Math.max(1,Math.min(30,limit))]);
  return result.rows.map((row)=>({
    ...row,
    pathLabel:[row.grandparentName,row.parentName,row.name].filter(Boolean).join(" › "),
  })) as LocationSearchItem[];
}
