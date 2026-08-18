import assert from "node:assert/strict";
import test from "node:test";
import { buildFamilyGenerations, layoutFamilyTree } from "../src/lib/family-tree-layout";

test("birth years align a spouse-only person with the matching main-line generation", () => {
  const people = [
    { personId: 1, name: "Founder", birthYear: 1000 },
    { personId: 2, name: "Heir", birthYear: 1030 },
    { personId: 3, name: "Grandchild", birthYear: 1060 },
    { personId: 9, name: "Grandchild spouse", birthYear: 1062 },
  ];
  const edges = [
    { a: 1, b: 2, code: "parent", directed: true },
    { a: 2, b: 3, code: "parent", directed: true },
    { a: 3, b: 9, code: "spouse", directed: false },
  ];

  const generations = buildFamilyGenerations(people, edges);
  assert.equal(generations.get(1), 0);
  assert.equal(generations.get(2), 1);
  assert.equal(generations.get(3), 2);
  assert.equal(generations.get(9), 2);
});

test("older disconnected ancestry stays above a younger main line when birth years prove the cohort", () => {
  const people = [
    { personId: 1, name: "Main 1", birthYear: 1000 },
    { personId: 2, name: "Main 2", birthYear: 1030 },
    { personId: 3, name: "Main 3", birthYear: 1060 },
    { personId: 4, name: "Main 4", birthYear: 1090 },
    { personId: 90, name: "Older branch root", birthYear: 970 },
    { personId: 91, name: "Older branch child", birthYear: 1000 },
  ];
  const edges = [
    { a: 1, b: 2, code: "parent", directed: true },
    { a: 2, b: 3, code: "parent", directed: true },
    { a: 3, b: 4, code: "parent", directed: true },
    { a: 90, b: 91, code: "parent", directed: true },
  ];

  const visible = new Set(people.map((person) => person.personId));
  const layout = layoutFamilyTree(people, edges, visible, [1, 2, 3, 4]);

  assert.equal(layout.positions.get(90)?.generation, 0);
  assert.equal(layout.positions.get(91)?.generation, 1);
  assert.equal(layout.positions.get(1)?.generation, 1);
  assert.equal(layout.positions.get(4)?.generation, 4);
  assert.equal((layout.positions.get(91)?.generation ?? -1) - (layout.positions.get(90)?.generation ?? -1), 1);
});
