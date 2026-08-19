import type { JsonMapGeometry, MapCoordinate, MapExtent } from "./map-geometry-guides";

type Ring = MapCoordinate[];
type Polygon = Ring[];
type Edge = { start: [number, number]; end: [number, number]; dir: 0 | 1 | 2 | 3 };
type Grid = { width: number; height: number; extent: MapExtent; mask: Uint8Array };
type Seed = { x: number; y: number; weight: number; phase: number; angle: number; stretch: number };

export type AutoSubdivisionOptions = {
  count: number;
  seed?: number;
  irregularity?: number;
  balance?: number;
  maxSide?: number;
};

export type AutoSubdivisionResult = {
  parts: JsonMapGeometry[];
  pixelAreas: number[];
  shares: number[];
  seed: number;
  grid: { width: number; height: number };
};

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function samePoint(a: MapCoordinate, b: MapCoordinate, epsilon = 1e-6) { return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon; }
function closeRing(ring: Ring) { if (ring.length && !samePoint(ring[0], ring[ring.length - 1])) ring.push([...ring[0]] as MapCoordinate); return ring; }
function key(point: [number, number]) { return `${point[0]},${point[1]}`; }

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
function polygonsFromGeometry(geometry: JsonMapGeometry) {
  if (geometry.type === "Polygon") { const polygon = readPolygon(geometry.coordinates); return polygon ? [polygon] : []; }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) return geometry.coordinates.map(readPolygon).filter((value): value is Polygon => Boolean(value));
  return [];
}
function geometryExtent(geometry: JsonMapGeometry): MapExtent | null {
  const polygons = polygonsFromGeometry(geometry); if (!polygons.length) return null;
  let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY, maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
  for (const polygon of polygons) for (const ring of polygon) for (const [x, y] of ring) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}
function mapToPixel(grid: Pick<Grid, "width" | "height" | "extent">, point: MapCoordinate): MapCoordinate {
  const [minX, minY, maxX, maxY] = grid.extent;
  return [((point[0] - minX) / Math.max(1e-9, maxX - minX)) * (grid.width - 1), ((maxY - point[1]) / Math.max(1e-9, maxY - minY)) * (grid.height - 1)];
}
function pixelToMap(grid: Pick<Grid, "width" | "height" | "extent">, point: MapCoordinate): MapCoordinate {
  const [minX, minY, maxX, maxY] = grid.extent;
  return [minX + (point[0] / Math.max(1, grid.width - 1)) * (maxX - minX), maxY - (point[1] / Math.max(1, grid.height - 1)) * (maxY - minY)];
}

function pointInRing(point: MapCoordinate, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i], b = ring[j];
    const crosses = ((a[1] > point[1]) !== (b[1] > point[1])) && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / ((b[1] - a[1]) || 1e-12) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}
function pointInPolygon(point: MapCoordinate, polygon: Polygon) {
  if (!polygon[0] || !pointInRing(point, polygon[0])) return false;
  for (let index = 1; index < polygon.length; index += 1) if (pointInRing(point, polygon[index])) return false;
  return true;
}

function createGrid(parent: JsonMapGeometry, maxSide: number): Grid | null {
  const extent = geometryExtent(parent); if (!extent) return null;
  const rawWidth = Math.max(1e-6, extent[2] - extent[0]), rawHeight = Math.max(1e-6, extent[3] - extent[1]);
  const padX = rawWidth * 0.0025 + 1e-6, padY = rawHeight * 0.0025 + 1e-6;
  const padded: MapExtent = [extent[0] - padX, extent[1] - padY, extent[2] + padX, extent[3] + padY];
  const aspect = rawWidth / rawHeight;
  const width = aspect >= 1 ? maxSide : Math.max(128, Math.round(maxSide * aspect));
  const height = aspect >= 1 ? Math.max(128, Math.round(maxSide / aspect)) : maxSide;
  const grid: Grid = { width, height, extent: padded, mask: new Uint8Array(width * height) };
  const pixelPolygons = polygonsFromGeometry(parent).map((polygon) => polygon.map((ring) => ring.map((point) => mapToPixel(grid, point))));
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (pixelPolygons.some((polygon) => pointInPolygon([x + 0.5, y + 0.5], polygon))) grid.mask[y * width + x] = 1;
  }
  return grid;
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
function landCells(grid: Grid) {
  const result: number[] = [];
  for (let index = 0; index < grid.mask.length; index += 1) if (grid.mask[index]) result.push(index);
  return result;
}
function cellPoint(index: number, width: number): MapCoordinate { return [index % width, Math.floor(index / width)]; }
function squaredDistance(a: MapCoordinate, b: MapCoordinate) { const dx = a[0] - b[0], dy = a[1] - b[1]; return dx * dx + dy * dy; }

