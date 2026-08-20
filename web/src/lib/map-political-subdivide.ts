import "server-only";

import type { PoolClient } from "pg";
import { z } from "zod";
import { autoSubdividePolygon } from "@/components/map/map-auto-subdivide";
import { defaultFeaturePresentationStyle, generatePoliticalPalette, normalizeHexColor, type PoliticalPaletteMode } from "@/components/map/map-feature-presentation";
import { pool } from "@/lib/db";

const subdivisionInputSchema = z.object({
  targetKind: z.enum(["region", "province", "district"]),
  count: z.coerce.number().int().min(2).max(24),
  seed: z.coerce.number().int().min(1).max(2_147_483_647).default(1),
  irregularity: z.coerce.number().min(0).max(1).default(0.7),
  balance: z.coerce.number().min(0).max(1).default(0.82),
  namePrefix: z.string().trim().min(1).max(160),
  paletteMode: z.enum(["parent", "harmonious", "contrast", "single"]).default("parent"),
  colorSeed: z.coerce.number().int().min(1).max(2_147_483_647).default(1),
  colors: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).max(24).default([]),
});

type JsonGeometry = { type: string; coordinates: unknown };
type Coordinate = [number, number];
type TargetKind = "region" | "province" | "district";
type ParentRow = {
  feature_id: string;
  layer_id: string;
  entity_id: string;
  label: string;
  geometry: JsonGeometry;
  visibility_mode: "admin_only" | "all_players" | "selected_players";
  style: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  location_kind: string;
};

type GeneratedPart = { name: string; geometry: JsonGeometry; color: string };

const CHILD_KIND_LABEL: Record<TargetKind, string> = {
  region: "Region",
  province: "Provinz",
  district: "Bezirk",
};

const ALLOWED_TARGETS: Record<string, TargetKind[]> = {
  country: ["region", "province"],
  region: ["province", "district"],
  province: ["district"],
};

function isLocked(row: ParentRow) { return row.metadata?.editorLocked === true; }

function readRing(value: unknown): Coordinate[] | null {
  if (!Array.isArray(value)) return null;
  const result: Coordinate[] = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length < 2) return null;
    const x = Number(item[0]), y = Number(item[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    result.push([x, y]);
  }
  return result.length >= 4 ? result : null;
}
function readPolygon(value: unknown) {
  if (!Array.isArray(value)) return null;
  const rings = value.map(readRing);
  return rings.length && rings.every(Boolean) ? rings as Coordinate[][] : null;
}
function polygonsFromGeometry(geometry: JsonGeometry) {
  if (geometry.type === "Polygon") { const polygon = readPolygon(geometry.coordinates); return polygon ? [polygon] : []; }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) return geometry.coordinates.map(readPolygon).filter((value): value is Coordinate[][] => Boolean(value));
  return [];
}
function pointInRing(point: Coordinate, ring: Coordinate[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i], b = ring[j];
    const crosses = ((a[1] > point[1]) !== (b[1] > point[1])) && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / ((b[1] - a[1]) || 1e-12) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}
