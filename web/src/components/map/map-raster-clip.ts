import type { JsonMapGeometry, LandMaskGuide, MapCoordinate } from "./map-geometry-guides";
import { mapCoordinateToMaskPixel, maskPixelToMapCoordinate } from "./map-geometry-guides";

type PixelRing = MapCoordinate[];
type PixelPolygon = PixelRing[];
type Edge = { start: [number, number]; end: [number, number]; dir: 0 | 1 | 2 | 3 };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function key(point: [number, number]) {
  return `${point[0]},${point[1]}`;
}

function samePoint(a: MapCoordinate, b: MapCoordinate, epsilon = 1e-6) {
  return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
}

function closeRing(ring: PixelRing) {
  if (ring.length && !samePoint(ring[0], ring[ring.length - 1])) ring.push([...ring[0]] as MapCoordinate);
  return ring;
}

function readRing(value: unknown): PixelRing | null {
  if (!Array.isArray(value)) return null;
  const ring: PixelRing = [];
  for (const coordinate of value) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
    const x = Number(coordinate[0]);
    const y = Number(coordinate[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    ring.push([x, y]);
  }
  return ring.length >= 4 ? closeRing(ring) : null;
}

function readPolygon(value: unknown): PixelPolygon | null {
  if (!Array.isArray(value)) return null;
  const rings = value.map(readRing);
  return rings.length && rings.every(Boolean) ? rings as PixelPolygon : null;
}

function geometryPolygons(geometry: JsonMapGeometry): PixelPolygon[] {
  if (geometry.type === "Polygon") {
    const polygon = readPolygon(geometry.coordinates);
    return polygon ? [polygon] : [];
  }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.map(readPolygon).filter((value): value is PixelPolygon => Boolean(value));
  }
  return [];
}

function pointInRing(point: MapCoordinate, ring: PixelRing) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    const crosses = ((yi > point[1]) !== (yj > point[1])) && point[0] < ((xj - xi) * (point[1] - yi)) / ((yj - yi) || 1e-12) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: MapCoordinate, polygon: PixelPolygon) {
  if (!polygon[0] || !pointInRing(point, polygon[0])) return false;
  for (let index = 1; index < polygon.length; index += 1) if (pointInRing(point, polygon[index])) return false;
  return true;
}

function toPixelPolygon(polygon: PixelPolygon, guide: LandMaskGuide) {
  return polygon.map((ring) => ring.map((coordinate) => mapCoordinateToMaskPixel(guide, coordinate)));
}

function polygonBounds(polygons: PixelPolygon[], width: number, height: number) {
  let minX = width - 1, minY = height - 1, maxX = 0, maxY = 0;
  let found = false;
  for (const polygon of polygons) for (const ring of polygon) for (const [x, y] of ring) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); found = true;
  }
  if (!found) return null;
  return {
    minX: clamp(Math.floor(minX) - 1, 0, width - 1),
    minY: clamp(Math.floor(minY) - 1, 0, height - 1),
    maxX: clamp(Math.ceil(maxX) + 1, 0, width - 1),
    maxY: clamp(Math.ceil(maxY) + 1, 0, height - 1),
  };
}

function rasterIntersection(polygons: PixelPolygon[], guide: LandMaskGuide) {
  const selected = new Uint8Array(guide.width * guide.height);
  const bounds = polygonBounds(polygons, guide.width, guide.height);
  if (!bounds) return selected;
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const index = y * guide.width + x;
      if (!guide.land[index]) continue;
      const inside = polygons.some((polygon) => pointInPolygon([x, y], polygon));
      if (inside) selected[index] = 1;
    }
  }
  return selected;
}

function hasCell(mask: Uint8Array, width: number, height: number, x: number, y: number) {
  return x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;
}

function boundaryEdges(mask: Uint8Array, width: number, height: number) {
  const edges: Edge[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      const left = 2 * x - 1, right = 2 * x + 1, top = 2 * y - 1, bottom = 2 * y + 1;
      if (!hasCell(mask, width, height, x, y - 1)) edges.push({ start: [left, top], end: [right, top], dir: 0 });
      if (!hasCell(mask, width, height, x + 1, y)) edges.push({ start: [right, top], end: [right, bottom], dir: 1 });
      if (!hasCell(mask, width, height, x, y + 1)) edges.push({ start: [right, bottom], end: [left, bottom], dir: 2 });
      if (!hasCell(mask, width, height, x - 1, y)) edges.push({ start: [left, bottom], end: [left, top], dir: 3 });
    }
  }
  return edges;
}

function turnRank(previous: Edge["dir"], next: Edge["dir"]) {
  const delta = (next - previous + 4) % 4;
  if (delta === 1) return 0; // keep land on the right at ambiguous diagonal contacts
  if (delta === 0) return 1;
  if (delta === 3) return 2;
  return 3;
}

