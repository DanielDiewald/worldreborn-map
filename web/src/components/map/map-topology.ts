import type { JsonMapGeometry, MapCoordinate } from "./map-geometry-guides";
import type { WorldMapFeature } from "./map-types";

type CoordinateEntry = { path: number[]; coordinate: MapCoordinate };
type VertexMove = { from: MapCoordinate; to: MapCoordinate };

export type SharedBoundaryUpdate = {
  featureId: number;
  label: string;
  geometry: JsonMapGeometry;
};

export type SharedBoundarySyncResult = {
  updates: SharedBoundaryUpdate[];
  blockedBy: string[];
  movedSharedVertices: number;
};

function isCoordinate(value: unknown): value is number[] {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]));
}

function collectCoordinates(value: unknown, path: number[] = [], result: CoordinateEntry[] = []) {
  if (isCoordinate(value)) {
    result.push({ path, coordinate: [Number(value[0]), Number(value[1])] });
    return result;
  }
  if (!Array.isArray(value)) return result;
  value.forEach((child, index) => collectCoordinates(child, [...path, index], result));
  return result;
}

function setCoordinate(value: unknown, path: number[], coordinate: MapCoordinate) {
  if (!Array.isArray(value) || !path.length) return;
  let current: unknown = value;
  for (let index = 0; index < path.length - 1; index += 1) {
    if (!Array.isArray(current)) return;
    current = current[path[index]];
  }
  if (!Array.isArray(current)) return;
  const target = current[path[path.length - 1]];
  if (!Array.isArray(target)) return;
  current[path[path.length - 1]] = [coordinate[0], coordinate[1], ...target.slice(2)];
}

function distanceSquared(a: MapCoordinate, b: MapCoordinate) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function pathKey(path: number[]) {
  return path.join(".");
}

function movedVertices(before: JsonMapGeometry, edited: JsonMapGeometry, movementEpsilon: number) {
  if (before.type !== edited.type) return [] as VertexMove[];
  const beforeEntries = collectCoordinates(before.coordinates);
  const editedByPath = new Map(collectCoordinates(edited.coordinates).map((entry) => [pathKey(entry.path), entry.coordinate]));
  const epsilonSquared = movementEpsilon * movementEpsilon;
  const moves: VertexMove[] = [];
  for (const entry of beforeEntries) {
    const next = editedByPath.get(pathKey(entry.path));
    if (!next || distanceSquared(entry.coordinate, next) <= epsilonSquared) continue;
    moves.push({ from: entry.coordinate, to: next });
  }
  return moves;
}

function featureKind(row: WorldMapFeature) {
  if (typeof row.location_kind === "string" && row.location_kind) return row.location_kind;
  return typeof row.metadata?.tool === "string" ? row.metadata.tool : null;
}

function featureParent(row: WorldMapFeature) {
  if (row.location_parent_id != null) return Number(row.location_parent_id);
  return typeof row.metadata?.parentLocationId === "number" ? row.metadata.parentLocationId : null;
}

function topologyGroup(row: WorldMapFeature) {
  const kind = featureKind(row);
  if (kind === "country") return "country";
  if (kind === "province" || kind === "region") return `${kind}:${featureParent(row) ?? "root"}`;
  return null;
}

export function isMapFeatureEditorLocked(row: Pick<WorldMapFeature, "metadata">) {
  return row.metadata?.editorLocked === true;
}

export function canSharePoliticalBoundary(a: WorldMapFeature, b: WorldMapFeature) {
  const groupA = topologyGroup(a);
  const groupB = topologyGroup(b);
  return Boolean(groupA && groupA === groupB && ["Polygon", "MultiPolygon"].includes(a.geometry.type) && ["Polygon", "MultiPolygon"].includes(b.geometry.type));
}

function applyMoves(geometry: JsonMapGeometry, moves: VertexMove[], tolerance: number) {
  const next = JSON.parse(JSON.stringify(geometry)) as JsonMapGeometry;
  const toleranceSquared = tolerance * tolerance;
  let changedVertices = 0;
  for (const entry of collectCoordinates(next.coordinates)) {
    let best: VertexMove | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const move of moves) {
      const distance = distanceSquared(entry.coordinate, move.from);
      if (distance <= toleranceSquared && distance < bestDistance) {
        best = move;
        bestDistance = distance;
      }
    }
    if (!best) continue;
    setCoordinate(next.coordinates, entry.path, best.to);
    changedVertices += 1;
  }
  return { geometry: next, changedVertices };
}

/**
 * Synchronizes vertices that were genuinely shared before an edit.
 * This deliberately does not invent topology between merely overlapping polygons.
 * Countries sync only with countries; provinces/regions sync only with siblings
 * of the same kind and same parent. Locked peers block the edit so no seam can form.
 */
export function synchronizeSharedPoliticalVertices(options: {
  changedFeatureId: number;
  changedRow: WorldMapFeature;
  before: JsonMapGeometry;
  edited: JsonMapGeometry;
  peers: Iterable<[number, WorldMapFeature]>;
  tolerance: number;
}): SharedBoundarySyncResult {
  const { changedFeatureId, changedRow, before, edited, peers } = options;
  const tolerance = Math.max(1e-6, options.tolerance);
  if (!["Polygon", "MultiPolygon"].includes(before.type) || !topologyGroup(changedRow)) return { updates: [], blockedBy: [], movedSharedVertices: 0 };

  const moves = movedVertices(before, edited, tolerance * 0.04);
  if (!moves.length) return { updates: [], blockedBy: [], movedSharedVertices: 0 };

  const updates: SharedBoundaryUpdate[] = [];
  const blockedBy = new Set<string>();
  let movedSharedVertices = 0;

  for (const [featureId, peer] of peers) {
    if (featureId === changedFeatureId || !canSharePoliticalBoundary(changedRow, peer)) continue;
    const applied = applyMoves(peer.geometry as JsonMapGeometry, moves, tolerance);
    if (!applied.changedVertices) continue;
    if (isMapFeatureEditorLocked(peer)) {
      blockedBy.add(peer.label || `Feature ${featureId}`);
      continue;
    }
    movedSharedVertices += applied.changedVertices;
    updates.push({ featureId, label: peer.label, geometry: applied.geometry });
  }

  return { updates, blockedBy: [...blockedBy], movedSharedVertices };
}
