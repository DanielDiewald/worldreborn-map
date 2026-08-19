import type { JsonMapGeometry, MapCoordinate, MapExtent } from "./map-geometry-guides";

type Ring = MapCoordinate[];
type Polygon = Ring[];
type Edge = { start: [number, number]; end: [number, number]; dir: 0 | 1 | 2 | 3 };
type Grid = { width: number; height: number; extent: MapExtent };

export type CountryFitResult = {
  geometry: JsonMapGeometry;
  keptPixels: number;
  removedPixels: number;
  grid: { width: number; height: number };
};

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function samePoint(a: MapCoordinate, b: MapCoordinate, epsilon = 1e-6) { return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon; }
function closeRing(ring: Ring) { const next = ring.map((point) => [...point] as MapCoordinate); if (next.length && !samePoint(next[0], next[next.length - 1])) next.push([...next[0]] as MapCoordinate); return next; }
function key(point: [number, number]) { return `${point[0]},${point[1]}`; }

function readRing(value: unknown): Ring | null {
  if (!Array.isArray(value)) return null;
  const ring: Ring = [];
  for (const raw of value) {
    if (!Array.isArray(raw) || raw.length < 2) return null;
    const x = Number(raw[0]), y = Number(raw[1]);
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
function polygons(geometry: JsonMapGeometry): Polygon[] {
  if (geometry.type === "Polygon") { const polygon = readPolygon(geometry.coordinates); return polygon ? [polygon] : []; }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) return geometry.coordinates.map(readPolygon).filter((value): value is Polygon => Boolean(value));
  return [];
}
function geometryExtent(geometry: JsonMapGeometry): MapExtent | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const polygon of polygons(geometry)) for (const ring of polygon) for (const [x, y] of ring) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}
function extentIntersects(a: MapExtent, b: MapExtent) { return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]; }
function createGrid(subject: JsonMapGeometry, maxSide: number): Grid | null {
  const extent = geometryExtent(subject); if (!extent) return null;
  const rawWidth = Math.max(1e-6, extent[2] - extent[0]), rawHeight = Math.max(1e-6, extent[3] - extent[1]);
  const padX = rawWidth * 0.006 + 1e-6, padY = rawHeight * 0.006 + 1e-6;
  const padded: MapExtent = [extent[0] - padX, extent[1] - padY, extent[2] + padX, extent[3] + padY];
  const aspect = rawWidth / rawHeight;
  const safeMax = clamp(Math.round(maxSide), 600, 3600);
  const width = aspect >= 1 ? safeMax : Math.max(320, Math.round(safeMax * aspect));
  const height = aspect >= 1 ? Math.max(320, Math.round(safeMax / aspect)) : safeMax;
  return { width, height, extent: padded };
}
function mapToPixel(grid: Grid, point: MapCoordinate): MapCoordinate {
  const [minX, minY, maxX, maxY] = grid.extent;
  return [((point[0] - minX) / Math.max(1e-9, maxX - minX)) * (grid.width - 1), ((maxY - point[1]) / Math.max(1e-9, maxY - minY)) * (grid.height - 1)];
}
function pixelToMap(grid: Grid, point: MapCoordinate): MapCoordinate {
  const [minX, minY, maxX, maxY] = grid.extent;
  return [minX + (point[0] / Math.max(1, grid.width - 1)) * (maxX - minX), maxY - (point[1] / Math.max(1, grid.height - 1)) * (maxY - minY)];
}
function pixelPolygons(geometry: JsonMapGeometry, grid: Grid) { return polygons(geometry).map((polygon) => polygon.map((ring) => ring.map((point) => mapToPixel(grid, point)))); }

