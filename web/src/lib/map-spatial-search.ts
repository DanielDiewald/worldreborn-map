import "server-only";

import { pool } from "@/lib/db";

export type SpatialMapSearchItem = {
  kind: "location" | "person" | "feature" | "marker";
  id: number;
  name: string;
  subtitle: string | null;
  featureId: number | null;
  markerId: number | null;
  href: string | null;
};

export async function searchAdminMapSpatialEntities(projectId: number, mapId: number, query: string, limit = 16) {
  const term = query.trim().slice(0, 120);
  if (!term) return [];
  const like = `%${term}%`;
  const boundedLimit = Math.max(1, Math.min(30, Math.trunc(limit)));

  const result = await pool.query<SpatialMapSearchItem>(`
    WITH candidates AS (
      SELECT 'location'::text AS kind,
             l.loc_id::int AS id,
             l.name,
             NULLIF(CONCAT_WS(' · ', NULLIF(l.location_type,''), p.name), '') AS subtitle,
             l.map_feature_id::bigint AS "featureId",
             NULL::bigint AS "markerId",
             ('/admin/projects/' || $1::text || '/locations/' || l.loc_id::text) AS href,
             0 AS priority
        FROM locations l
        LEFT JOIN locations p ON p.camp_id=l.camp_id AND p.loc_id=l.parent_loc_id
       WHERE l.camp_id=$1
         AND l.archived_at IS NULL
         AND l.map_id=$2
         AND l.map_feature_id IS NOT NULL
         AND (l.name ILIKE $4 OR COALESCE(l.location_type,'') ILIKE $4 OR COALESCE(p.name,'') ILIKE $4)

      UNION ALL

      SELECT 'person'::text,
             n.n_id::int,
             n.name,
             NULLIF(CONCAT_WS(' · ', l.name, NULLIF(c.race,'unknown'), NULLIF(n.title,'')), ''),
             l.map_feature_id::bigint,
             NULL::bigint,
             ('/admin/projects/' || $1::text || '/npcs/' || n.n_id::text),
             1
        FROM npcs n
        JOIN charakters c ON c.n_id=n.n_id
        JOIN locations l ON l.camp_id=n.camp_id AND l.loc_id=c.loc_id
       WHERE n.camp_id=$1
         AND n.archived_at IS NULL
         AND l.archived_at IS NULL
         AND l.map_id=$2
         AND l.map_feature_id IS NOT NULL
         AND (n.name ILIKE $4 OR COALESCE(n.title,'') ILIKE $4 OR l.name ILIKE $4)

      UNION ALL

      SELECT 'feature'::text,
             f.feature_id::int,
             f.label,
             NULLIF(f.short_description, ''),
             f.feature_id::bigint,
             NULL::bigint,
             CASE
               WHEN f.entity_type='location' AND f.entity_id IS NOT NULL
                 THEN '/admin/projects/' || $1::text || '/locations/' || f.entity_id::text
               WHEN f.entity_type='person' AND f.entity_id IS NOT NULL
                 THEN '/admin/projects/' || $1::text || '/npcs/' || f.entity_id::text
               ELSE NULL
             END,
             2
        FROM map_features f
       WHERE f.project_id=$1
         AND f.map_id=$2
         AND (f.label ILIKE $4 OR COALESCE(f.short_description,'') ILIKE $4)

      UNION ALL

      SELECT 'marker'::text,
             m.marker_id::int,
             COALESCE(n.name,l.name,g.name,e.name,m.label),
             NULLIF(CONCAT_WS(' · ', m.label, NULLIF(m.short_description,'')), ''),
             NULL::bigint,
             m.marker_id::bigint,
             CASE
               WHEN m.entity_type='person' AND m.entity_id IS NOT NULL
                 THEN '/admin/projects/' || $1::text || '/npcs/' || m.entity_id::text
               WHEN m.entity_type='location' AND m.entity_id IS NOT NULL
                 THEN '/admin/projects/' || $1::text || '/locations/' || m.entity_id::text
               WHEN m.entity_type='group' AND m.entity_id IS NOT NULL
                 THEN '/admin/projects/' || $1::text || '/groups/' || m.entity_id::text
               ELSE NULL
             END,
             3
        FROM map_markers m
        LEFT JOIN npcs n ON m.entity_type='person' AND n.camp_id=m.project_id AND n.n_id=m.entity_id
        LEFT JOIN locations l ON m.entity_type='location' AND l.camp_id=m.project_id AND l.loc_id=m.entity_id
        LEFT JOIN groups g ON m.entity_type='group' AND g.camp_id=m.project_id AND g.gr_id=m.entity_id
        LEFT JOIN events e ON m.entity_type='event' AND e.camp_id=m.project_id AND e.e_id=m.entity_id
       WHERE m.project_id=$1
         AND m.map_id=$2
         AND (m.label ILIKE $4 OR COALESCE(m.short_description,'') ILIKE $4 OR COALESCE(n.name,l.name,g.name,e.name,'') ILIKE $4)
    )
    SELECT kind,id,name,subtitle,"featureId","markerId",href
      FROM candidates
     ORDER BY CASE WHEN lower(name)=lower($3) THEN 0 WHEN name ILIKE ($3 || '%') THEN 1 ELSE 2 END,
              priority,
              name,
              id
     LIMIT $5
  `, [projectId, mapId, term, like, boundedLimit]);

  const seen = new Set<string>();
  return result.rows.filter((item) => {
    const key = `${item.kind}:${item.id}:${item.featureId ?? ""}:${item.markerId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
