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

test("side ancestors stay above the branch they lead to instead of being placed alphabetically", () => {
  const anchoredPeople = [
    { personId: 1, name: "Main ancestor" },
    { personId: 2, name: "Main heir" },
    { personId: 3, name: "Shared descendant" },
    { personId: 4, name: "A side ancestor" },
    { personId: 5, name: "A side parent" },
  ];
  const anchoredEdges = [
    { a: 1, b: 2, code: "parent", directed: true },
    { a: 2, b: 3, code: "parent", directed: true },
    { a: 5, b: 3, code: "parent", directed: true },
    { a: 4, b: 5, code: "parent", directed: true },
  ];
  const layout = layoutFamilyTree(anchoredPeople, anchoredEdges, new Set(anchoredPeople.map((person) => person.personId)), [1, 2, 3]);
  const mainAncestor = layout.positions.get(1);
  const sideAncestor = layout.positions.get(4);
  const mainParent = layout.positions.get(2);
  const sideParent = layout.positions.get(5);
  assert.ok(mainAncestor && sideAncestor && mainParent && sideParent);
  assert.ok(sideParent.x > mainParent.x);
  assert.ok(sideAncestor.x > mainAncestor.x);
});

test("a connected side branch keeps one side of the main line across all generations", () => {
  const branchPeople = [
    { personId: 100, name: "Main 1" },
    { personId: 101, name: "Main 2" },
    { personId: 102, name: "Main 3" },
    { personId: 103, name: "Main 4" },
    { personId: 104, name: "Main 5" },
    { personId: 900, name: "Side ancestor" },
    { personId: 901, name: "Side grandparent" },
    { personId: 12, name: "Side parent" },
    { personId: 13, name: "Side spouse" },
    { personId: 14, name: "Side child" },
  ];
  const branchEdges = [
    { a: 100, b: 101, code: "parent", directed: true },
    { a: 101, b: 102, code: "parent", directed: true },
    { a: 102, b: 103, code: "parent", directed: true },
    { a: 103, b: 104, code: "parent", directed: true },
    { a: 900, b: 901, code: "parent", directed: true },
    { a: 901, b: 12, code: "parent", directed: true },
    { a: 12, b: 13, code: "parent", directed: true },
    { a: 13, b: 14, code: "parent", directed: true },
    { a: 103, b: 14, code: "parent", directed: true },
  ];
  const layout = layoutFamilyTree(branchPeople, branchEdges, new Set(branchPeople.map((person) => person.personId)), [100, 101, 102, 103, 104]);
  const center = layout.width / 2;
  const branchIds = [900, 901, 12, 13];
  const signs = branchIds.map((id) => {
    const position = layout.positions.get(id);
    assert.ok(position);
    const nodeCenter = position.x + 140;
    return Math.sign(nodeCenter - center);
  });
  assert.ok(signs.every((sign) => sign === signs[0]));
  assert.notEqual(signs[0], 0);
});

test("a side lineage stays together when a main-line person is the bridge between its ancestors and descendants", () => {
  const bridgePeople = [
    { personId: 100, name: "Main ancestor" },
    { personId: 101, name: "Main bridge" },
    { personId: 102, name: "Main heir" },
    { personId: 103, name: "Main descendant" },
    { personId: 900, name: "Side great-grandparent" },
    { personId: 901, name: "Side parent" },
    { personId: 12, name: "Side child" },
    { personId: 13, name: "Side grandchild" },
  ];
  const bridgeEdges = [
    { a: 100, b: 101, code: "parent", directed: true },
    { a: 101, b: 102, code: "parent", directed: true },
    { a: 102, b: 103, code: "parent", directed: true },
    { a: 900, b: 901, code: "parent", directed: true },
    { a: 901, b: 101, code: "parent", directed: true },
    { a: 101, b: 12, code: "parent", directed: true },
    { a: 12, b: 13, code: "parent", directed: true },
  ];
  const layout = layoutFamilyTree(bridgePeople, bridgeEdges, new Set(bridgePeople.map((person) => person.personId)), [100, 101, 102, 103]);
  const center = layout.width / 2;
  const branchIds = [900, 901, 12, 13];
  const signs = branchIds.map((id) => {
    const position = layout.positions.get(id);
    assert.ok(position);
    return Math.sign(position.x + 140 - center);
  });
  assert.ok(signs.every((sign) => sign === signs[0]));
  assert.notEqual(signs[0], 0);
});