function hashNoise(x: number, y: number, seed: number) {
  let value = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  value ^= value >>> 16;
  return ((value >>> 0) / 4294967295) * 2 - 1;
}
function smoothStep(value: number) { return value * value * (3 - 2 * value); }
function valueNoise(x: number, y: number, seed: number) {
  const x0 = Math.floor(x), y0 = Math.floor(y), tx = smoothStep(x - x0), ty = smoothStep(y - y0);
  const a = hashNoise(x0, y0, seed), b = hashNoise(x0 + 1, y0, seed), c = hashNoise(x0, y0 + 1, seed), d = hashNoise(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * tx, bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}
function fractalNoise(x: number, y: number, seed: number) {
  let value = 0, amplitude = 0.56, frequency = 1, normalizer = 0;
  for (let octave = 0; octave < 4; octave += 1) {
    value += valueNoise(x * frequency, y * frequency, seed + octave * 1013) * amplitude;
    normalizer += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return value / Math.max(1e-9, normalizer);
}
function organicWarp(x: number, y: number, irregularity: number, grid: Grid, noiseSeed: number): MapCoordinate {
  if (irregularity <= 0.001) return [x, y];
  const maxDimension = Math.max(grid.width, grid.height);
  const nx = x / maxDimension, ny = y / maxDimension;
  const coarseX = fractalNoise(nx * 3.15 + 11.7, ny * 3.15 - 4.9, noiseSeed ^ 0x4f1bbcdc);
  const coarseY = fractalNoise(nx * 3.15 - 8.2, ny * 3.15 + 14.3, noiseSeed ^ 0x7f4a7c15);
  const fineX = fractalNoise(nx * 6.4 + coarseY * 0.8, ny * 6.4 + coarseX * 0.8, noiseSeed ^ 0x2c9277b5);
  const fineY = fractalNoise(nx * 6.4 - coarseX * 0.8, ny * 6.4 + coarseY * 0.8, noiseSeed ^ 0x165667b1);
  const amplitude = maxDimension * (0.045 * irregularity + 0.085 * irregularity * irregularity);
  return [
    x + amplitude * (coarseX * 0.7 + fineX * 0.3),
    y + amplitude * (coarseY * 0.7 + fineY * 0.3),
  ];
}

function chooseSeeds(grid: Grid, cells: number[], count: number, random: () => number) {
  const seeds: Seed[] = [];
  const first = cellPoint(cells[Math.floor(random() * cells.length)], grid.width);
  seeds.push({ x: first[0], y: first[1], weight: 1, phase: random() * Math.PI * 2, angle: random() * Math.PI, stretch: 0.72 + random() * 0.72 });
  const sampleCount = Math.min(cells.length, 3000);
  while (seeds.length < count) {
    let bestPoint = first, bestScore = -1;
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const point = cellPoint(cells[Math.floor(random() * cells.length)], grid.width);
      let nearest = Number.POSITIVE_INFINITY;
      for (const seed of seeds) nearest = Math.min(nearest, squaredDistance(point, [seed.x, seed.y]));
      const score = nearest * (0.9 + random() * 0.2);
      if (score > bestScore) { bestScore = score; bestPoint = point; }
    }
    seeds.push({ x: bestPoint[0], y: bestPoint[1], weight: 1, phase: random() * Math.PI * 2, angle: random() * Math.PI, stretch: 0.72 + random() * 0.72 });
  }
  return seeds;
}
function organicDistance(point: MapCoordinate, seed: Seed, irregularity: number, grid: Grid, noiseSeed: number, seedIndex: number) {
  const warped = organicWarp(point[0], point[1], irregularity, grid, noiseSeed);
  const dx = warped[0] - seed.x, dy = warped[1] - seed.y;
  const cosine = Math.cos(seed.angle), sine = Math.sin(seed.angle);
  const rx = dx * cosine + dy * sine, ry = -dx * sine + dy * cosine;
  const stretch = 1 + (seed.stretch - 1) * irregularity;
  const elongated = (rx * rx) / Math.max(0.3, stretch * stretch) + (ry * ry) * Math.max(0.3, stretch * stretch);
  if (irregularity <= 0.001) return elongated;
  const maxDimension = Math.max(grid.width, grid.height);
  const localNoise = fractalNoise((point[0] / maxDimension) * 4.7 + seedIndex * 0.31, (point[1] / maxDimension) * 4.7 - seedIndex * 0.19, noiseSeed + seedIndex * 7919);
  const angle = Math.atan2(ry, rx);
  const lobe = Math.sin(angle * 2.15 + seed.phase + localNoise * 1.35);
  return elongated * (1 + irregularity * 0.085 * lobe);
}
function assignCells(grid: Grid, cells: number[], seeds: Seed[], irregularity: number, noiseSeed: number) {
  const owners = new Int16Array(grid.mask.length); owners.fill(-1);
  const counts = new Int32Array(seeds.length), sumsX = new Float64Array(seeds.length), sumsY = new Float64Array(seeds.length);
  for (const index of cells) {
    const x = index % grid.width, y = Math.floor(index / grid.width);
    let best = 0, bestScore = Number.POSITIVE_INFINITY;
    for (let seedIndex = 0; seedIndex < seeds.length; seedIndex += 1) {
      const seed = seeds[seedIndex];
      const score = organicDistance([x, y], seed, irregularity, grid, noiseSeed, seedIndex) / Math.max(0.18, seed.weight);
      if (score < bestScore) { bestScore = score; best = seedIndex; }
    }
    owners[index] = best; counts[best] += 1; sumsX[best] += x; sumsY[best] += y;
  }
  return { owners, counts, sumsX, sumsY };
}
function rebalanceSeeds(grid: Grid, cells: number[], seeds: Seed[], irregularity: number, balance: number, noiseSeed: number) {
  const total = cells.length, target = total / seeds.length;
  let assignment = assignCells(grid, cells, seeds, irregularity, noiseSeed);
  for (let iteration = 0; iteration < 5; iteration += 1) {
    for (let index = 0; index < seeds.length; index += 1) {
      const count = assignment.counts[index];
      if (count > 0) {
        const centroidX = assignment.sumsX[index] / count, centroidY = assignment.sumsY[index] / count;
        seeds[index].x = seeds[index].x * 0.35 + centroidX * 0.65;
        seeds[index].y = seeds[index].y * 0.35 + centroidY * 0.65;
      }
      const ratio = target / Math.max(1, count);
      const correction = Math.pow(clamp(ratio, 0.55, 1.8), 0.72 * balance);
      seeds[index].weight = clamp(seeds[index].weight * correction, 0.28, 3.8);
    }
    assignment = assignCells(grid, cells, seeds, irregularity, noiseSeed);
  }
  return assignment;
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
function removeCollinear(ring: Ring) {
  if (ring.length < 5) return ring;
  const open = ring.slice(0, -1), result: Ring = [];
  for (let index = 0; index < open.length; index += 1) {
    const prev = open[(index - 1 + open.length) % open.length], cur = open[index], next = open[(index + 1) % open.length];
    const cross = (cur[0] - prev[0]) * (next[1] - cur[1]) - (cur[1] - prev[1]) * (next[0] - cur[0]);
    if (Math.abs(cross) > 1e-9) result.push(cur);
  }
  return closeRing(result.length >= 3 ? result : open);
}
function traceRings(mask: Uint8Array, width: number, height: number) {
  const edges = boundaryEdges(mask, width, height), outgoing = new Map<string, number[]>();
  edges.forEach((edge, index) => outgoing.set(key(edge.start), [...(outgoing.get(key(edge.start)) ?? []), index]));
  const used = new Uint8Array(edges.length), rings: Ring[] = [];
  for (let seed = 0; seed < edges.length; seed += 1) {
    if (used[seed]) continue;
    const start = edges[seed], startKey = key(start.start); let current = seed, guard = 0;
    const ring: Ring = [[start.start[0] / 2, start.start[1] / 2]];
    while (guard++ <= edges.length + 4) {
      const edge = edges[current]; if (used[current]) break; used[current] = 1; ring.push([edge.end[0] / 2, edge.end[1] / 2]);
      if (key(edge.end) === startKey) break;
      const candidates = (outgoing.get(key(edge.end)) ?? []).filter((id) => !used[id]); if (!candidates.length) break;
      candidates.sort((a, b) => turnRank(edge.dir, edges[a].dir) - turnRank(edge.dir, edges[b].dir)); current = candidates[0];
    }
    const cleaned = removeCollinear(closeRing(ring)); if (cleaned.length >= 4 && samePoint(cleaned[0], cleaned[cleaned.length - 1])) rings.push(cleaned);
  }
  return rings;
}
function signedArea(ring: Ring) { let area = 0; for (let index = 0; index < ring.length - 1; index += 1) area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1]; return area / 2; }
function groupRings(rings: Ring[]) {
  const significant = rings.filter((ring) => Math.abs(signedArea(ring)) >= 2); if (!significant.length) return [] as Polygon[];
  const largest = significant.reduce((best, ring) => Math.abs(signedArea(ring)) > Math.abs(signedArea(best)) ? ring : best, significant[0]), sign = Math.sign(signedArea(largest)) || 1;
  const outers = significant.filter((ring) => Math.sign(signedArea(ring)) === sign).sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a))), holes = significant.filter((ring) => Math.sign(signedArea(ring)) !== sign), polygons = outers.map((outer) => [outer] as Polygon);
  for (const hole of holes) {
    let target = -1, targetArea = Number.POSITIVE_INFINITY;
    for (let index = 0; index < outers.length; index += 1) { const area = Math.abs(signedArea(outers[index])); if (area < targetArea && pointInRing(hole[0], outers[index])) { target = index; targetArea = area; } }
    if (target >= 0) polygons[target].push(hole);
  }
  return polygons;
}
function geometryFromMask(grid: Grid, mask: Uint8Array): JsonMapGeometry | null {
  const polygons = groupRings(traceRings(mask, grid.width, grid.height)); if (!polygons.length) return null;
  const mapped = polygons.map((polygon) => polygon.map((ring) => ring.map((point) => pixelToMap(grid, [clamp(point[0], 0, grid.width - 1), clamp(point[1], 0, grid.height - 1)]))));
  return mapped.length === 1 ? { type: "Polygon", coordinates: mapped[0] } : { type: "MultiPolygon", coordinates: mapped };
}

