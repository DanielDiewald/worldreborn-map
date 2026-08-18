import assert from "node:assert/strict";
import test from "node:test";
import { layoutFamilyTree, resolveFamilyMainLine } from "../src/lib/family-tree-layout";

test("spouse ancestors stay on one level and their descendant is below them", () => {
  const people = [
    { personId: 1, name: "Arania" },
    { personId: 2, name: "Alfred I" },
    { personId: 5, name: "Alfred V" },
  ];
  const edges = [
    { a: 1, b: 2, code: "spouse", directed: false },
    { a: 1, b: 5, code: "ancestor", directed: true },
    { a: 2, b: 5, code: "ancestor", directed: true },
  ];

  const layout = layoutFamilyTree(people, edges, new Set([1, 2, 5]), [2, 5]);
  const arania = layout.positions.get(1);
  const alfredI = layout.positions.get(2);
  const alfredV = layout.positions.get(5);
  assert.ok(arania && alfredI && alfredV);
  assert.equal(arania.generation, alfredI.generation);
  assert.ok(alfredI.generation < alfredV.generation);
  assert.equal(arania.y, alfredI.y);
  assert.ok(alfredI.y < alfredV.y);
});

test("an ancestor skip-link may be saved as a preferred main-line step", () => {
  const people = [
    { personId: 2, name: "Alfred I" },
    { personId: 5, name: "Alfred V" },
  ];
  const edges = [
    { a: 2, b: 5, code: "ancestor", directed: true },
  ];

  assert.deepEqual(resolveFamilyMainLine(people, edges, [2, 5]), [2, 5]);
});

test("ancestor links preserve an existing multi-generation distance", () => {
  const people = [
    { personId: 1, name: "Ancestor" },
    { personId: 10, name: "Generation 1" },
    { personId: 11, name: "Generation 2" },
    { personId: 12, name: "Generation 3" },
    { personId: 13, name: "Descendant" },
  ];
  const edges = [
    { a: 1, b: 10, code: "spouse", directed: false },
    { a: 10, b: 11, code: "parent", directed: true },
    { a: 11, b: 12, code: "parent", directed: true },
    { a: 12, b: 13, code: "parent", directed: true },
    { a: 1, b: 13, code: "ancestor", directed: true },
  ];

  const layout = layoutFamilyTree(people, edges, new Set(people.map((person) => person.personId)), [10, 11, 12, 13]);
  const ancestor = layout.generations.get(1);
  const descendant = layout.generations.get(13);
  assert.ok(ancestor != null && descendant != null);
  assert.ok(descendant - ancestor >= 3);
});
