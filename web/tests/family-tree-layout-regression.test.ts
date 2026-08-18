import assert from "node:assert/strict";
import test from "node:test";
import { FAMILY_NODE_WIDTH, layoutFamilyTree } from "../src/lib/family-tree-layout";

test("side ancestry compacts toward a later co-parent attachment beside the main line", () => {
  const people = [
    { personId: 100, name: "Main 1" },
    { personId: 101, name: "Main 2" },
    { personId: 102, name: "Main 3" },
    { personId: 103, name: "Main 4" },
    { personId: 104, name: "Main 5" },
    { personId: 900, name: "Side ancestor" },
    { personId: 901, name: "Side parent" },
    { personId: 902, name: "Side heir" },
    { personId: 903, name: "Shared child" },
  ];
  const edges = [
    { a: 100, b: 101, code: "parent", directed: true },
    { a: 101, b: 102, code: "parent", directed: true },
    { a: 102, b: 103, code: "parent", directed: true },
    { a: 103, b: 104, code: "parent", directed: true },
    { a: 900, b: 901, code: "parent", directed: true },
    { a: 901, b: 902, code: "parent", directed: true },
    { a: 104, b: 903, code: "parent", directed: true },
    { a: 902, b: 903, code: "parent", directed: true },
  ];

  const layout = layoutFamilyTree(people, edges, new Set(people.map((person) => person.personId)), [100, 101, 102, 103, 104]);

  assert.equal(layout.positions.get(104)?.generation, 4);
  assert.equal(layout.positions.get(902)?.generation, 4);
  assert.equal(layout.positions.get(901)?.generation, 3);
  assert.equal(layout.positions.get(900)?.generation, 2);
});

test("main-centered asymmetric rows reserve enough width so cards on the busy side never collide", () => {
  const people = [
    { personId: 100, name: "Main parent" },
    { personId: 101, name: "Main heir" },
    { personId: 200, name: "Side A" },
    { personId: 201, name: "Side B" },
    { personId: 202, name: "Side C" },
  ];
  const edges = [
    { a: 100, b: 101, code: "parent", directed: true },
    { a: 101, b: 200, code: "sibling", directed: false },
    { a: 200, b: 201, code: "sibling", directed: false },
    { a: 201, b: 202, code: "sibling", directed: false },
  ];

  const layout = layoutFamilyTree(people, edges, new Set(people.map((person) => person.personId)), [100, 101]);
  const row = [101, 200, 201, 202]
    .map((id) => ({ id, position: layout.positions.get(id) }))
    .filter((item): item is { id: number; position: NonNullable<typeof item.position> } => Boolean(item.position))
    .sort((a, b) => a.position.x - b.position.x);

  assert.equal(row.length, 4);
  for (let index = 1; index < row.length; index += 1) {
    const gap = row[index].position.x - row[index - 1].position.x;
    assert.ok(gap >= FAMILY_NODE_WIDTH + 150, `nodes ${row[index - 1].id} and ${row[index].id} are only ${gap}px apart`);
  }
});
