type MapCoordinate = [number, number];
type MapExtent = [number, number, number, number];
type JsonMapGeometry = { type: string; coordinates: unknown };
type LandMaskGuide = { width: number; height: number; extent: MapExtent; land: Uint8Array; boundaryPixels: MapCoordinate[] };
type PixelRing = MapCoordinate[];
type PixelPolygon = PixelRing[];
type Edge = { start: [number, number]; end: [number, number]; dir: 0 | 1 | 2 | 3 };

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function key(point: [number, number]) { return `${point[0]},${point[1]}`; }
function samePoint(a: MapCoordinate, b: MapCoordinate, epsilon = 1e-6) { return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon; }
function closeRing(ring: PixelRing) { if (ring.length && !samePoint(ring[0], ring[ring.length - 1])) ring.push([...ring[0]] as MapCoordinate); return ring; }
function maskPixelToMapCoordinate(guide: LandMaskGuide, pixel: MapCoordinate): MapCoordinate {
  const [minX, minY, maxX, maxY] = guide.extent;
  return [minX + (pixel[0] / Math.max(1, guide.width - 1)) * (maxX - minX), maxY - (pixel[1] / Math.max(1, guide.height - 1)) * (maxY - minY)];
}

function readRing(value: unknown): PixelRing | null {
  if (!Array.isArray(value)) return null;
  const ring: PixelRing = [];
  for (const coordinate of value) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
    const x = Number(coordinate[0]), y = Number(coordinate[1]);
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
  if (geometry.type === "Polygon") { const polygon = readPolygon(geometry.coordinates); return polygon ? [polygon] : []; }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) return geometry.coordinates.map(readPolygon).filter((value): value is PixelPolygon => Boolean(value));
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
function mapToPixel(guide: LandMaskGuide, coordinate: MapCoordinate): MapCoordinate {
  const [minX, minY, maxX, maxY] = guide.extent;
  return [((coordinate[0] - minX) / Math.max(1e-9, maxX - minX)) * (guide.width - 1), ((maxY - coordinate[1]) / Math.max(1e-9, maxY - minY)) * (guide.height - 1)];
}
function toPixelPolygons(geometry: JsonMapGeometry, guide: LandMaskGuide) { return geometryPolygons(geometry).map((polygon) => polygon.map((ring) => ring.map((coordinate) => mapToPixel(guide, coordinate)))); }