test("side ancestors are horizontally anchored above the descendant family block they actually lead to", () => {
  const anchoredPeople = [
    { personId: 100, name: "Main 1" },
    { personId: 101, name: "Main 2" },
    { personId: 102, name: "Main 3" },
    { personId: 103, name: "Main 4" },
    { personId: 900, name: "Side grandparent" },
    { personId: 901, name: "Side parent" },
    { personId: 12, name: "Related child" },
  ];
  const anchoredEdges = [
    { a: 100, b: 101, code: "parent", directed: true },
    { a: 101, b: 102, code: "parent", directed: true },
    { a: 102, b: 103, code: "parent", directed: true },
    { a: 900, b: 901, code: "parent", directed: true },
    { a: 901, b: 12, code: "parent", directed: true },
    { a: 102, b: 12, code: "parent", directed: true },
  ];
  const layout = layoutFamilyTree(anchoredPeople, anchoredEdges, new Set(anchoredPeople.map((person) => person.personId)), [100, 101, 102, 103]);
  const ancestor = layout.positions.get(900);
  const parent = layout.positions.get(901);
  const child = layout.positions.get(12);
  assert.ok(ancestor && parent && child);
  const ancestorCenter = ancestor.x + 140;
  const parentCenter = parent.x + 140;
  const childCenter = child.x + 140;
  assert.ok(Math.abs(parentCenter - childCenter) <= 1);
  assert.ok(Math.abs(ancestorCenter - childCenter) <= 1);
});

test("short side ancestry feeding a later main-line generation starts directly before its attachment", () => {
  const compactPeople = [
    { personId: 100, name: "Main 1" },
    { personId: 101, name: "Main 2" },
    { personId: 102, name: "Main 3" },
    { personId: 103, name: "Main 4" },
    { personId: 104, name: "Main 5" },
    { personId: 900, name: "Short side ancestor" },
    { personId: 901, name: "Short side parent" },
  ];
  const compactEdges = [
    { a: 100, b: 101, code: "parent", directed: true },
    { a: 101, b: 102, code: "parent", directed: true },
    { a: 102, b: 103, code: "parent", directed: true },
    { a: 103, b: 104, code: "parent", directed: true },
    { a: 900, b: 901, code: "parent", directed: true },
    { a: 901, b: 104, code: "parent", directed: true },
  ];
  const layout = layoutFamilyTree(compactPeople, compactEdges, new Set(compactPeople.map((person) => person.personId)), [100, 101, 102, 103, 104]);
  assert.equal(layout.positions.get(104)?.generation, 4);
  assert.equal(layout.positions.get(901)?.generation, 3);
  assert.equal(layout.positions.get(900)?.generation, 2);
  assert.equal((layout.positions.get(104)?.y ?? 0) - (layout.positions.get(901)?.y ?? 0), 310);
  assert.equal((layout.positions.get(901)?.y ?? 0) - (layout.positions.get(900)?.y ?? 0), 310);
});

test("bottom-up packing also compacts ancestors that belong to the selected main line", () => {
  const compactPeople = [
    { personId: 1, name: "Long root" },
    { personId: 2, name: "Long 2" },
    { personId: 3, name: "Long 3" },
    { personId: 4, name: "Long parent" },
    { personId: 5, name: "Shared child" },
    { personId: 90, name: "Short main ancestor" },
    { personId: 91, name: "Short main parent" },
  ];
  const compactEdges = [
    { a: 1, b: 2, code: "parent", directed: true },
    { a: 2, b: 3, code: "parent", directed: true },
    { a: 3, b: 4, code: "parent", directed: true },
    { a: 4, b: 5, code: "parent", directed: true },
    { a: 90, b: 91, code: "parent", directed: true },
    { a: 91, b: 5, code: "parent", directed: true },
  ];
  const layout = layoutFamilyTree(compactPeople, compactEdges, new Set(compactPeople.map((person) => person.personId)), [90, 91, 5]);
  const ancestor = layout.positions.get(90);
  const parent = layout.positions.get(91);
  const child = layout.positions.get(5);
  assert.ok(ancestor && parent && child);
  assert.equal(parent.generation - ancestor.generation, 1);
  assert.equal(child.generation - parent.generation, 1);
  assert.equal(parent.y - ancestor.y, 310);
  assert.equal(child.y - parent.y, 310);
});

test("visual rows remove empty chronology bands instead of rendering giant vertical gaps", () => {
  const datedPeople = [
    { personId: 1, name: "Main parent", birthYear: 100 },
    { personId: 2, name: "Main child", birthYear: 200 },
    { personId: 10, name: "Later branch parent", birthYear: 1000 },
    { personId: 11, name: "Later branch child", birthYear: 1100 },
  ];
  const datedEdges = [
    { a: 1, b: 2, code: "parent", directed: true },
    { a: 10, b: 11, code: "parent", directed: true },
  ];
  const layout = layoutFamilyTree(datedPeople, datedEdges, new Set(datedPeople.map((person) => person.personId)), [1, 2]);
  const mainChild = layout.positions.get(2);
  const laterParent = layout.positions.get(10);
  const laterChild = layout.positions.get(11);
  assert.ok(mainChild && laterParent && laterChild);
  assert.equal(laterParent.generation, mainChild.generation + 1);
  assert.equal(laterChild.generation, laterParent.generation + 1);
  assert.equal(laterParent.y - mainChild.y, 310);
  assert.equal(laterChild.y - laterParent.y, 310);
  assert.deepEqual(layout.shownGenerations, [0, 1, 2, 3]);
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
