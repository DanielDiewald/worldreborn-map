import type { JsonMapGeometry, MapCoordinate, MapExtent } from "./map-geometry-guides";

type Ring = MapCoordinate[];
type Polygon = Ring[];
type Edge = { start: [number, number]; end: [number, number]; dir: 0 | 1 | 2 | 3 };
type Grid = { width: number; height: number; extent: MapExtent; mask: Uint8Array };

export type PolygonDividerSplit = {
  parts: [JsonMapGeometry, JsonMapGeometry];
  pixelAreas: [number, number];
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
function lineFromGeometry(geometry: JsonMapGeometry) {
  if (geometry.type !== "LineString" || !Array.isArray(geometry.coordinates)) return null;
  const result: MapCoordinate[] = [];
  for (const item of geometry.coordinates) {
    if (!Array.isArray(item) || item.length < 2) return null;
    const x = Number(item[0]), y = Number(item[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    result.push([x, y]);
  }
  return result.length >= 2 ? result : null;
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
  const paddingX = rawWidth * 0.003 + 1e-6, paddingY = rawHeight * 0.003 + 1e-6;
  const padded: MapExtent = [extent[0] - paddingX, extent[1] - paddingY, extent[2] + paddingX, extent[3] + paddingY];
  const aspect = rawWidth / rawHeight;
  const width = aspect >= 1 ? maxSide : Math.max(128, Math.round(maxSide * aspect));
  const height = aspect >= 1 ? Math.max(128, Math.round(maxSide / aspect)) : maxSide;
  const grid: Grid = { width, height, extent: padded, mask: new Uint8Array(width * height) };
  const pixelPolygons = polygonsFromGeometry(parent).map((polygon) => polygon.map((ring) => ring.map((point) => mapToPixel(grid, point))));
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) if (pixelPolygons.some((polygon) => pointInPolygon([x, y], polygon))) grid.mask[y * width + x] = 1;
  return grid;
}
function nearestSegmentSide(point: MapCoordinate, line: MapCoordinate[]) {
  let bestDistance = Number.POSITIVE_INFINITY, bestSide = 0;
  for (let index = 0; index < line.length - 1; index += 1) {
    const a = line[index], b = line[index + 1], dx = b[0] - a[0], dy = b[1] - a[1], lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) continue;
    const ratio = clamp(((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared, 0, 1);
    const px = a[0] + ratio * dx, py = a[1] + ratio * dy;
    const distance = (point[0] - px) ** 2 + (point[1] - py) ** 2;
    if (distance < bestDistance) { bestDistance = distance; bestSide = dx * (point[1] - a[1]) - dy * (point[0] - a[0]); }
  }
  return bestSide;
}
function lineTouchesParent(grid: Grid, line: MapCoordinate[]) {
  for (let index = 0; index < line.length - 1; index += 1) {
    const a = line[index], b = line[index + 1], distance = Math.hypot(b[0] - a[0], b[1] - a[1]), steps = Math.max(1, Math.ceil(distance));
    for (let step = 0; step <= steps; step += 1) {
      const ratio = step / steps, x = Math.round(a[0] + (b[0] - a[0]) * ratio), y = Math.round(a[1] + (b[1] - a[1]) * ratio);
      if (x >= 0 && y >= 0 && x < grid.width && y < grid.height && grid.mask[y * grid.width + x]) return true;
    }
  }
  return false;
}
function hasCell(mask: Uint8Array, width: number, height: number, x: number, y: number) { return x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1; }
function boundaryEdges(mask: Uint8Array, width: number, height: number) {
  const edges: Edge[] = [];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (!mask[y * width + x]) continue;
    const left = 2*x-1, right = 2*x+1, top = 2*y-1, bottom = 2*y+1;
    if (!hasCell(mask,width,height,x,y-1)) edges.push({start:[left,top],end:[right,top],dir:0});
    if (!hasCell(mask,width,height,x+1,y)) edges.push({start:[right,top],end:[right,bottom],dir:1});
    if (!hasCell(mask,width,height,x,y+1)) edges.push({start:[right,bottom],end:[left,bottom],dir:2});
    if (!hasCell(mask,width,height,x-1,y)) edges.push({start:[left,bottom],end:[left,top],dir:3});
  }
  return edges;
}
function turnRank(previous: Edge["dir"], next: Edge["dir"]) { const delta=(next-previous+4)%4; return delta===1?0:delta===0?1:delta===3?2:3; }
function removeCollinear(ring: Ring) {
  if (ring.length < 5) return ring;
  const open=ring.slice(0,-1), result:Ring=[];
  for(let index=0;index<open.length;index+=1){const prev=open[(index-1+open.length)%open.length],cur=open[index],next=open[(index+1)%open.length];const cross=(cur[0]-prev[0])*(next[1]-cur[1])-(cur[1]-prev[1])*(next[0]-cur[0]);if(Math.abs(cross)>1e-9)result.push(cur);}
  return closeRing(result.length>=3?result:open);
}
function traceRings(mask: Uint8Array, width: number, height: number) {
  const edges=boundaryEdges(mask,width,height), outgoing=new Map<string,number[]>(); edges.forEach((edge,index)=>outgoing.set(key(edge.start),[...(outgoing.get(key(edge.start))??[]),index]));
  const used=new Uint8Array(edges.length), rings:Ring[]=[];
  for(let seed=0;seed<edges.length;seed+=1){if(used[seed])continue;const start=edges[seed],startKey=key(start.start);let current=seed,guard=0;const ring:Ring=[[start.start[0]/2,start.start[1]/2]];while(guard++<=edges.length+4){const edge=edges[current];if(used[current])break;used[current]=1;ring.push([edge.end[0]/2,edge.end[1]/2]);if(key(edge.end)===startKey)break;const candidates=(outgoing.get(key(edge.end))??[]).filter((id)=>!used[id]);if(!candidates.length)break;candidates.sort((a,b)=>turnRank(edge.dir,edges[a].dir)-turnRank(edge.dir,edges[b].dir));current=candidates[0];}const cleaned=removeCollinear(closeRing(ring));if(cleaned.length>=4&&samePoint(cleaned[0],cleaned[cleaned.length-1]))rings.push(cleaned);}
  return rings;
}
function signedArea(ring: Ring) { let area=0; for(let index=0;index<ring.length-1;index+=1)area+=ring[index][0]*ring[index+1][1]-ring[index+1][0]*ring[index][1]; return area/2; }
function groupRings(rings: Ring[]) {
  const significant=rings.filter((ring)=>Math.abs(signedArea(ring))>=2); if(!significant.length)return [] as Polygon[];
  const largest=significant.reduce((best,ring)=>Math.abs(signedArea(ring))>Math.abs(signedArea(best))?ring:best,significant[0]), sign=Math.sign(signedArea(largest))||1;
  const outers=significant.filter((ring)=>Math.sign(signedArea(ring))===sign).sort((a,b)=>Math.abs(signedArea(b))-Math.abs(signedArea(a))), holes=significant.filter((ring)=>Math.sign(signedArea(ring))!==sign), polygons=outers.map((outer)=>[outer] as Polygon);
  for(const hole of holes){let target=-1,targetArea=Number.POSITIVE_INFINITY;for(let index=0;index<outers.length;index+=1){const area=Math.abs(signedArea(outers[index]));if(area<targetArea&&pointInRing(hole[0],outers[index])){target=index;targetArea=area;}}if(target>=0)polygons[target].push(hole);}
  return polygons;
}
function geometryFromMask(grid: Grid, mask: Uint8Array): JsonMapGeometry | null {
  const polygons=groupRings(traceRings(mask,grid.width,grid.height)); if(!polygons.length)return null;
  const mapped=polygons.map((polygon)=>polygon.map((ring)=>ring.map((point)=>pixelToMap(grid,[clamp(point[0],0,grid.width-1),clamp(point[1],0,grid.height-1)]))));
  return mapped.length===1?{type:"Polygon",coordinates:mapped[0]}:{type:"MultiPolygon",coordinates:mapped};
}

/**
 * Splits a polygonal political area into exactly two raster-partitioned polygons.
 * Every parent pixel belongs to exactly one side, so the generated parts share a
 * boundary without a gap. The divider should be drawn from boundary to boundary.
 */
export function splitPolygonByDivider(parent: JsonMapGeometry, divider: JsonMapGeometry, maxSide = 1024): PolygonDividerSplit | null {
  if (!["Polygon","MultiPolygon"].includes(parent.type)) return null;
  const line = lineFromGeometry(divider); if (!line) return null;
  const grid = createGrid(parent, Math.max(384, Math.min(1536, maxSide))); if (!grid) return null;
  const pixelLine = line.map((point)=>mapToPixel(grid,point));
  if (!lineTouchesParent(grid,pixelLine)) return null;
  const a=new Uint8Array(grid.mask.length),b=new Uint8Array(grid.mask.length);let areaA=0,areaB=0;
  for(let y=0;y<grid.height;y+=1)for(let x=0;x<grid.width;x+=1){const index=y*grid.width+x;if(!grid.mask[index])continue;const side=nearestSegmentSide([x,y],pixelLine);if(side>=0){a[index]=1;areaA+=1;}else{b[index]=1;areaB+=1;}}
  const total=areaA+areaB,minArea=Math.max(16,Math.floor(total*0.01)); if(areaA<minArea||areaB<minArea)return null;
  const geometryA=geometryFromMask(grid,a),geometryB=geometryFromMask(grid,b); if(!geometryA||!geometryB)return null;
  return {parts:[geometryA,geometryB],pixelAreas:[areaA,areaB]};
}
