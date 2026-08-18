import assert from "node:assert/strict";
import test from "node:test";
import { isFamilyStructureEdge } from "../src/lib/family-tree-layout";
import { buildFamilyExpansionMap, resolveHouseFamilyVisibility } from "../src/lib/family-tree-visibility";

const people = [
  { personId: 1, gender: "male" },
  { personId: 2, gender: "female" },
  { personId: 3, gender: "male" },
  { personId: 4, gender: "female" },
  { personId: 5, gender: "female" },
  { personId: 6, gender: "male" },
  { personId: 7, gender: "male" },
  { personId: 8, gender: "female" },
];

const baseEdges = [
  { a: 1, b: 2, code: "spouse", directed: false, metadata: { house_descent_rule: "patrilineal" } },
  { a: 1, b: 3, code: "parent", directed: true },
  { a: 2, b: 3, code: "parent", directed: true },
  { a: 1, b: 4, code: "parent", directed: true },
  { a: 2, b: 4, code: "parent", directed: true },
  { a: 3, b: 5, code: "spouse", directed: false, metadata: { house_descent_rule: "patrilineal" } },
  { a: 3, b: 6, code: "parent", directed: true },
  { a: 5, b: 6, code: "parent", directed: true },
  { a: 4, b: 7, code: "spouse", directed: false, metadata: { house_descent_rule: "patrilineal" } },
  { a: 4, b: 8, code: "parent", directed: true },
  { a: 7, b: 8, code: "parent", directed: true },
];

test("house branches include paternal blood relatives born into the house but not a daughter's patrilineal children", () => {
  const visible = resolveHouseFamilyVisibility(people, [3, 6], baseEdges);
  assert.deepEqual([...visible].sort((a, b) => a - b), [1, 3, 4, 6]);
});

test("a matrilineal marriage keeps a daughter's children in the house", () => {
  const edges = baseEdges.map((edge) => edge.a === 4 && edge.b === 7 && edge.code === "spouse"
    ? { ...edge, metadata: { house_descent_rule: "matrilineal" } }
    : edge);
  const visible = resolveHouseFamilyVisibility(people, [3, 6], edges);
  assert.deepEqual([...visible].sort((a, b) => a - b), [1, 3, 4, 6, 8]);
});

test("a marriage can explicitly opt children out of automatic house assignment", () => {
  const edges = baseEdges.map((edge) => edge.a === 3 && edge.b === 5 && edge.code === "spouse"
    ? { ...edge, metadata: { house_descent_rule: "none" } }
    : edge);
  const visible = resolveHouseFamilyVisibility(people, [3], edges);
  assert.equal(visible.has(6), false);
});

test("ancestor is expandable family context but never a generation-structure edge", () => {
  const ancestor = { a: 1, b: 8, code: "ancestor", directed: true };
  assert.equal(isFamilyStructureEdge(ancestor), false);
  const neighbors = buildFamilyExpansionMap(people.map((person) => person.personId), [ancestor]);
  assert.equal(neighbors.get(1)?.has(8), true);
  assert.equal(neighbors.get(8)?.has(1), true);
});