function rasterize(items: Polygon[], width: number, height: number) {
  const mask = new Uint8Array(width * height);
  for (const polygon of items) {
    if (!polygon[0]) continue;
    let minY = height - 1, maxY = 0;
    for (const ring of polygon) for (const [, y] of ring) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const startY = clamp(Math.floor(minY) - 1, 0, height - 1), endY = clamp(Math.ceil(maxY) + 1, 0, height - 1);
    for (let y = startY; y <= endY; y += 1) {
      const intersections: number[] = [];
      for (const ring of polygon) for (let index = 0; index < ring.length - 1; index += 1) {
        const a = ring[index], b = ring[index + 1];
        if ((a[1] > y) === (b[1] > y)) continue;
        intersections.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
      intersections.sort((a, b) => a - b);
      for (let index = 0; index + 1 < intersections.length; index += 2) {
        const startX = clamp(Math.ceil(intersections[index]), 0, width - 1), endX = clamp(Math.floor(intersections[index + 1]), 0, width - 1);
        for (let x = startX; x <= endX; x += 1) mask[y * width + x] = 1;
      }
    }
  }
  return mask;
}
function hasCell(mask: Uint8Array, width: number, height: number, x: number, y: number) { return x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1; }
function boundaryEdges(mask: Uint8Array, width: number, height: number) {
  const edges: Edge[] = [];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (!mask[y * width + x]) continue;
    const left = 2 * x - 1, right = 2 * x + 1, top = 2 * y - 1, bottom = 2 * y + 1;
    if (!hasCell(mask, width, height, x, y - 1)) edges.push({ start: [left, top], end: [right, top], dir: 0 });
    if (!hasCell(mask, width, height, x + 1, y)) edges.push({ start: [right, top], end: [right, bottom], dir: 1 });
    if (!hasCell(mask, width, height, x, y + 1)) edges.push({ start: [right, bottom], end: [left, bottom], dir: 2 });
    if (!hasCell(mask, width, height, x - 1, y)) edges.push({ start: [left, bottom], end: [left, top], dir: 3 });
  }
  return edges;
}
function turnRank(previous: Edge["dir"], next: Edge["dir"]) { const delta = (next - previous + 4) % 4; return delta === 1 ? 0 : delta === 0 ? 1 : delta === 3 ? 2 : 3; }
function pointSegmentDistance(point: MapCoordinate, start: MapCoordinate, end: MapCoordinate) {
  const dx = end[0] - start[0], dy = end[1] - start[1], lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = clamp(((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point[0] - (start[0] + dx * t), point[1] - (start[1] + dy * t));
}
function simplifyRing(ring: Ring, tolerance = 0.55) {
  let points = ring.slice(0, -1);
  for (let pass = 0; pass < 6 && points.length > 4; pass += 1) {
    const next: Ring = [];
    let changed = false;
    for (let index = 0; index < points.length; index += 1) {
      const prev = points[(index - 1 + points.length) % points.length], current = points[index], after = points[(index + 1) % points.length];
      if (points.length - next.length > 3 && pointSegmentDistance(current, prev, after) <= tolerance) { changed = true; continue; }
      next.push(current);
    }
    points = next.length >= 3 ? next : points;
    if (!changed) break;
  }
  return closeRing(points);
}
function traceRings(mask: Uint8Array, width: number, height: number) {
  const edges = boundaryEdges(mask, width, height), outgoing = new Map<string, number[]>();
  edges.forEach((edge, index) => outgoing.set(key(edge.start), [...(outgoing.get(key(edge.start)) ?? []), index]));
  const used = new Uint8Array(edges.length), rings: Ring[] = [];
  for (let seed = 0; seed < edges.length; seed += 1) {
    if (used[seed]) continue;
    const first = edges[seed], firstKey = key(first.start), ring: Ring = [[first.start[0] / 2, first.start[1] / 2]];
    let current = seed, guard = 0;
    while (guard++ <= edges.length + 4) {
      const edge = edges[current]; if (used[current]) break;
      used[current] = 1; ring.push([edge.end[0] / 2, edge.end[1] / 2]);
      if (key(edge.end) === firstKey) break;
      const candidates = (outgoing.get(key(edge.end)) ?? []).filter((id) => !used[id]); if (!candidates.length) break;
      candidates.sort((a, b) => turnRank(edge.dir, edges[a].dir) - turnRank(edge.dir, edges[b].dir)); current = candidates[0];
    }
    const cleaned = simplifyRing(closeRing(ring));
    if (cleaned.length >= 4 && samePoint(cleaned[0], cleaned[cleaned.length - 1])) rings.push(cleaned);
  }
  return rings;
}
function signedArea(ring: Ring) { let area = 0; for (let index = 0; index < ring.length - 1; index += 1) area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1]; return area / 2; }
function pointInRing(point: MapCoordinate, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i], b = ring[j];
    const crosses = ((a[1] > point[1]) !== (b[1] > point[1])) && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / ((b[1] - a[1]) || 1e-12) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}
