import "server-only";

import { z } from "zod";
import { pool } from "@/lib/db";

type Coordinate = [number, number];
type Ring = Coordinate[];
type Polygon = Ring[];
type Geometry = { type: string; coordinates: unknown };
type PoliticalKind = "country" | "region" | "province";

type SemanticIdentity = {
  kind: PoliticalKind;
  parentLocationId: number | null;
};

type CandidateRow = {
  feature_id: string;
  label: string;
  geometry: Geometry;
};

const geometrySchema = z.object({
  type: z.enum(["Polygon", "MultiPolygon"]),
  coordinates: z.unknown(),
}).passthrough();

function closeRing(ring: Ring) {
  if (!ring.length) return ring;
  const first = ring[0], last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  return ring;
}

function readRing(value: unknown): Ring | null {
  if (!Array.isArray(value)) return null;
  const ring: Ring = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length < 2) return null;
    const x = Number(item[0]), y = Number(item[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    ring.push([x, y]);
  }
  return ring.length >= 4 ? closeRing(ring) : null;
}

function readPolygon(value: unknown): Polygon | null {
  if (!Array.isArray(value)) return null;
  const rings = value.map(readRing);
  return rings.length && rings.every(Boolean) ? rings as Polygon : null;
}

function polygons(geometry: Geometry): Polygon[] {
  if (geometry.type === "Polygon") {
    const polygon = readPolygon(geometry.coordinates);
    return polygon ? [polygon] : [];
  }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.map(readPolygon).filter((value): value is Polygon => Boolean(value));
  }
  return [];
}

function extentFor(a: Geometry, b: Geometry): [number, number, number, number] | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const geometry of [a, b]) for (const polygon of polygons(geometry)) for (const ring of polygon) for (const [x, y] of ring) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) return null;
  return [minX, minY, maxX, maxY];
}

function pointInRing(point: Coordinate, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i], b = ring[j];
    const crosses = ((a[1] > point[1]) !== (b[1] > point[1])) && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / ((b[1] - a[1]) || 1e-12) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInGeometry(point: Coordinate, geometry: Geometry) {
  for (const polygon of polygons(geometry)) {
    if (!polygon[0] || !pointInRing(point, polygon[0])) continue;
    let inHole = false;
    for (let index = 1; index < polygon.length; index += 1) if (pointInRing(point, polygon[index])) { inHole = true; break; }
    if (!inHole) return true;
  }
  return false;
}

function overlapCellCount(a: Geometry, b: Geometry, maxSide = 900) {
  const extent = extentFor(a, b); if (!extent) return 0;
  const widthWorld = Math.max(1e-9, extent[2] - extent[0]), heightWorld = Math.max(1e-9, extent[3] - extent[1]);
  const aspect = widthWorld / heightWorld;
  const width = aspect >= 1 ? maxSide : Math.max(180, Math.round(maxSide * aspect));
  const height = aspect >= 1 ? Math.max(180, Math.round(maxSide / aspect)) : maxSide;
  let overlap = 0;
  for (let y = 0; y < height; y += 1) {
    const py = extent[3] - ((y + 0.5) / height) * heightWorld;
    for (let x = 0; x < width; x += 1) {
      const px = extent[0] + ((x + 0.5) / width) * widthWorld;
      if (pointInGeometry([px, py], a) && pointInGeometry([px, py], b)) {
        overlap += 1;
        if (overlap >= 3) return overlap;
      }
    }
  }
  return overlap;
}

async function semanticIdentityForFeature(projectId: number, mapId: number, featureId: number): Promise<SemanticIdentity | null> {
  const result = await pool.query<{ location_kind: string | null; parent_loc_id: number | null }>(
    `SELECT loc.location_kind,loc.parent_loc_id
       FROM map_features f
       LEFT JOIN locations loc ON f.entity_type='location' AND loc.loc_id=f.entity_id AND loc.camp_id=f.project_id AND loc.archived_at IS NULL
      WHERE f.project_id=$1 AND f.map_id=$2 AND f.feature_id=$3`,
    [projectId, mapId, featureId],
  );
  const row = result.rows[0];
  if (!row || !["country", "region", "province"].includes(row.location_kind ?? "")) return null;
  return { kind: row.location_kind as PoliticalKind, parentLocationId: row.parent_loc_id };
}

