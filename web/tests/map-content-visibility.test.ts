import assert from "node:assert/strict";
import test from "node:test";
import { allContentVisibility, featureContentCategory } from "../src/components/map/map-content-visibility";

const geometry = { type: "Polygon", coordinates: [] };

test("map features are classified into semantic visibility groups", () => {
  assert.equal(featureContentCategory({ geometry, location_kind: "country", metadata: {} }), "countries");
  assert.equal(featureContentCategory({ geometry, location_kind: "province", metadata: {} }), "provinces");
  assert.equal(featureContentCategory({ geometry, location_kind: "region", metadata: {} }), "regions");
  assert.equal(featureContentCategory({ geometry, location_kind: "city", metadata: {} }), "settlements");
  assert.equal(featureContentCategory({ geometry, location_kind: "landmark", metadata: {} }), "places");
  assert.equal(featureContentCategory({ geometry: { type: "LineString", coordinates: [] }, location_kind: null, metadata: { tool: "river" } }), "rivers");
  assert.equal(featureContentCategory({ geometry: { type: "LineString", coordinates: [] }, location_kind: null, metadata: { tool: "road" } }), "roads");
});

test("all visibility switch controls every semantic category", () => {
  const hidden = allContentVisibility(false);
  assert.ok(Object.values(hidden).every((value) => value === false));
  const shown = allContentVisibility(true);
  assert.ok(Object.values(shown).every((value) => value === true));
});
