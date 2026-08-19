import assert from "node:assert/strict";
import test from "node:test";
import {
  findSharedPoliticalBorder,
  randomizeSharedPoliticalBorder,
  smoothSharedPoliticalBorder,
} from "../src/components/map/map-border-shaping";

const left = {
  type: "Polygon",
  coordinates: [[
    [0, 0], [100, 0], [105, 20], [95, 40], [104, 60], [97, 80], [100, 100], [0, 100], [0, 0],
  ]],
};

const right = {
  type: "Polygon",
  coordinates: [[
    [100, 0], [200, 0], [200, 100], [100, 100], [97, 80], [104, 60], [95, 40], [105, 20], [100, 0],
  ]],
};

function endpoints(points: Array<[number, number]>) {
  return [points[0], points[points.length - 1]];
}
function segmentLengths(points: Array<[number, number]>) {
  const lengths: number[] = [];
  for (let index = 1; index < points.length; index += 1) lengths.push(Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]));
  return lengths;
}

test("detects the longest genuinely shared political border", () => {
  const border = findSharedPoliticalBorder(left, right, 0.01);
  assert.ok(border);
  assert.equal(border.points.length, 6);
  assert.deepEqual(endpoints(border.points), [[100, 0], [100, 100]]);
});

test("smoothing replaces the same shared chain in both countries", () => {
  const result = smoothSharedPoliticalBorder(left, right, { tolerance: 0.01, smoothness: 0.9, detail: 0.8 });
  assert.ok(result);
  assert.ok(result.border.length > 10);
  assert.deepEqual(endpoints(result.border), [[100, 0], [100, 100]]);
  const sharedAfter = findSharedPoliticalBorder(result.aGeometry, result.bGeometry, 0.01);
  assert.ok(sharedAfter);
  assert.ok(sharedAfter.points.length > 10);
});

test("random borders are deterministic for the same seed and keep fixed endpoints", () => {
  const first = randomizeSharedPoliticalBorder(left, right, { tolerance: 0.01, roughness: 0.85, detail: 0.8, seed: 4242 });
  const second = randomizeSharedPoliticalBorder(left, right, { tolerance: 0.01, roughness: 0.85, detail: 0.8, seed: 4242 });
  assert.ok(first && second);
  assert.deepEqual(first.border, second.border);
  assert.deepEqual(endpoints(first.border), [[100, 0], [100, 100]]);
  assert.notDeepEqual(first.border, findSharedPoliticalBorder(left, right, 0.01)?.points);
});

test("different seeds create different shared border variants", () => {
  const first = randomizeSharedPoliticalBorder(left, right, { tolerance: 0.01, roughness: 0.8, detail: 0.75, seed: 100 });
  const second = randomizeSharedPoliticalBorder(left, right, { tolerance: 0.01, roughness: 0.8, detail: 0.75, seed: 200 });
  assert.ok(first && second);
  assert.notDeepEqual(first.border, second.border);
  const sharedFirst = findSharedPoliticalBorder(first.aGeometry, first.bGeometry, 0.01);
  assert.ok(sharedFirst);
  assert.ok(sharedFirst.points.length >= first.border.length - 1);
});

test("random border post-processing avoids isolated micro segments", () => {
  const result = randomizeSharedPoliticalBorder(left, right, { tolerance: 0.01, roughness: 1, detail: 1, seed: 99173 });
  assert.ok(result);
  const lengths = segmentLengths(result.border);
  const average = lengths.reduce((sum, value) => sum + value, 0) / Math.max(1, lengths.length);
  const tiny = lengths.filter((value) => value < average * 0.08);
  assert.ok(tiny.length <= 1, `found ${tiny.length} tiny segments`);
});
