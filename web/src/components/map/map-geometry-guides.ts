import { clipPolygonToParentMask } from "./map-raster-clip";

export type MapCoordinate = [number, number];
export type MapExtent = [number, number, number, number];
export type JsonMapGeometry = { type: string; coordinates: unknown };

export type LandMaskGuide = {
  width: number;
  height: number;
  extent: MapExtent;
  land: Uint8Array;
  boundaryPixels: MapCoordinate[];
};

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function luminance(data: Uint8ClampedArray, pixelIndex: number) {
  const offset = pixelIndex * 4;
  return data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
}
function percentile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))] ?? 0;
}
function cornerOceanLuminance(data: Uint8ClampedArray, width: number, height: number) {
  const sampleSize = Math.max(2, Math.min(12, Math.floor(Math.min(width, height) / 20)));
  const values: number[] = [];
  const corners: [number, number][] = [[0, 0], [width - sampleSize, 0], [0, height - sampleSize], [width - sampleSize, height - sampleSize]];
  for (const [startX, startY] of corners) for (let y = startY; y < startY + sampleSize; y += 1) for (let x = startX; x < startX + sampleSize; x += 1) values.push(luminance(data, y * width + x));
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

export function buildLandMaskGuide(data: Uint8ClampedArray, width: number, height: number, extent: MapExtent): LandMaskGuide {
  if (width <= 1 || height <= 1 || data.length < width * height * 4) throw new Error("Ungültige Land-Mask-Daten.");
  const sampled: number[] = [], sampleStep = Math.max(1, Math.floor(Math.max(width, height) / 180));
  for (let y = 0; y < height; y += sampleStep) for (let x = 0; x < width; x += sampleStep) sampled.push(luminance(data, y * width + x));
  const low = percentile(sampled, 0.08), high = percentile(sampled, 0.92), threshold = (low + high) / 2;
  const oceanLum = cornerOceanLuminance(data, width, height), landIsBright = Math.abs(oceanLum - low) <= Math.abs(oceanLum - high);
  const land = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index += 1) {
    const alpha = data[index * 4 + 3]; if (alpha < 8) continue;
    const value = luminance(data, index); land[index] = landIsBright ? Number(value > threshold) : Number(value < threshold);
  }
  const boundaryPixels: MapCoordinate[] = [];
  for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
    const current = land[y * width + x];
    if (land[y * width + x - 1] !== current || land[y * width + x + 1] !== current || land[(y - 1) * width + x] !== current || land[(y + 1) * width + x] !== current) boundaryPixels.push([x, y]);
  }
  return { width, height, extent, land, boundaryPixels };
}

export function mapCoordinateToMaskPixel(guide: LandMaskGuide, coordinate: MapCoordinate): MapCoordinate {
  const [minX, minY, maxX, maxY] = guide.extent;
  const x = ((coordinate[0] - minX) / Math.max(1e-9, maxX - minX)) * (guide.width - 1);
  const y = ((maxY - coordinate[1]) / Math.max(1e-9, maxY - minY)) * (guide.height - 1);
  return [clamp(x, 0, guide.width - 1), clamp(y, 0, guide.height - 1)];
}
export function maskPixelToMapCoordinate(guide: LandMaskGuide, pixel: MapCoordinate): MapCoordinate {
  const [minX, minY, maxX, maxY] = guide.extent;
  return [minX + (pixel[0] / Math.max(1, guide.width - 1)) * (maxX - minX), maxY - (pixel[1] / Math.max(1, guide.height - 1)) * (maxY - minY)];
}
function maskPixelIsLand(guide: LandMaskGuide, pixel: MapCoordinate) {
  const x = clamp(Math.round(pixel[0]), 0, guide.width - 1), y = clamp(Math.round(pixel[1]), 0, guide.height - 1);
  return guide.land[y * guide.width + x] === 1;
}
function nearestBoundaryPixel(guide: LandMaskGuide, pixel: MapCoordinate) {
  let best: MapCoordinate | null = null, bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of guide.boundaryPixels) {
    const dx = candidate[0] - pixel[0], dy = candidate[1] - pixel[1], distance = dx * dx + dy * dy;
    if (distance < bestDistance) { bestDistance = distance; best = candidate; }
  }
  return best;
}
function sameCoordinate(a: MapCoordinate, b: MapCoordinate, epsilon = 1e-6) { return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon; }
function closeRing(points: MapCoordinate[]) { if (points.length && !sameCoordinate(points[0], points[points.length - 1])) points.push([...points[0]] as MapCoordinate); return points; }
function dedupeRing(points: MapCoordinate[]) { const result: MapCoordinate[] = []; for (const point of points) if (!result.length || !sameCoordinate(result[result.length - 1], point)) result.push(point); return closeRing(result); }
function ringFromUnknown(value: unknown): MapCoordinate[] | null {
  if (!Array.isArray(value)) return null;
  const result: MapCoordinate[] = [];
  for (const item of value) { if (!Array.isArray(item) || item.length < 2) return null; const x = Number(item[0]), y = Number(item[1]); if (!Number.isFinite(x) || !Number.isFinite(y)) return null; result.push([x, y]); }
  return result.length >= 4 ? result : null;
}
function polygonFromUnknown(value: unknown): MapCoordinate[][] | null { if (!Array.isArray(value)) return null; const rings = value.map(ringFromUnknown); return rings.every(Boolean) ? rings as MapCoordinate[][] : null; }