function pointInGeometry(point: Coordinate, geometry: JsonGeometry) {
  for (const polygon of polygonsFromGeometry(geometry)) {
    if (!polygon[0] || !pointInRing(point, polygon[0])) continue;
    let insideHole = false;
    for (let index = 1; index < polygon.length; index += 1) if (pointInRing(point, polygon[index])) { insideHole = true; break; }
    if (!insideHole) return true;
  }
  return false;
}
function pointFromGeometry(geometry: JsonGeometry): Coordinate | null {
  if (geometry.type !== "Point" || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) return null;
  const x = Number(geometry.coordinates[0]), y = Number(geometry.coordinates[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

async function createChildArea(client: PoolClient, options: {
  projectId: number;
  mapId: number;
  layerId: number;
  parentLocationId: number;
  parentFeatureId: number;
  visibilityMode: ParentRow["visibility_mode"];
  targetKind: TargetKind;
  part: GeneratedPart;
  generation: { seed: number; irregularity: number; balance: number; index: number; total: number; paletteMode: PoliticalPaletteMode; colorSeed: number };
}) {
  const location = await client.query<{ loc_id: number }>(
    `INSERT INTO locations(camp_id,name,parent_loc_id,location_type,location_kind,description,visibility_mode,map_id,metadata,updated_at)
     VALUES($1,$2,$3,$4,$5,NULL,$6,$7,$8::jsonb,now())
     RETURNING loc_id`,
    [options.projectId, options.part.name, options.parentLocationId, CHILD_KIND_LABEL[options.targetKind], options.targetKind, options.visibilityMode, options.mapId, JSON.stringify({ created_from_map_editor: true, created_from_auto_subdivision: true })],
  );
  const locationId = location.rows[0].loc_id;
  const metadata = {
    createdIn: "auto-subdivision-v2",
    tool: options.targetKind === "province" ? "province" : options.targetKind === "region" ? "region" : "district",
    parentLocationId: options.parentLocationId,
    sourceParentFeatureId: options.parentFeatureId,
    geometryConformance: "automatic-parent-partition",
    editorLocked: false,
    autoSubdivision: options.generation,
  };
  const style = defaultFeaturePresentationStyle(options.targetKind, options.part.color, options.part.geometry.type);
  const feature = await client.query<{ feature_id: string }>(
    `INSERT INTO map_features(project_id,map_id,layer_id,geometry_type,geometry,entity_type,entity_id,label,short_description,visibility_mode,style,metadata)
     VALUES($1,$2,$3,$4,$5::jsonb,'location',$6,$7,NULL,$8,$9::jsonb,$10::jsonb)
     RETURNING feature_id`,
    [options.projectId, options.mapId, options.layerId, options.part.geometry.type, JSON.stringify(options.part.geometry), locationId, options.part.name, options.visibilityMode, JSON.stringify(style), JSON.stringify(metadata)],
  );
  const featureId = Number(feature.rows[0].feature_id);
  await client.query("UPDATE locations SET map_id=$3,map_feature_id=$4,updated_at=now() WHERE camp_id=$1 AND loc_id=$2", [options.projectId, locationId, options.mapId, featureId]);
  if (options.visibilityMode === "selected_players") {
    await client.query(
      `INSERT INTO map_feature_visibility(feature_id,player_id,visible)
       SELECT $1,player_id,visible FROM map_feature_visibility WHERE feature_id=$2
       ON CONFLICT(feature_id,player_id) DO UPDATE SET visible=EXCLUDED.visible`,
      [featureId, options.parentFeatureId],
    );
  }
  return { featureId, locationId, name: options.part.name, geometry: options.part.geometry };
}

export async function autoSubdividePoliticalFeature(projectId: number, mapId: number, featureId: number, input: unknown) {
  const data = subdivisionInputSchema.parse(input);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const parentResult = await client.query<ParentRow>(
      `SELECT f.feature_id,f.layer_id,f.entity_id,f.label,f.geometry,f.visibility_mode,f.style,f.metadata,loc.location_kind
         FROM map_features f
         JOIN locations loc ON f.entity_type='location' AND loc.loc_id=f.entity_id AND loc.camp_id=f.project_id AND loc.archived_at IS NULL
         JOIN project_map_layers l ON l.layer_id=f.layer_id AND l.project_id=f.project_id AND l.map_id=f.map_id AND l.layer_type='vector'
        WHERE f.project_id=$1 AND f.map_id=$2 AND f.feature_id=$3 AND f.geometry_type IN ('Polygon','MultiPolygon')
        FOR UPDATE OF f,loc`,
      [projectId, mapId, featureId],
    );
    if (parentResult.rowCount !== 1) throw new Error("Die ausgewählte Fläche wurde nicht gefunden oder ist keine unterteilbare Polygonfläche.");
    const parent = parentResult.rows[0];
    if (isLocked(parent)) throw new Error(`„${parent.label}“ ist gesperrt. Entsperre die Fläche zuerst.`);
    if (!(ALLOWED_TARGETS[parent.location_kind] ?? []).includes(data.targetKind)) {
      throw new Error(`${CHILD_KIND_LABEL[data.targetKind]} ist keine gültige Unterteilung für ${parent.location_kind}.`);
    }
    const parentLocationId = Number(parent.entity_id), layerId = Number(parent.layer_id);
    if (!Number.isSafeInteger(parentLocationId) || !Number.isSafeInteger(layerId)) throw new Error("Ungültige Kartenverknüpfung.");

    const polygonChildren = await client.query<{ name: string }>(
      `SELECT child.name
         FROM locations child
         JOIN map_features cf ON cf.feature_id=child.map_feature_id AND cf.project_id=child.camp_id AND cf.map_id=$3
        WHERE child.camp_id=$1 AND child.parent_loc_id=$2 AND child.archived_at IS NULL
          AND cf.geometry_type IN ('Polygon','MultiPolygon')
        ORDER BY child.name
        LIMIT 6`,
      [projectId, parentLocationId, mapId],
    );
    if (polygonChildren.rowCount) {
      throw new Error(`Dieses Gebiet besitzt bereits gezeichnete Unterflächen (${polygonChildren.rows.map((row) => row.name).join(", ")}). Entferne oder ordne sie zuerst neu, damit keine Flächen überlappen.`);
    }

    const generated = autoSubdividePolygon(parent.geometry, {
      count: data.count,
      seed: data.seed,
      irregularity: data.irregularity,
      balance: data.balance,
      maxSide: 520,
    });
    if (!generated || generated.parts.length !== data.count) throw new Error("Für diese Form konnte keine stabile automatische Unterteilung erzeugt werden. Versuche weniger Teilgebiete oder eine andere Verteilung.");

    const fallbackPalette = generatePoliticalPalette({
      baseColor: normalizeHexColor(parent.style?.fill, "#7c6ee6"),
      count: data.count,
      mode: data.paletteMode,
      seed: data.colorSeed,
    });
    const parts: GeneratedPart[] = generated.parts.map((geometry, index) => ({
      name: `${data.namePrefix} ${index + 1}`,
      geometry,
      color: data.colors[index] ?? fallbackPalette[index],
    }));

    const created: Array<{ featureId: number; locationId: number; name: string; geometry: JsonGeometry }> = [];
    for (let index = 0; index < parts.length; index += 1) {
      created.push(await createChildArea(client, {
        projectId, mapId, layerId, parentLocationId, parentFeatureId: featureId, visibilityMode: parent.visibility_mode,
        targetKind: data.targetKind,
        part: parts[index],
        generation: { seed: data.seed, irregularity: data.irregularity, balance: data.balance, index, total: parts.length, paletteMode: data.paletteMode, colorSeed: data.colorSeed },
      }));
    }

    const pointChildren = await client.query<{ loc_id: number; geometry: JsonGeometry }>(
      `SELECT child.loc_id,cf.geometry
         FROM locations child
         JOIN map_features cf ON cf.feature_id=child.map_feature_id AND cf.project_id=child.camp_id AND cf.map_id=$3
        WHERE child.camp_id=$1 AND child.parent_loc_id=$2 AND child.archived_at IS NULL
          AND cf.geometry_type='Point'`,
      [projectId, parentLocationId, mapId],
    );
    let reassigned = 0;
    for (const child of pointChildren.rows) {
      const point = pointFromGeometry(child.geometry); if (!point) continue;
      const owner = created.find((area) => pointInGeometry(point, area.geometry)); if (!owner) continue;
      await client.query("UPDATE locations SET parent_loc_id=$3,updated_at=now() WHERE camp_id=$1 AND loc_id=$2", [projectId, child.loc_id, owner.locationId]);
      reassigned += 1;
    }

    await client.query("COMMIT");
    return { targetKind: data.targetKind, created: created.map(({ geometry: _geometry, ...area }) => area), reassigned, seed: generated.seed, colorSeed: data.colorSeed, paletteMode: data.paletteMode };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
