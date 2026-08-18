import assert from "node:assert/strict";
import test from "node:test";
import { groupAncestorRelationships } from "../src/lib/family-tree-ancestor-groups";

test("a spouse is not an ancestor unless that ancestor relationship exists explicitly", () => {
  const groups = groupAncestorRelationships([
    { a: 1, b: 2, code: "spouse" },
    { a: 2, b: 5, code: "ancestor" },
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].ancestorIds, [2]);
  assert.equal(groups[0].joint, false);
});

test("two explicit partner ancestors of the same descendant become one visual ancestor unit", () => {
  const groups = groupAncestorRelationships([
    { a: 1, b: 2, code: "spouse" },
    { a: 1, b: 5, code: "ancestor" },
    { a: 2, b: 5, code: "ancestor" },
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].ancestorIds, [1, 2]);
  assert.equal(groups[0].descendantId, 5);
  assert.equal(groups[0].joint, true);
});

test("two unrelated explicit ancestors stay separate even when they share a descendant", () => {
  const groups = groupAncestorRelationships([
    { a: 1, b: 5, code: "ancestor" },
    { a: 2, b: 5, code: "ancestor" },
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.ancestorIds), [[1], [2]]);
});