async function semanticIdentityForCreate(projectId: number, input: unknown): Promise<SemanticIdentity | null> {
  const raw = input as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return null;
  const createLocation = raw.createLocation as Record<string, unknown> | null | undefined;
  if (createLocation && ["country", "region", "province"].includes(String(createLocation.kind ?? ""))) {
    const parent = Number(createLocation.parentLocationId ?? 0);
    return { kind: String(createLocation.kind) as PoliticalKind, parentLocationId: Number.isSafeInteger(parent) && parent > 0 ? parent : null };
  }
  if (raw.entityType === "location") {
    const entityId = Number(raw.entityId);
    if (!Number.isSafeInteger(entityId) || entityId <= 0) return null;
    const result = await pool.query<{ location_kind: string; parent_loc_id: number | null }>(
      "SELECT location_kind,parent_loc_id FROM locations WHERE camp_id=$1 AND loc_id=$2 AND archived_at IS NULL",
      [projectId, entityId],
    );
    const row = result.rows[0];
    if (row && ["country", "region", "province"].includes(row.location_kind)) return { kind: row.location_kind as PoliticalKind, parentLocationId: row.parent_loc_id };
  }
  return null;
}

async function siblingRows(projectId: number, mapId: number, identity: SemanticIdentity, excludedIds: number[]) {
  const result = await pool.query<CandidateRow>(
    `SELECT f.feature_id,f.label,f.geometry
       FROM map_features f
       JOIN locations loc ON f.entity_type='location' AND loc.loc_id=f.entity_id AND loc.camp_id=f.project_id AND loc.archived_at IS NULL
      WHERE f.project_id=$1 AND f.map_id=$2
        AND f.geometry_type IN ('Polygon','MultiPolygon')
        AND loc.location_kind=$3
        AND (($3='country') OR loc.parent_loc_id IS NOT DISTINCT FROM $4)
        AND NOT (f.feature_id = ANY($5::bigint[]))`,
    [projectId, mapId, identity.kind, identity.parentLocationId, excludedIds],
  );
  return result.rows;
}

export async function assertNoPoliticalOverlapForCreate(projectId: number, mapId: number, input: unknown) {
  const raw = input as Record<string, unknown> | null;
  const identity = await semanticIdentityForCreate(projectId, input);
  if (!identity || !raw?.geometry) return;
  const geometry = geometrySchema.parse(raw.geometry) as Geometry;
  const siblings = await siblingRows(projectId, mapId, identity, []);
  for (const sibling of siblings) {
    if (overlapCellCount(geometry, sibling.geometry) >= 3) throw new Error(`Die Fläche überschneidet sich mit „${sibling.label}“. Politische Geschwisterflächen dürfen sich nicht überlagern.`);
  }
}

export async function assertNoPoliticalOverlapForFeature(projectId: number, mapId: number, featureId: number, geometry: unknown, additionalExcludedIds: number[] = []) {
  const identity = await semanticIdentityForFeature(projectId, mapId, featureId);
  if (!identity) return;
  const parsed = geometrySchema.parse(geometry) as Geometry;
  const excludedIds = [featureId, ...additionalExcludedIds];
  const siblings = await siblingRows(projectId, mapId, identity, excludedIds);
  for (const sibling of siblings) {
    if (overlapCellCount(parsed, sibling.geometry) >= 3) throw new Error(`Die Fläche überschneidet sich mit „${sibling.label}“. Ziehe die Grenze zurück oder passe die Nachbarfläche gemeinsam an.`);
  }
}

export async function assertNoOverlapWithinBatch(items: Array<{ featureId: number; geometry: unknown }>) {
  for (let i = 0; i < items.length; i += 1) for (let j = i + 1; j < items.length; j += 1) {
    const left = geometrySchema.parse(items[i].geometry) as Geometry;
    const right = geometrySchema.parse(items[j].geometry) as Geometry;
    if (overlapCellCount(left, right) >= 3) throw new Error("Die Grenzänderung würde zwei gemeinsam bearbeitete politische Flächen überlappen. Änderung wurde abgebrochen.");
  }
}