function groupRings(rings: Ring[]) {
  const significant = rings.filter((ring) => Math.abs(signedArea(ring)) >= 2); if (!significant.length) return [] as Polygon[];
  const largest = significant.reduce((best, ring) => Math.abs(signedArea(ring)) > Math.abs(signedArea(best)) ? ring : best, significant[0]);
  const sign = Math.sign(signedArea(largest)) || 1;
  const outers = significant.filter((ring) => Math.sign(signedArea(ring)) === sign).sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  const holes = significant.filter((ring) => Math.sign(signedArea(ring)) !== sign), result = outers.map((outer) => [outer] as Polygon);
  for (const hole of holes) {
    let target = -1, targetArea = Infinity;
    for (let index = 0; index < outers.length; index += 1) {
      const area = Math.abs(signedArea(outers[index]));
      if (area < targetArea && pointInRing(hole[0], outers[index])) { target = index; targetArea = area; }
    }
    if (target >= 0) result[target].push(hole);
  }
  return result;
}

export function fitCountryAroundExistingCountries(subject: JsonMapGeometry, blockers: JsonMapGeometry[], maxSide = 2600): CountryFitResult | null {
  if (!["Polygon", "MultiPolygon"].includes(subject.type)) return null;
  const subjectExtent = geometryExtent(subject); if (!subjectExtent) return null;
  const validBlockers = blockers.filter((geometry) => {
    if (!["Polygon", "MultiPolygon"].includes(geometry.type)) return false;
    const extent = geometryExtent(geometry);
    return Boolean(extent && extentIntersects(subjectExtent, extent));
  });
  const grid = createGrid(subject, maxSide); if (!grid) return null;
  const subjectMask = rasterize(pixelPolygons(subject, grid), grid.width, grid.height);
  if (!validBlockers.length) {
    let keptPixels = 0;
    for (const value of subjectMask) if (value) keptPixels += 1;
    return { geometry: subject, keptPixels, removedPixels: 0, grid: { width: grid.width, height: grid.height } };
  }
  const blockerMask = new Uint8Array(grid.width * grid.height);
  for (const blocker of validBlockers) {
    const mask = rasterize(pixelPolygons(blocker, grid), grid.width, grid.height);
    for (let index = 0; index < blockerMask.length; index += 1) if (mask[index]) blockerMask[index] = 1;
  }
  const resultMask = new Uint8Array(subjectMask.length);
  let keptPixels = 0, removedPixels = 0;
  for (let index = 0; index < subjectMask.length; index += 1) {
    if (!subjectMask[index]) continue;
    if (blockerMask[index]) { removedPixels += 1; continue; }
    resultMask[index] = 1; keptPixels += 1;
  }
  if (keptPixels < 12) return null;
  const grouped = groupRings(traceRings(resultMask, grid.width, grid.height)); if (!grouped.length) return null;
  const mapped = grouped.map((polygon) => polygon.map((ring) => ring.map((point) => pixelToMap(grid, [clamp(point[0], 0, grid.width - 1), clamp(point[1], 0, grid.height - 1)]))));
  const geometry: JsonMapGeometry = mapped.length === 1 ? { type: "Polygon", coordinates: mapped[0] } : { type: "MultiPolygon", coordinates: mapped };
  return { geometry, keptPixels, removedPixels, grid: { width: grid.width, height: grid.height } };
}
