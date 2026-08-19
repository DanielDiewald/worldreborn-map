import assert from "node:assert/strict";
import test from "node:test";
import { clipPolygonToLandMask, clipPolygonToParentMask } from "../src/components/map/map-raster-clip";
import { rankSelectionCandidates } from "../src/components/map/map-selection";
import type { LandMaskGuide } from "../src/components/map/map-geometry-guides";

function guide(width: number, height: number, landCells: Array<[number, number]>): LandMaskGuide {
  const land = new Uint8Array(width * height);
  for (const [x, y] of landCells) land[y * width + x] = 1;
  return { width, height, extent: [0, 0, width - 1, height - 1], land, boundaryPixels: [] };
}
function allCoordinates(value: unknown): number[][] {
  const result: number[][] = [];
  const visit = (item: unknown) => {
    if (!Array.isArray(item)) return;
    if (item.length >= 2 && typeof item[0] === "number" && typeof item[1] === "number") result.push(item as number[]);
    else item.forEach(visit);
  };
  visit(value); return result;
}

test("country clipping removes water around a rectangular land mass", () => {
  const cells: Array<[number, number]> = [];
  for (let y = 1; y <= 4; y += 1) for (let x = 2; x <= 5; x += 1) cells.push([x, y]);
  const clipped = clipPolygonToLandMask({ type: "Polygon", coordinates: [[[0, 0], [7, 0], [7, 5], [0, 5], [0, 0]]] }, guide(8, 6, cells));
  assert.equal(clipped.type, "Polygon");
  const coordinates = allCoordinates(clipped.coordinates);
  assert.ok(coordinates.length >= 4);
  assert.ok(Math.min(...coordinates.map((point) => point[0])) > 1);
  assert.ok(Math.max(...coordinates.map((point) => point[0])) < 6);
});

test("country clipping keeps disconnected islands as a MultiPolygon", () => {
  const clipped = clipPolygonToLandMask({ type: "Polygon", coordinates: [[[0, 0], [9, 0], [9, 5], [0, 5], [0, 0]]] }, guide(10, 6, [
    [1, 2], [2, 2], [1, 3], [2, 3], [7, 1], [8, 1], [7, 2], [8, 2],
  ]));
  assert.equal(clipped.type, "MultiPolygon");
  assert.equal((clipped.coordinates as unknown[]).length, 2);
});

test("province clipping performs a real child intersection with the parent polygon", () => {
  const parent = { type: "Polygon", coordinates: [[[2, 2], [8, 2], [8, 8], [2, 8], [2, 2]]] };
  const child = { type: "Polygon", coordinates: [[[0, 4], [10, 4], [10, 7], [0, 7], [0, 4]]] };
  const clipped = clipPolygonToParentMask(child, parent, 512);
  const coordinates = allCoordinates(clipped.coordinates);
  assert.ok(coordinates.length >= 4);
  assert.ok(Math.min(...coordinates.map((point) => point[0])) >= 1.95);
  assert.ok(Math.max(...coordinates.map((point) => point[0])) <= 8.05);
  assert.ok(Math.min(...coordinates.map((point) => point[1])) >= 3.9);
  assert.ok(Math.max(...coordinates.map((point) => point[1])) <= 7.1);
});

test("overlap selection prefers points, then provinces, then countries", () => {
  const ranked = rankSelectionCandidates([
    { featureId: 1, label: "Land", geometryType: "Polygon", locationKind: "country", extentArea: 1000 },
    { featureId: 2, label: "Provinz", geometryType: "Polygon", locationKind: "province", extentArea: 100 },
    { featureId: 3, label: "Stadt", geometryType: "Point", locationKind: "city", extentArea: 0 },
  ]);
  assert.deepEqual(ranked.map((item) => item.featureId), [3, 2, 1]);
});