function densifyRingInMaskPixels(ring: MapCoordinate[], guide: LandMaskGuide, maxStepPixels: number) {
  const result: MapCoordinate[] = [];
  for (let index = 0; index < ring.length - 1; index += 1) {
    const start = ring[index], end = ring[index + 1], a = mapCoordinateToMaskPixel(guide, start), b = mapCoordinateToMaskPixel(guide, end);
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]), steps = Math.max(1, Math.ceil(length / Math.max(1, maxStepPixels)));
    for (let step = 0; step < steps; step += 1) { const ratio = step / steps; result.push([start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio]); }
  }
  result.push(ring[ring.length - 1]); return result;
}
function conformRingToLandMask(ring: MapCoordinate[], guide: LandMaskGuide, maxStepPixels: number) {
  const dense = densifyRingInMaskPixels(closeRing([...ring]), guide, maxStepPixels);
  return dedupeRing(dense.map((coordinate) => { const pixel = mapCoordinateToMaskPixel(guide, coordinate); if (maskPixelIsLand(guide, pixel)) return coordinate; const boundary = nearestBoundaryPixel(guide, pixel); return boundary ? maskPixelToMapCoordinate(guide, boundary) : coordinate; }));
}
export function conformPolygonToLandMask(geometry: JsonMapGeometry, guide: LandMaskGuide, maxStepPixels = 6): JsonMapGeometry {
  if (geometry.type === "Polygon") { const polygon = polygonFromUnknown(geometry.coordinates); if (!polygon || !guide.boundaryPixels.length) return geometry; return { ...geometry, coordinates: polygon.map((ring, index) => index === 0 ? conformRingToLandMask(ring, guide, maxStepPixels) : ring) }; }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    const polygons = geometry.coordinates.map(polygonFromUnknown); if (!polygons.every(Boolean) || !guide.boundaryPixels.length) return geometry;
    return { ...geometry, coordinates: (polygons as MapCoordinate[][][]).map((polygon) => polygon.map((ring, index) => index === 0 ? conformRingToLandMask(ring, guide, maxStepPixels) : ring)) };
  }
  return geometry;
}

function pointInRing(point: MapCoordinate, ring: MapCoordinate[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    const intersects = ((yi > point[1]) !== (yj > point[1])) && point[0] < ((xj - xi) * (point[1] - yi)) / ((yj - yi) || 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
function pointInPolygon(point: MapCoordinate, polygon: MapCoordinate[][]) { if (!polygon[0] || !pointInRing(point, polygon[0])) return false; for (let index = 1; index < polygon.length; index += 1) if (pointInRing(point, polygon[index])) return false; return true; }
export function geometryContainsCoordinate(geometry: JsonMapGeometry, point: MapCoordinate) {
  if (geometry.type === "Polygon") { const polygon = polygonFromUnknown(geometry.coordinates); return polygon ? pointInPolygon(point, polygon) : false; }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) return geometry.coordinates.some((value) => { const polygon = polygonFromUnknown(value); return polygon ? pointInPolygon(point, polygon) : false; });
  return false;
}
function closestPointOnSegment(point: MapCoordinate, start: MapCoordinate, end: MapCoordinate): MapCoordinate {
  const dx = end[0] - start[0], dy = end[1] - start[1], denominator = dx * dx + dy * dy; if (!denominator) return start;
  const ratio = clamp(((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / denominator, 0, 1); return [start[0] + dx * ratio, start[1] + dy * ratio];
}
function polygonBoundaryRings(geometry: JsonMapGeometry) {
  const rings: MapCoordinate[][] = [];
  if (geometry.type === "Polygon") { const polygon = polygonFromUnknown(geometry.coordinates); if (polygon?.[0]) rings.push(polygon[0]); }
  else if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) for (const value of geometry.coordinates) { const polygon = polygonFromUnknown(value); if (polygon?.[0]) rings.push(polygon[0]); }
  return rings;
}
export function closestPointOnPolygonGeometry(geometry: JsonMapGeometry, point: MapCoordinate) {
  let best: MapCoordinate | null = null, bestDistance = Number.POSITIVE_INFINITY;
  for (const ring of polygonBoundaryRings(geometry)) for (let index = 0; index < ring.length - 1; index += 1) {
    const candidate = closestPointOnSegment(point, ring[index], ring[index + 1]), dx = candidate[0] - point[0], dy = candidate[1] - point[1], distance = dx * dx + dy * dy;
    if (distance < bestDistance) { bestDistance = distance; best = candidate; }
  }
  return best;
}

/**
 * Compatibility entrypoint used by the editor. v7 now performs a real child ∩ parent
 * boolean clip on a high-resolution local grid instead of moving only outside vertices.
 */
export function conformPolygonToParent(geometry: JsonMapGeometry, parent: JsonMapGeometry, _maxStep: number): JsonMapGeometry {
  return clipPolygonToParentMask(geometry, parent, 1024) as JsonMapGeometry;
}