function rasterizePolygons(polygons: PixelPolygon[], width: number, height: number) {
  const mask = new Uint8Array(width * height);
  for (const polygon of polygons) {
    if (!polygon[0]) continue;
    let minY = height - 1, maxY = 0;
    for (const ring of polygon) for (const [, y] of ring) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const yStart = clamp(Math.floor(minY) - 1, 0, height - 1), yEnd = clamp(Math.ceil(maxY) + 1, 0, height - 1);
    for (let y = yStart; y <= yEnd; y += 1) {
      const intersections: number[] = [];
      for (const ring of polygon) for (let index = 0; index < ring.length - 1; index += 1) {
        const a = ring[index], b = ring[index + 1];
        if ((a[1] > y) === (b[1] > y)) continue;
        intersections.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
      intersections.sort((a, b) => a - b);
      for (let index = 0; index + 1 < intersections.length; index += 2) {
        const start = clamp(Math.ceil(intersections[index]), 0, width - 1), end = clamp(Math.floor(intersections[index + 1]), 0, width - 1);
        for (let x = start; x <= end; x += 1) mask[y * width + x] = 1;
      }
    }
  }
  return mask;
}
function intersectMasks(a: Uint8Array, b: Uint8Array) { const result = new Uint8Array(Math.min(a.length, b.length)); for (let index = 0; index < result.length; index += 1) result[index] = a[index] && b[index] ? 1 : 0; return result; }
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
function removeCollinear(ring: PixelRing) {
  if (ring.length < 5) return ring;
  const open = ring.slice(0, -1), result: PixelRing = [];
  for (let index = 0; index < open.length; index += 1) {
    const prev = open[(index - 1 + open.length) % open.length], current = open[index], next = open[(index + 1) % open.length];
    const cross = (current[0] - prev[0]) * (next[1] - current[1]) - (current[1] - prev[1]) * (next[0] - current[0]);
    if (Math.abs(cross) > 1e-9) result.push(current);
  }
  return closeRing(result.length >= 3 ? result : open);
}
function traceRings(edges: Edge[]) {
  const outgoing = new Map<string, number[]>(); edges.forEach((edge, index) => outgoing.set(key(edge.start), [...(outgoing.get(key(edge.start)) ?? []), index]));
  const used = new Uint8Array(edges.length), rings: PixelRing[] = [];
  for (let seed = 0; seed < edges.length; seed += 1) {
    if (used[seed]) continue;
    const startEdge = edges[seed], startKey = key(startEdge.start); let currentIndex = seed, guard = 0;
    const ring: PixelRing = [[startEdge.start[0] / 2, startEdge.start[1] / 2]];
    while (guard++ <= edges.length + 4) {
      const edge = edges[currentIndex]; if (used[currentIndex]) break; used[currentIndex] = 1; ring.push([edge.end[0] / 2, edge.end[1] / 2]);
      if (key(edge.end) === startKey) break;
      const candidates = (outgoing.get(key(edge.end)) ?? []).filter((index) => !used[index]); if (!candidates.length) break;
      candidates.sort((a, b) => turnRank(edge.dir, edges[a].dir) - turnRank(edge.dir, edges[b].dir)); currentIndex = candidates[0];
    }
    const cleaned = removeCollinear(closeRing(ring)); if (cleaned.length >= 4 && samePoint(cleaned[0], cleaned[cleaned.length - 1])) rings.push(cleaned);
  }
  return rings;
}
function signedArea(ring: PixelRing) { let area = 0; for (let index = 0; index < ring.length - 1; index += 1) area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1]; return area / 2; }
function convertRingToMap(ring: PixelRing, guide: LandMaskGuide) { return ring.map(([x, y]) => maskPixelToMapCoordinate(guide, [clamp(x, 0, guide.width - 1), clamp(y, 0, guide.height - 1)])); }
function groupRings(rings: PixelRing[]) {
  if (!rings.length) return [] as PixelPolygon[];
  const significant = rings.filter((ring) => Math.abs(signedArea(ring)) >= 1.5); if (!significant.length) return [] as PixelPolygon[];
  const largest = significant.reduce((best, ring) => Math.abs(signedArea(ring)) > Math.abs(signedArea(best)) ? ring : best, significant[0]);
  const outerSign = Math.sign(signedArea(largest)) || 1;
  const outers = significant.filter((ring) => Math.sign(signedArea(ring)) === outerSign).sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  const holes = significant.filter((ring) => Math.sign(signedArea(ring)) !== outerSign), polygons = outers.map((outer) => [outer] as PixelPolygon);
  for (const hole of holes) {
    const probe = hole[0]; let target = -1, targetArea = Number.POSITIVE_INFINITY;
    for (let index = 0; index < outers.length; index += 1) { const area = Math.abs(signedArea(outers[index])); if (area < targetArea && pointInRing(probe, outers[index])) { target = index; targetArea = area; } }
    if (target >= 0) polygons[target].push(hole);
  }
  return polygons;
}
function geometryFromMask(original: JsonMapGeometry, guide: LandMaskGuide, mask: Uint8Array) {
  const grouped = groupRings(traceRings(boundaryEdges(mask, guide.width, guide.height))); if (!grouped.length) return original;
  const polygons = grouped.map((polygon) => polygon.map((ring) => convertRingToMap(ring, guide)));
  return polygons.length === 1 ? { ...original, type: "Polygon", coordinates: polygons[0] } : { ...original, type: "MultiPolygon", coordinates: polygons };
}

export function clipPolygonToLandMask(geometry: JsonMapGeometry, guide: LandMaskGuide): JsonMapGeometry {
  const source = toPixelPolygons(geometry, guide); if (!source.length) return geometry;
  return geometryFromMask(geometry, guide, intersectMasks(rasterizePolygons(source, guide.width, guide.height), guide.land));
}
function geometryExtent(geometry: JsonMapGeometry): MapExtent | null {
  const polygons = geometryPolygons(geometry); if (!polygons.length) return null;
  let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY, maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
  for (const polygon of polygons) for (const ring of polygon) for (const [x, y] of ring) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}
function localGuideForParent(parent: JsonMapGeometry, maxSide: number) {
  const extent = geometryExtent(parent); if (!extent) return null;
  const rawWidth = Math.max(1e-6, extent[2] - extent[0]), rawHeight = Math.max(1e-6, extent[3] - extent[1]);
  const padX = rawWidth * 0.002 + 1e-6, padY = rawHeight * 0.002 + 1e-6, padded: MapExtent = [extent[0] - padX, extent[1] - padY, extent[2] + padX, extent[3] + padY];
  const aspect = rawWidth / rawHeight, width = aspect >= 1 ? maxSide : Math.max(96, Math.round(maxSide * aspect)), height = aspect >= 1 ? Math.max(96, Math.round(maxSide / aspect)) : maxSide;
  const guide: LandMaskGuide = { width, height, extent: padded, land: new Uint8Array(width * height), boundaryPixels: [] };
  guide.land = rasterizePolygons(toPixelPolygons(parent, guide), width, height); return guide;
}
export function clipPolygonToParentMask(child: JsonMapGeometry, parent: JsonMapGeometry, maxSide = 1024): JsonMapGeometry {
  if (!["Polygon", "MultiPolygon"].includes(child.type) || !["Polygon", "MultiPolygon"].includes(parent.type)) return child;
  const guide = localGuideForParent(parent, Math.max(256, Math.min(1536, maxSide))); if (!guide) return child;
  return geometryFromMask(child, guide, intersectMasks(rasterizePolygons(toPixelPolygons(child, guide), guide.width, guide.height), guide.land));
}
