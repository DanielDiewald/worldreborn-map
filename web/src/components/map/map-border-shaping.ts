import type { JsonMapGeometry, MapCoordinate } from "./map-geometry-guides";
import type { WorldMapFeature } from "./map-types";

type RingRef = {
  polygonIndex: number;
  startSegment: number;
  segmentCount: number;
  ring: MapCoordinate[];
};

export type SharedPoliticalBorder = {
  a: RingRef;
  b: RingRef;
  points: MapCoordinate[];
  length: number;
};

export type BorderShapeResult = {
  aGeometry: JsonMapGeometry;
  bGeometry: JsonMapGeometry;
  border: MapCoordinate[];
  originalLength: number;
  generatedLength: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function samePoint(a: MapCoordinate, b: MapCoordinate, tolerance = 1e-6) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolerance;
}

function distance(a: MapCoordinate, b: MapCoordinate) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function polylineLength(points: MapCoordinate[]) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += distance(points[index - 1], points[index]);
  return total;
}

function closeRing(points: MapCoordinate[]) {
  if (!points.length) return points;
  const next = points.map((point) => [point[0], point[1]] as MapCoordinate);
  if (!samePoint(next[0], next[next.length - 1])) next.push([...next[0]] as MapCoordinate);
  return next;
}

function readRing(value: unknown) {
  if (!Array.isArray(value)) return null;
  const ring: MapCoordinate[] = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length < 2) return null;
    const x = Number(item[0]);
    const y = Number(item[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    ring.push([x, y]);
  }
  return ring.length >= 4 ? closeRing(ring) : null;
}

function outerRings(geometry: JsonMapGeometry) {
  const result: Array<{ polygonIndex: number; ring: MapCoordinate[] }> = [];
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    const ring = readRing(geometry.coordinates[0]);
    if (ring) result.push({ polygonIndex: 0, ring });
  }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    geometry.coordinates.forEach((polygon, polygonIndex) => {
      if (!Array.isArray(polygon)) return;
      const ring = readRing(polygon[0]);
      if (ring) result.push({ polygonIndex, ring });
    });
  }
  return result;
}

function pointKey(point: MapCoordinate, tolerance: number) {
  const divisor = Math.max(1e-9, tolerance);
  return `${Math.round(point[0] / divisor)},${Math.round(point[1] / divisor)}`;
}

