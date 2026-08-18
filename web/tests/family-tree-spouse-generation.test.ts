import assert from "node:assert/strict";
import test from "node:test";
import { layoutFamilyTree } from "../src/lib/family-tree-layout";

test("a spouse attached to a deeper family line is rendered on the same generation", () => {
  const people = [
    { personId: 1, name: "Grandparent" },
    { personId: 2, name: "Parent" },
    { personId: 3, name: "House-born partner" },
    { personId: 90, name: "External spouse" },
  ];
  const edges = [
    { a: 1, b: 2, code: "parent", directed: true },
    { a: 2, b: 3, code: "parent", directed: true },
    { a: 90, b: 3, code: "spouse", directed: false },
  ];
  const layout = layoutFamilyTree(people, edges, new Set(people.map((person) => person.personId)), [1, 2, 3]);
  const partner = layout.positions.get(3);
  const spouse = layout.positions.get(90);
  assert.ok(partner && spouse);
  assert.equal(spouse.generation, partner.generation);
  assert.equal(spouse.y, partner.y);
});

test("aligning a spouse component keeps its own parent-child distances intact", () => {
  const people = [
    { personId: 1, name: "Main grandparent" },
    { personId: 2, name: "Main parent" },
    { personId: 3, name: "Main partner" },
    { personId: 89, name: "Spouse parent" },
    { personId: 90, name: "External spouse" },
  ];
  const edges = [
    { a: 1, b: 2, code: "parent", directed: true },
    { a: 2, b: 3, code: "parent", directed: true },
    { a: 89, b: 90, code: "parent", directed: true },
    { a: 90, b: 3, code: "spouse", directed: false },
  ];
  const layout = layoutFamilyTree(people, edges, new Set(people.map((person) => person.personId)), [1, 2, 3]);
  const spouseParent = layout.positions.get(89);
  const spouse = layout.positions.get(90);
  const partner = layout.positions.get(3);
  assert.ok(spouseParent && spouse && partner);
  assert.equal(spouse.generation, partner.generation);
  assert.equal(spouse.generation - spouseParent.generation, 1);
});