export function autoSubdividePolygon(parent: JsonMapGeometry, options: AutoSubdivisionOptions): AutoSubdivisionResult | null {
  if (!["Polygon", "MultiPolygon"].includes(parent.type)) return null;
  const count = clamp(Math.round(options.count), 2, 24), seedValue = Math.max(1, Math.round(options.seed ?? 1));
  const irregularity = clamp(options.irregularity ?? 0.7, 0, 1), balance = clamp(options.balance ?? 0.82, 0, 1), maxSide = clamp(Math.round(options.maxSide ?? 420), 256, 720);
  const grid = createGrid(parent, maxSide); if (!grid) return null;
  const cells = landCells(grid); if (cells.length < count * 40) return null;
  const random = mulberry32(seedValue), seeds = chooseSeeds(grid, cells, count, random);
  const assignment = rebalanceSeeds(grid, cells, seeds, irregularity, balance, seedValue);
  if ([...assignment.counts].some((area) => area < Math.max(12, cells.length * 0.003))) return null;

  const parts: JsonMapGeometry[] = [], pixelAreas: number[] = [];
  for (let owner = 0; owner < count; owner += 1) {
    const mask = new Uint8Array(grid.mask.length);
    for (const index of cells) if (assignment.owners[index] === owner) mask[index] = 1;
    const geometry = geometryFromMask(grid, mask); if (!geometry) return null;
    parts.push(geometry); pixelAreas.push(assignment.counts[owner]);
  }
  const total = pixelAreas.reduce((sum, value) => sum + value, 0);
  return { parts, pixelAreas, shares: pixelAreas.map((value) => value / Math.max(1, total)), seed: seedValue, grid: { width: grid.width, height: grid.height } };
}
