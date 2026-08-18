import assert from "node:assert/strict";
import test from "node:test";
import { FAMILY_ROW_GAP, layoutFamilyTree } from "../src/lib/family-tree-layout";

test("a short side family is pulled down as a block when one child also belongs to a deeper co-parent line", () => {
  const people = [
    { personId: 1, name: "Main 1" },
    { personId: 2, name: "Main 2" },
    { personId: 3, name: "Main 3" },
    { personId: 4, name: "Main co-parent" },
    { personId: 5, name: "Main descendant" },
    { personId: 90, name: "Side parent" },
    { personId: 91, name: "Shared child" },
    { personId: 92, name: "Side sibling" },
  ];
  const edges = [
    { a: 1, b: 2, code: "parent", directed: true },
    { a: 2, b: 3, code: "parent", directed: true },
    { a: 3, b: 4, code: "parent", directed: true },
    { a: 4, b: 5, code: "parent", directed: true },
    { a: 90, b: 91, code: "parent", directed: true },
    { a: 90, b: 92, code: "parent", directed: true },
    { a: 4, b: 91, code: "parent", directed: true },
  ];

  const layout = layoutFamilyTree(people, edges, new Set(people.map((person) => person.personId)), [1, 2, 3, 4, 5]);
  const mainParent = layout.positions.get(4);
  const sideParent = layout.positions.get(90);
  const sharedChild = layout.positions.get(91);
  const sideSibling = layout.positions.get(92);

  assert.ok(mainParent && sideParent && sharedChild && sideSibling);
  assert.equal(sideParent.generation, mainParent.generation);
  assert.equal(sharedChild.generation, sideParent.generation + 1);
  assert.equal(sideSibling.generation, sideParent.generation + 1);
  assert.equal(sharedChild.y - sideParent.y, FAMILY_ROW_GAP);
  assert.equal(sideSibling.y, sharedChild.y);
});

test("every direct parent edge in a connected pedigree occupies exactly one visible generation", () => {
  const people = [
    { personId: 10, name: "Ancestor A" },
    { personId: 11, name: "Ancestor B" },
    { personId: 12, name: "Parent A" },
    { personId: 13, name: "Parent B" },
    { personId: 14, name: "Child" },
    { personId: 15, name: "Half sibling" },
  ];
  const edges = [
    { a: 10, b: 12, code: "parent", directed: true },
    { a: 11, b: 13, code: "parent", directed: true },
    { a: 12, b: 14, code: "parent", directed: true },
    { a: 13, b: 14, code: "parent", directed: true },
    { a: 12, b: 15, code: "parent", directed: true },
  ];

  const layout = layoutFamilyTree(people, edges, new Set(people.map((person) => person.personId)), [10, 12, 14]);
  for (const edge of edges) {
    const parent = layout.positions.get(edge.a);
    const child = layout.positions.get(edge.b);
    assert.ok(parent && child);
    assert.equal(child.generation - parent.generation, 1, `${edge.a} -> ${edge.b} must occupy adjacent rows`);
    assert.equal(child.y - parent.y, FAMILY_ROW_GAP, `${edge.a} -> ${edge.b} must have one row gap`);
  }
});
