import assert from "node:assert/strict";
import test from "node:test";
import { autoSubdividePolygon } from "../src/components/map/map-auto-subdivide";

const rectangle = {
  type: "Polygon",
  coordinates: [[[0, 0], [240, 0], [240, 160], [0, 160], [0, 0]]],
};

test("automatic subdivision creates exactly the requested number of parts", () => {
  const result = autoSubdividePolygon(rectangle, { count: 6, seed: 42, irregularity: 0.4, balance: 0.9, maxSide: 320 });
  assert.ok(result);
  assert.equal(result.parts.length, 6);
  assert.equal(result.pixelAreas.length, 6);
  assert.equal(result.shares.length, 6);
  assert.ok(Math.abs(result.shares.reduce((sum, value) => sum + value, 0) - 1) < 1e-9);
  assert.ok(result.parts.every((part) => part.type === "Polygon" || part.type === "MultiPolygon"));
});

test("automatic subdivision is deterministic for the same seed and settings", () => {
  const first = autoSubdividePolygon(rectangle, { count: 5, seed: 12345, irregularity: 0.55, balance: 0.8, maxSide: 300 });
  const second = autoSubdividePolygon(rectangle, { count: 5, seed: 12345, irregularity: 0.55, balance: 0.8, maxSide: 300 });
  assert.ok(first && second);
  assert.deepEqual(first.pixelAreas, second.pixelAreas);
  assert.deepEqual(first.parts, second.parts);
});

test("balanced subdivision avoids negligible sliver regions on a regular parent", () => {
  const result = autoSubdividePolygon(rectangle, { count: 8, seed: 77, irregularity: 0.3, balance: 1, maxSide: 320 });
  assert.ok(result);
  const smallest = Math.min(...result.shares);
  const largest = Math.max(...result.shares);
  assert.ok(smallest > 0.045, `smallest share was ${smallest}`);
  assert.ok(largest < 0.24, `largest share was ${largest}`);
});

test("different seeds can produce a different partition", () => {
  const first = autoSubdividePolygon(rectangle, { count: 6, seed: 1, irregularity: 0.65, balance: 0.75, maxSide: 280 });
  const second = autoSubdividePolygon(rectangle, { count: 6, seed: 2, irregularity: 0.65, balance: 0.75, maxSide: 280 });
  assert.ok(first && second);
  assert.notDeepEqual(first.parts, second.parts);
});
