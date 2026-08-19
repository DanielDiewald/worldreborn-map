import assert from "node:assert/strict";
import test from "node:test";
import { synchronizeSharedPoliticalVertices } from "../src/components/map/map-topology";
import type { WorldMapFeature } from "../src/components/map/map-types";

function row(id: number, label: string, coordinates: number[][][], metadata: Record<string, unknown> = {}): WorldMapFeature {
  return {
    feature_id: String(id), layer_id: "1", geometry: { type: "Polygon", coordinates }, entity_type: "location", entity_id: String(id),
    label, short_description: null, visibility_mode: "admin_only", style: {}, metadata, location_parent_id: null, location_kind: "country",
  };
}

test("moving a genuinely shared country vertex updates the neighboring country", () => {
  const left = row(1, "West", [[[0,0],[5,0],[5,5],[0,5],[0,0]]]);
  const right = row(2, "Ost", [[[5,0],[10,0],[10,5],[5,5],[5,0]]]);
  const edited = { type: "Polygon", coordinates: [[[0,0],[6,0],[6,5],[0,5],[0,0]]] };
  const result = synchronizeSharedPoliticalVertices({
    changedFeatureId: 1,
    changedRow: left,
    before: left.geometry,
    edited,
    peers: [[1, left], [2, right]],
    tolerance: 0.1,
  });
  assert.equal(result.blockedBy.length, 0);
  assert.equal(result.updates.length, 1);
  assert.deepEqual(result.updates[0].geometry.coordinates, [[[6,0],[10,0],[10,5],[6,5],[6,0]]]);
});

test("a locked neighboring country blocks a shared border move", () => {
  const left = row(1, "West", [[[0,0],[5,0],[5,5],[0,5],[0,0]]]);
  const right = row(2, "Ost", [[[5,0],[10,0],[10,5],[5,5],[5,0]]], { editorLocked: true });
  const edited = { type: "Polygon", coordinates: [[[0,0],[6,0],[6,5],[0,5],[0,0]]] };
  const result = synchronizeSharedPoliticalVertices({
    changedFeatureId: 1,
    changedRow: left,
    before: left.geometry,
    edited,
    peers: [[1, left], [2, right]],
    tolerance: 0.1,
  });
  assert.equal(result.updates.length, 0);
  assert.deepEqual(result.blockedBy, ["Ost"]);
});

test("provinces only synchronize with siblings of the same parent", () => {
  const a = { ...row(1, "A", [[[0,0],[5,0],[5,5],[0,5],[0,0]]]), location_kind: "province", location_parent_id: 100 };
  const sibling = { ...row(2, "B", [[[5,0],[10,0],[10,5],[5,5],[5,0]]]), location_kind: "province", location_parent_id: 100 };
  const foreign = { ...row(3, "C", [[[5,0],[10,0],[10,5],[5,5],[5,0]]]), location_kind: "province", location_parent_id: 200 };
  const edited = { type: "Polygon", coordinates: [[[0,0],[6,0],[6,5],[0,5],[0,0]]] };
  const result = synchronizeSharedPoliticalVertices({ changedFeatureId: 1, changedRow: a, before: a.geometry, edited, peers: [[2, sibling], [3, foreign]], tolerance: 0.1 });
  assert.deepEqual(result.updates.map((item) => item.featureId), [2]);
});
