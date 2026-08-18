import assert from "node:assert/strict";
import test from "node:test";
import { layoutFamilyTree } from "../src/lib/family-tree-layout";

test("lateral relation to an early main-line person does not pin a side ancestry above its real child attachment", () => {
  const people = [
    { personId: 100, name: "Main 1" },
    { personId: 101, name: "Main 2" },
    { personId: 102, name: "Main 3" },
    { personId: 103, name: "Main 4" },
    { personId: 104, name: "Main 5" },
    { personId: 900, name: "Side ancestor" },
    { personId: 901, name: "Side parent" },
  ];

  const edges = [
    { a: 100, b: 101, code: "parent", directed: true },
    { a: 101, b: 102, code: "parent", directed: true },
    { a: 102, b: 103, code: "parent", directed: true },
    { a: 103, b: 104, code: "parent", directed: true },
    { a: 900, b: 901, code: "parent", directed: true },
    { a: 901, b: 104, code: "parent", directed: true },
    // This lateral link used to fuse 901 to generation 2 and prevent ALAP compaction.
    { a: 901, b: 101, code: "spouse", directed: false },
  ];

  const layout = layoutFamilyTree(
    people,
    edges,
    new Set(people.map((person) => person.personId)),
    [100, 101, 102, 103, 104],
  );

  assert.equal(layout.positions.get(104)?.generation, 4);
  assert.equal(layout.positions.get(901)?.generation, 3);
  assert.equal(layout.positions.get(900)?.generation, 2);
});
