import assert from "node:assert/strict";
import test from "node:test";
import {
  assignFamilyParentRouteLanes,
  buildFamilyGenerations,
  collectFamilyBranchNodes,
  findFamilyDescendantLine,
  findFamilyMainLine,
  layoutFamilyTree,
  resolveFamilyMainLine,
} from "../src/lib/family-tree-layout";

const people = [
  { personId: 1, name: "Oldest" },
  { personId: 2, name: "Parent A" },
  { personId: 3, name: "Parent B" },
  { personId: 4, name: "Child" },
  { personId: 5, name: "Side child" },
  { personId: 6, name: "Side grandchild" },
];

const edges = [
  { a: 1, b: 2, code: "parent", directed: true },
  { a: 2, b: 4, code: "parent", directed: true },
  { a: 3, b: 4, code: "parent", directed: true },
  { a: 2, b: 3, code: "spouse", directed: false },
  { a: 2, b: 5, code: "parent", directed: true },
  { a: 5, b: 6, code: "parent", directed: true },
];

test("family hierarchy keeps oldest ancestors above children and aligns co-parents", () => {
  const generations = buildFamilyGenerations(people, edges);
  assert.equal(generations.get(1), 0);
  assert.equal(generations.get(2), 1);
  assert.equal(generations.get(3), 1);
  assert.equal(generations.get(4), 2);
});

test("main line follows the longest ancestor-to-descendant chain through the focus person", () => {
  const mainLine = findFamilyMainLine(people, edges, 2);
  assert.deepEqual(mainLine, [1, 2, 5, 6]);
});

test("manual main line overrides automatic sibling choice only when it is a valid parent-child chain", () => {
  assert.deepEqual(resolveFamilyMainLine(people, edges, [1, 2, 4], 2), [1, 2, 4]);
  assert.deepEqual(resolveFamilyMainLine(people, edges, [1, 3, 4], 2), [1, 2, 5, 6]);
  assert.deepEqual(findFamilyDescendantLine(people, edges, 2), [2, 5, 6]);
});

test("side branches can be expanded without pulling main-line nodes into the branch", () => {
  const mainLine = new Set([1, 2, 5, 6]);
  const branch = collectFamilyBranchNodes(2, mainLine, edges);
  assert.deepEqual([...branch].sort((a, b) => a - b), [3, 4]);
});

test("layout gives merging parent rows extra horizontal space and stable vertical generations", () => {
  const visible = new Set(people.map((person) => person.personId));
  const layout = layoutFamilyTree(people, edges, visible, [1, 2, 5, 6]);
  const parentA = layout.positions.get(2);
  const parentB = layout.positions.get(3);
  const child = layout.positions.get(4);
  assert.ok(parentA && parentB && child);
  assert.equal(parentA.generation, parentB.generation);
  assert.ok(child.y > parentA.y);
  assert.ok(Math.abs(parentA.x - parentB.x) >= 280);
  assert.ok(layout.width >= 1500);
});

test("short disconnected branches start lower so their youngest generation aligns with the main line", () => {
  const extendedPeople = [...people, { personId: 7, name: "Short root" }, { personId: 8, name: "Short child" }];
  const extendedEdges = [...edges, { a: 7, b: 8, code: "parent", directed: true }];
  const visible = new Set(extendedPeople.map((person) => person.personId));
  const layout = layoutFamilyTree(extendedPeople, extendedEdges, visible, [1, 2, 5, 6]);
  assert.equal(layout.positions.get(7)?.generation, 2);
  assert.equal(layout.positions.get(8)?.generation, 3);
  assert.equal(layout.positions.get(8)?.y, layout.positions.get(6)?.y);
});

test("overlapping parent routes get separate lanes so unrelated families never look connected", () => {
  const lanes = assignFamilyParentRouteLanes([
    { childId: 10, generation: 5, startX: 100, endX: 900 },
    { childId: 11, generation: 5, startX: 500, endX: 1200 },
    { childId: 12, generation: 5, startX: 1250, endX: 1450 },
  ]);
  assert.notEqual(lanes.get(10), lanes.get(11));
  assert.equal(lanes.get(10), lanes.get(12));
});
