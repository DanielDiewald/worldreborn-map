import assert from "node:assert/strict";
import test from "node:test";
import { splitPolygonByDivider } from "../src/components/map/map-polygon-split";

test("divider partitions a parent polygon into two meaningful parts", () => {
  const parent = { type: "Polygon", coordinates: [[[0,0],[100,0],[100,100],[0,100],[0,0]]] };
  const divider = { type: "LineString", coordinates: [[50,-10],[50,110]] };
  const result = splitPolygonByDivider(parent, divider, 512);
  assert.ok(result);
  assert.equal(result.parts.length, 2);
  assert.ok(result.pixelAreas[0] > 0);
  assert.ok(result.pixelAreas[1] > 0);
  const ratio = result.pixelAreas[0] / result.pixelAreas[1];
  assert.ok(ratio > 0.9 && ratio < 1.1);
});

test("divider rejects a split where one side would be negligible", () => {
  const parent = { type: "Polygon", coordinates: [[[0,0],[100,0],[100,100],[0,100],[0,0]]] };
  const divider = { type: "LineString", coordinates: [[0.2,-10],[0.2,110]] };
  assert.equal(splitPolygonByDivider(parent, divider, 512), null);
});

test("divider rejects a floating line that never reaches the outer boundary", () => {
  const parent = { type: "Polygon", coordinates: [[[0,0],[100,0],[100,100],[0,100],[0,0]]] };
  const divider = { type: "LineString", coordinates: [[50,30],[50,70]] };
  assert.equal(splitPolygonByDivider(parent, divider, 512), null);
});
