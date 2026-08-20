import "server-only";

import { pool } from "@/lib/db";
import type { WorldMapMarker } from "@/components/map/map-types";

type RaceOriginRow = {
  race_id: string | number;
  name: string;
  parent_name: string | null;
  description: string | null;
  image: string | null;
  origin_coordinate_mode: "xy" | "latlng" | null;
  origin_x: number | null;
  origin_y: number | null;
  origin_lat: number | null;
  origin_lng: number | null;
};

function previewImage(value: string | null) {
  const image = value?.trim();
  if (!image || image === "noimage" || image === "/noimg.jpg") return null;
  return image;
}

export async function listRaceOriginMarkers(projectId: number, mapId: number): Promise<WorldMapMarker[]> {
  const result = await pool.query<RaceOriginRow>(
    `SELECT r.race_id,r.name,p.name AS parent_name,r.description,r.image,
            r.origin_coordinate_mode,r.origin_x,r.origin_y,r.origin_lat,r.origin_lng
       FROM races r
       LEFT JOIN races p
         ON p.project_id=r.project_id AND p.race_id=r.parent_race_id AND p.archived_at IS NULL
      WHERE r.project_id=$1
        AND r.origin_map_id=$2
        AND r.archived_at IS NULL
        AND r.is_unknown=false
        AND r.origin_coordinate_mode IS NOT NULL
      ORDER BY CASE WHEN r.parent_race_id IS NULL THEN 0 ELSE 1 END,COALESCE(p.name,r.name),r.name,r.race_id`,
    [projectId, mapId],
  );

  return result.rows.map((race) => {
    const raceId = Number(race.race_id);
    const hierarchy = race.parent_name ? `${race.parent_name} → ${race.name}` : race.name;
    const kind = race.parent_name ? "Subspezies" : "Spezies";
    const description = race.description?.trim();
    return {
      // Database marker ids are positive. Negative ids reserve a collision-free transient namespace
      // for species origins without duplicating them into map_markers.
      marker_id: -raceId,
      marker_type: "species",
      entity_type: "race",
      entity_id: raceId,
      entity_label: hierarchy,
      entity_kind: kind,
      coordinate_mode: race.origin_coordinate_mode ?? "xy",
      lat: race.origin_lat == null ? null : Number(race.origin_lat),
      lng: race.origin_lng == null ? null : Number(race.origin_lng),
      x: race.origin_x == null ? null : Number(race.origin_x),
      y: race.origin_y == null ? null : Number(race.origin_y),
      icon: previewImage(race.image),
      label: hierarchy,
      short_description: description ? `${kind} · ${description.slice(0, 220)}` : `${kind} · ungefährer Ursprung`,
      layer: "species_origins",
      z_index: 15000,
      href: `/admin/projects/${projectId}/races/${raceId}`,
    };
  });
}