function segmentKey(a: MapCoordinate, b: MapCoordinate, tolerance: number) {
  const first = pointKey(a, tolerance);
  const second = pointKey(b, tolerance);
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function segmentKeys(ring: MapCoordinate[], tolerance: number) {
  const open = ring.slice(0, -1);
  const result = new Set<string>();
  for (let index = 0; index < open.length; index += 1) {
    result.add(segmentKey(open[index], open[(index + 1) % open.length], tolerance));
  }
  return result;
}

type Run = { start: number; count: number; points: MapCoordinate[]; length: number };

function sharedRuns(ring: MapCoordinate[], shared: Set<string>, tolerance: number): Run[] {
  const open = ring.slice(0, -1);
  const n = open.length;
  if (!n) return [];
  const matches = Array.from({ length: n }, (_, index) => shared.has(segmentKey(open[index], open[(index + 1) % n], tolerance)));
  if (!matches.some(Boolean)) return [];
  if (matches.every(Boolean)) return [{ start: 0, count: n, points: closeRing(open), length: polylineLength(closeRing(open)) }];

  let breakAt = matches.findIndex((value) => !value);
  const runs: Run[] = [];
  let offset = 1;
  while (offset <= n) {
    const index = (breakAt + offset) % n;
    if (!matches[index]) { offset += 1; continue; }
    const start = index;
    let count = 0;
    while (count < n && matches[(start + count) % n]) count += 1;
    const points: MapCoordinate[] = [];
    for (let step = 0; step <= count; step += 1) points.push(open[(start + step) % n]);
    runs.push({ start, count, points, length: polylineLength(points) });
    offset += count + 1;
  }
  return runs;
}

function endpointPairKey(points: MapCoordinate[], tolerance: number) {
  const a = pointKey(points[0], tolerance);
  const b = pointKey(points[points.length - 1], tolerance);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function findSharedPoliticalBorder(a: JsonMapGeometry, b: JsonMapGeometry, tolerance: number): SharedPoliticalBorder | null {
  if (!["Polygon", "MultiPolygon"].includes(a.type) || !["Polygon", "MultiPolygon"].includes(b.type)) return null;
  const safeTolerance = Math.max(1e-6, tolerance);
  let best: SharedPoliticalBorder | null = null;

  for (const aOuter of outerRings(a)) {
    const aKeys = segmentKeys(aOuter.ring, safeTolerance);
    for (const bOuter of outerRings(b)) {
      const bKeys = segmentKeys(bOuter.ring, safeTolerance);
      const shared = new Set([...aKeys].filter((key) => bKeys.has(key)));
      if (!shared.size) continue;
      const aRuns = sharedRuns(aOuter.ring, shared, safeTolerance);
      const bRuns = sharedRuns(bOuter.ring, shared, safeTolerance);
      for (const aRun of aRuns) {
        if (aRun.count < 1) continue;
        const pair = endpointPairKey(aRun.points, safeTolerance);
        const bRun = bRuns
          .filter((run) => endpointPairKey(run.points, safeTolerance) === pair)
          .sort((left, right) => right.length - left.length)[0];
        if (!bRun) continue;
        if (!best || aRun.length > best.length) {
          best = {
            a: { polygonIndex: aOuter.polygonIndex, startSegment: aRun.start, segmentCount: aRun.count, ring: aOuter.ring },
            b: { polygonIndex: bOuter.polygonIndex, startSegment: bRun.start, segmentCount: bRun.count, ring: bOuter.ring },
            points: aRun.points.map((point) => [...point] as MapCoordinate),
            length: aRun.length,
          };
        }
      }
    }
  }
  return best;
}

function setOuterRing(geometry: JsonMapGeometry, polygonIndex: number, ring: MapCoordinate[]) {
  const next = JSON.parse(JSON.stringify(geometry)) as JsonMapGeometry;
  if (next.type === "Polygon" && Array.isArray(next.coordinates)) {
    next.coordinates[0] = ring;
  } else if (next.type === "MultiPolygon" && Array.isArray(next.coordinates) && Array.isArray(next.coordinates[polygonIndex])) {
    (next.coordinates[polygonIndex] as unknown[])[0] = ring;
  }
  return next;
}

function orientPath(path: MapCoordinate[], start: MapCoordinate) {
  if (distance(path[0], start) <= distance(path[path.length - 1], start)) return path;
  return [...path].reverse();
}

function replaceSharedRun(geometry: JsonMapGeometry, ref: RingRef, replacement: MapCoordinate[]) {
  const open = ref.ring.slice(0, -1);
  const n = open.length;
  if (!n) return geometry;
  const endIndex = (ref.startSegment + ref.segmentCount) % n;
  const path = orientPath(replacement, open[ref.startSegment]);
  const rebuilt: MapCoordinate[] = path.slice(0, -1).map((point) => [...point] as MapCoordinate);
  let index = endIndex;
  let guard = 0;
  while (guard++ <= n) {
    rebuilt.push([...open[index]] as MapCoordinate);
    index = (index + 1) % n;
    if (index === ref.startSegment) break;
  }
  return setOuterRing(geometry, ref.polygonIndex, closeRing(rebuilt));
}

function perpendicularDistance(point: MapCoordinate, start: MapCoordinate, end: MapCoordinate) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const denom = dx * dx + dy * dy;
  if (!denom) return distance(point, start);
  const t = clamp(((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / denom, 0, 1);
  return distance(point, [start[0] + dx * t, start[1] + dy * t]);
}

function simplifyOpen(points: MapCoordinate[], tolerance: number): MapCoordinate[] {
  if (points.length <= 2 || tolerance <= 0) return points.map((point) => [...point] as MapCoordinate);
  let farthest = -1;
  let maxDistance = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const d = perpendicularDistance(points[index], points[0], points[points.length - 1]);
    if (d > maxDistance) { maxDistance = d; farthest = index; }
  }
  if (maxDistance <= tolerance || farthest < 0) return [[...points[0]] as MapCoordinate, [...points[points.length - 1]] as MapCoordinate];
  const left = simplifyOpen(points.slice(0, farthest + 1), tolerance);
  const right = simplifyOpen(points.slice(farthest), tolerance);
  return [...left.slice(0, -1), ...right];
}

function chaikinOpen(points: MapCoordinate[], iterations: number, strength: number) {
  let current = points.map((point) => [...point] as MapCoordinate);
  const ratio = clamp(0.12 + strength * 0.18, 0.08, 0.3);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    if (current.length < 3) break;
    const next: MapCoordinate[] = [[...current[0]] as MapCoordinate];
    for (let index = 0; index < current.length - 1; index += 1) {
      const a = current[index];
      const b = current[index + 1];
      next.push([a[0] * (1 - ratio) + b[0] * ratio, a[1] * (1 - ratio) + b[1] * ratio]);
      next.push([a[0] * ratio + b[0] * (1 - ratio), a[1] * ratio + b[1] * (1 - ratio)]);
    }
    next.push([...current[current.length - 1]] as MapCoordinate);
    current = next;
  }
  return current;
}

function pointInRing(point: MapCoordinate, ring: MapCoordinate[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    const crosses = ((a[1] > point[1]) !== (b[1] > point[1])) && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / ((b[1] - a[1]) || 1e-12) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInGeometry(point: MapCoordinate, geometry: JsonMapGeometry) {
  const polygons: unknown[] = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  for (const rawPolygon of polygons) {
    if (!Array.isArray(rawPolygon)) continue;
    const rings = rawPolygon.map(readRing).filter((ring): ring is MapCoordinate[] => Boolean(ring));
    if (!rings.length || !pointInRing(point, rings[0])) continue;
    if (!rings.slice(1).some((hole) => pointInRing(point, hole))) return true;
  }
  return false;
}

function pathInsideUnion(path: MapCoordinate[], a: JsonMapGeometry, b: JsonMapGeometry) {
  return path.every((point, index) => index === 0 || index === path.length - 1 || pointInGeometry(point, a) || pointInGeometry(point, b));
}

function resamplePolyline(points: MapCoordinate[], count: number) {
  if (points.length < 2) return points;
  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) cumulative.push(cumulative[index - 1] + distance(points[index - 1], points[index]));
  const total = cumulative[cumulative.length - 1];
  if (!total) return [points[0], points[points.length - 1]];
  const result: MapCoordinate[] = [];
  for (let sample = 0; sample < count; sample += 1) {
    const target = total * (sample / Math.max(1, count - 1));
    let segment = 1;
    while (segment < cumulative.length - 1 && cumulative[segment] < target) segment += 1;
    const aDistance = cumulative[segment - 1];
    const bDistance = cumulative[segment];
    const t = bDistance === aDistance ? 0 : (target - aDistance) / (bDistance - aDistance);
    const a = points[segment - 1];
    const b = points[segment];
    result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return result;
}

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomWave(t: number, coefficients: Array<{ frequency: number; phase: number; weight: number }>) {
  let value = 0;
  let normalizer = 0;
  for (const term of coefficients) {
    value += Math.sin(Math.PI * 2 * (term.frequency * t + term.phase)) * term.weight;
    normalizer += term.weight;
  }
  return normalizer ? value / normalizer : 0;
}

function randomizePath(base: MapCoordinate[], roughness: number, detail: number, seed: number, amplitudeScale: number) {
  const samples = Math.max(10, Math.round(14 + detail * 54));
  const resampled = resamplePolyline(base, samples);
  const total = polylineLength(resampled);
  const random = mulberry32(Math.max(1, Math.round(seed)));
  const terms = Array.from({ length: 5 }, (_, index) => ({
    frequency: 0.65 + index * (0.72 + detail * 0.42) + random() * 0.5,
    phase: random(),
    weight: Math.pow(0.62, index) * (0.85 + random() * 0.3),
  }));
  const amplitude = total * (0.006 + 0.055 * roughness * roughness) * amplitudeScale;
  return resampled.map((point, index) => {
    if (index === 0 || index === resampled.length - 1) return [...point] as MapCoordinate;
    const previous = resampled[index - 1];
    const next = resampled[index + 1];
    const dx = next[0] - previous[0];
    const dy = next[1] - previous[1];
    const length = Math.hypot(dx, dy) || 1;
    const normal: MapCoordinate = [-dy / length, dx / length];
    const t = index / (resampled.length - 1);
    const envelope = Math.pow(Math.sin(Math.PI * t), 0.8);
    const offset = randomWave(t, terms) * amplitude * envelope;
    return [point[0] + normal[0] * offset, point[1] + normal[1] * offset];
  });
}

function buildResult(a: JsonMapGeometry, b: JsonMapGeometry, shared: SharedPoliticalBorder, border: MapCoordinate[]): BorderShapeResult {
  const aGeometry = replaceSharedRun(a, shared.a, border);
  const bGeometry = replaceSharedRun(b, shared.b, border);
  return { aGeometry, bGeometry, border, originalLength: shared.length, generatedLength: polylineLength(border) };
}

export function smoothSharedPoliticalBorder(a: JsonMapGeometry, b: JsonMapGeometry, options: { tolerance: number; smoothness?: number; detail?: number }): BorderShapeResult | null {
  const shared = findSharedPoliticalBorder(a, b, options.tolerance);
  if (!shared || shared.points.length < 2) return null;
  const smoothness = clamp(options.smoothness ?? 0.78, 0, 1);
  const detail = clamp(options.detail ?? 0.65, 0, 1);
  const averageStep = shared.length / Math.max(1, shared.points.length - 1);
  const simplified = simplifyOpen(shared.points, averageStep * (0.5 + smoothness * 1.9));
  const iterations = Math.max(1, Math.round(1 + smoothness * 3));
  let curved = chaikinOpen(simplified, iterations, smoothness);
  curved = resamplePolyline(curved, Math.max(10, Math.round(12 + detail * 60)));
  if (!pathInsideUnion(curved, a, b)) {
    curved = chaikinOpen(shared.points, Math.max(1, iterations - 1), smoothness * 0.55);
    curved = resamplePolyline(curved, Math.max(10, Math.round(10 + detail * 42)));
  }
  if (!pathInsideUnion(curved, a, b)) return null;
  return buildResult(a, b, shared, curved);
}

export function randomizeSharedPoliticalBorder(a: JsonMapGeometry, b: JsonMapGeometry, options: { tolerance: number; roughness?: number; detail?: number; seed?: number }): BorderShapeResult | null {
  const shared = findSharedPoliticalBorder(a, b, options.tolerance);
  if (!shared || shared.points.length < 2) return null;
  const roughness = clamp(options.roughness ?? 0.65, 0, 1);
  const detail = clamp(options.detail ?? 0.6, 0, 1);
  const seed = Math.max(1, Math.round(options.seed ?? 1));
  const averageStep = shared.length / Math.max(1, shared.points.length - 1);
  const simplified = simplifyOpen(shared.points, averageStep * 1.2);
  const base = chaikinOpen(simplified, 2, 0.72);

  for (const scale of [1, 0.78, 0.58, 0.42, 0.28]) {
    const randomBorder = randomizePath(base, roughness, detail, seed, scale);
    if (!pathInsideUnion(randomBorder, a, b)) continue;
    return buildResult(a, b, shared, randomBorder);
  }
  return null;
}

export function sharedBorderNeighbors(selected: WorldMapFeature, rows: WorldMapFeature[], tolerance: number) {
  if (selected.location_kind !== "country" || !["Polygon", "MultiPolygon"].includes(selected.geometry.type)) return [] as WorldMapFeature[];
  return rows
    .filter((row) => Number(row.feature_id) !== Number(selected.feature_id) && row.location_kind === "country" && ["Polygon", "MultiPolygon"].includes(row.geometry.type))
    .map((row) => ({ row, shared: findSharedPoliticalBorder(selected.geometry as JsonMapGeometry, row.geometry as JsonMapGeometry, tolerance) }))
    .filter((item) => item.shared && item.shared.length > tolerance * 2)
    .sort((left, right) => (right.shared?.length ?? 0) - (left.shared?.length ?? 0))
    .map((item) => item.row);
}