function removeCollinear(ring: PixelRing) {
  if (ring.length < 5) return ring;
  const open = ring.slice(0, -1);
  const result: PixelRing = [];
  for (let index = 0; index < open.length; index += 1) {
    const prev = open[(index - 1 + open.length) % open.length];
    const current = open[index];
    const next = open[(index + 1) % open.length];
    const cross = (current[0] - prev[0]) * (next[1] - current[1]) - (current[1] - prev[1]) * (next[0] - current[0]);
    if (Math.abs(cross) > 1e-9) result.push(current);
  }
  return closeRing(result.length >= 3 ? result : open);
}

function traceRings(edges: Edge[]) {
  const outgoing = new Map<string, number[]>();
  edges.forEach((edge, index) => outgoing.set(key(edge.start), [...(outgoing.get(key(edge.start)) ?? []), index]));
  const used = new Uint8Array(edges.length);
  const rings: PixelRing[] = [];

  for (let seed = 0; seed < edges.length; seed += 1) {
    if (used[seed]) continue;
    const startEdge = edges[seed];
    const startKey = key(startEdge.start);
    let currentIndex = seed;
    const ring: PixelRing = [[startEdge.start[0] / 2, startEdge.start[1] / 2]];
    let guard = 0;
    while (guard++ <= edges.length + 4) {
      const edge = edges[currentIndex];
      if (used[currentIndex]) break;
      used[currentIndex] = 1;
      ring.push([edge.end[0] / 2, edge.end[1] / 2]);
      if (key(edge.end) === startKey) break;
      const candidates = (outgoing.get(key(edge.end)) ?? []).filter((index) => !used[index]);
      if (!candidates.length) break;
      candidates.sort((a, b) => turnRank(edge.dir, edges[a].dir) - turnRank(edge.dir, edges[b].dir));
      currentIndex = candidates[0];
    }
    const cleaned = removeCollinear(closeRing(ring));
    if (cleaned.length >= 4 && samePoint(cleaned[0], cleaned[cleaned.length - 1])) rings.push(cleaned);
  }
  return rings;
}

function signedArea(ring: PixelRing) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  return area / 2;
}

function convertRingToMap(ring: PixelRing, guide: LandMaskGuide) {
  return ring.map(([x, y]) => maskPixelToMapCoordinate(guide, [clamp(x, 0, guide.width - 1), clamp(y, 0, guide.height - 1)]));
}

function groupRings(rings: PixelRing[]) {
  if (!rings.length) return [] as PixelPolygon[];
  const significant = rings.filter((ring) => Math.abs(signedArea(ring)) >= 1.5);
  if (!significant.length) return [] as PixelPolygon[];
  const largest = significant.reduce((best, ring) => Math.abs(signedArea(ring)) > Math.abs(signedArea(best)) ? ring : best, significant[0]);
  const outerSign = Math.sign(signedArea(largest)) || 1;
  const outers = significant.filter((ring) => Math.sign(signedArea(ring)) === outerSign).sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  const holes = significant.filter((ring) => Math.sign(signedArea(ring)) !== outerSign);
  const polygons = outers.map((outer) => [outer] as PixelPolygon);
  for (const hole of holes) {
    const probe = hole[0];
    let target = -1;
    let targetArea = Number.POSITIVE_INFINITY;
    for (let index = 0; index < outers.length; index += 1) {
      const area = Math.abs(signedArea(outers[index]));
      if (area < targetArea && pointInRing(probe, outers[index])) { target = index; targetArea = area; }
    }
    if (target >= 0) polygons[target].push(hole);
  }
  return polygons;
}

/**
 * Intersects a hand-drawn country polygon with the binary Rock-3 land mask.
 * The result can become a MultiPolygon when the drawn territory contains islands.
 * This is deliberately raster based: the mask, not the nearest arbitrary coast point,
 * is the source of truth for land/water.
 */
export function clipPolygonToLandMask(geometry: JsonMapGeometry, guide: LandMaskGuide): JsonMapGeometry {
  const sourcePolygons = geometryPolygons(geometry);
  if (!sourcePolygons.length) return geometry;
  const pixelPolygons = sourcePolygons.map((polygon) => toPixelPolygon(polygon, guide));
  const selected = rasterIntersection(pixelPolygons, guide);
  const rings = traceRings(boundaryEdges(selected, guide.width, guide.height));
  const grouped = groupRings(rings);
  if (!grouped.length) return geometry;
  const polygons = grouped.map((polygon) => polygon.map((ring) => convertRingToMap(ring, guide)));
  if (polygons.length === 1) return { ...geometry, type: "Polygon", coordinates: polygons[0] };
  return { ...geometry, type: "MultiPolygon", coordinates: polygons };
}
