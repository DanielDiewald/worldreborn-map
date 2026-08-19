import assert from "node:assert/strict";
import test from "node:test";
import { fitCountryAroundExistingCountries } from "../src/components/map/map-country-fit";

const subject = {
  type: "Polygon",
  coordinates: [[[0, 0], [120, 0], [120, 80], [0, 80], [0, 0]]],
};
const existing = {
  type: "Polygon",
  coordinates: [[[0, 0], [55, 0], [55, 80], [0, 80], [0, 0]]],
};

function rings(geometry: { type: string; coordinates: unknown }) {
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) return geometry.coordinates as number[][][];
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) return (geometry.coordinates as number[][][][]).flat();
  return [] as number[][][];
}
function pointInRing(point: [number, number], ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i], b = ring[j];
    const crosses = ((a[1] > point[1]) !== (b[1] > point[1])) && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / ((b[1] - a[1]) || 1e-12) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}
function contains(geometry: { type: string; coordinates: unknown }, point: [number, number]) {
  return rings(geometry).some((polygon) => polygon[0] && pointInRing(point, polygon[0]) && !polygon.slice(1).some((hole) => pointInRing(point, hole)));
}

test("new neighboring country automatically removes already occupied country area", () => {
  const result = fitCountryAroundExistingCountries(subject, [existing], 900);
  assert.ok(result);
  assert.ok(result.removedPixels > 0);
  assert.ok(result.keptPixels > 0);
  assert.equal(contains(result.geometry, [20, 40]), false);
  assert.equal(contains(result.geometry, [90, 40]), true);
});

test("country fit leaves geometry untouched when no existing country intersects", () => {
  const farAway = { type: "Polygon", coordinates: [[[300, 0], [340, 0], [340, 40], [300, 40], [300, 0]]] };
  const result = fitCountryAroundExistingCountries(subject, [farAway], 900);
  assert.ok(result);
  assert.equal(result.removedPixels, 0);
  assert.deepEqual(result.geometry, subject);
});
