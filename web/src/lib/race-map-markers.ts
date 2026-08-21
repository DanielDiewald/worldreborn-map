import "server-only";

import { pool } from "@/lib/db";
import { normalizeEntityImageCrop } from "@/lib/entity-image-crop";
import { imageReferenceUsesAvatarDerivative } from "@/lib/entity-image-source";
import type { WorldMapMarker } from "@/components/map/map-types";

type RaceOriginRow = {
  race_id: string | number;
  name: string;
  parent_name: string | null;
  description: string | null;
  image: string | null;
  crop_source_image: string | null;
  crop: unknown;
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
            pic.source_image AS crop_source_image,pic.crop,
            r.origin_coordinate_mode,r.origin_x,r.origin_y,r.origin_lat,r.origin_lng
       FROM races r
       LEFT JOIN races p
         ON p.project_id=r.project_id AND p.race_id=r.parent_race_id AND p.archived_at IS NULL
       LEFT JOIN entity_image_crops pic
         ON pic.project_id=r.project_id AND pic.entity_type='race' AND pic.entity_id=r.race_id
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
    const original = previewImage(race.image);
    const usesDerivative = imageReferenceUsesAvatarDerivative(original);
    const image = usesDerivative ? `/api/admin/projects/${projectId}/entity-images/race/${raceId}/avatar` : original;
    const crop = !usesDerivative && original && race.crop_source_image === original ? normalizeEntityImageCrop(race.crop) : null;
    return {
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
      icon: image,
      // Persistent derivatives already contain the saved 1:1 crop. External images still use
      // client-side crop metadata because WorldReborn never downloads arbitrary remote URLs.
      image_crop: crop,
      label: hierarchy,
      short_description: description ? `${kind} · ${description.slice(0, 220)}` : `${kind} · ungefährer Ursprung`,
      layer: "species_origins",
      z_index: 15000,
      href: `/admin/projects/${projectId}/races/${raceId}`,
    };
  });
}
