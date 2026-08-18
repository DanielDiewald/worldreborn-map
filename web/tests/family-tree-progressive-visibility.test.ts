import assert from "node:assert/strict";
import test from "node:test";
import { buildFamilyExpansionMap, resolveProgressiveFamilyVisibility } from "../src/lib/family-tree-visibility";

const people = [1, 2, 90, 91, 92];
const edges = [
  { a: 1, b: 2, code: "parent", directed: true },
  { a: 2, b: 90, code: "spouse", directed: false },
  { a: 91, b: 90, code: "parent", directed: true },
  { a: 91, b: 92, code: "parent", directed: true },
];

test("a main-line expansion reveals only the direct side-house contact", () => {
  const result = resolveProgressiveFamilyVisibility(people, [1, 2], [2], edges);
  assert.deepEqual([...result.visible].sort((a, b) => a - b), [1, 2, 90]);
});

test("expanding the visible side contact reveals its next immediate family ring", () => {
  const result = resolveProgressiveFamilyVisibility(people, [1, 2], [2, 90], edges);
  assert.deepEqual([...result.visible].sort((a, b) => a - b), [1, 2, 90, 91, 92]);
});

test("siblings are immediate expansion neighbors even when only common parent rows exist", () => {
  const neighbors = buildFamilyExpansionMap(people, edges);
  assert.equal(neighbors.get(90)?.has(92), true);
  assert.equal(neighbors.get(92)?.has(90), true);
});

test("collapsing the side contact hides the deeper family again", () => {
  const result = resolveProgressiveFamilyVisibility(people, [1, 2], [2], edges);
  assert.equal(result.visible.has(90), true);
  assert.equal(result.visible.has(91), false);
  assert.equal(result.visible.has(92), false);
});
