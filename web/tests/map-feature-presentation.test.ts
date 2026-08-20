import assert from "node:assert/strict";
import test from "node:test";
import {
  automaticBorderColor,
  defaultFeaturePresentationStyle,
  generatePoliticalPalette,
  resolveMapFeaturePresentation,
} from "@/components/map/map-feature-presentation";
import type { WorldMapFeature } from "@/components/map/map-types";

function feature(kind: WorldMapFeature["location_kind"], style: Record<string, unknown> = {}): WorldMapFeature {
  return {
    feature_id: "1",
    layer_id: "1",
    geometry: { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
    entity_type: "location",
    entity_id: "1",
    label: "Westmark",
    short_description: null,
    visibility_mode: "admin_only",
    style,
    metadata: {},
    location_parent_id: null,
    location_kind: kind,
  };
}

test("parent-derived political palettes are deterministic and geometry-independent", () => {
  const first = generatePoliticalPalette({ baseColor: "#6678b8", count: 8, mode: "parent", seed: 1234 });
  const second = generatePoliticalPalette({ baseColor: "#6678b8", count: 8, mode: "parent", seed: 1234 });
  const other = generatePoliticalPalette({ baseColor: "#6678b8", count: 8, mode: "parent", seed: 4321 });
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, other);
  assert.equal(first.length, 8);
  assert.ok(new Set(first).size >= 5);
  assert.ok(first.every((color) => /^#[0-9a-f]{6}$/i.test(color)));
});

test("changing only the color seed does not require or mutate geometry", () => {
  const geometry = { type: "Polygon", coordinates: [[[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]] } as const;
  const before = JSON.stringify(geometry);
  generatePoliticalPalette({ baseColor: "#5f8b7b", count: 6, mode: "harmonious", seed: 10 });
  generatePoliticalPalette({ baseColor: "#5f8b7b", count: 6, mode: "harmonious", seed: 11 });
  assert.equal(JSON.stringify(geometry), before);
});

test("political hierarchy gets visually distinct default border weights", () => {
  const country = defaultFeaturePresentationStyle("country", "#6678b8") as Record<string, number>;
  const region = defaultFeaturePresentationStyle("region", "#6678b8") as Record<string, number>;
  const province = defaultFeaturePresentationStyle("province", "#6678b8") as Record<string, number>;
  assert.ok(country.strokeWidth > region.strokeWidth);
  assert.ok(region.strokeWidth > province.strokeWidth);
  assert.ok(country.labelSize > region.labelSize);
  assert.ok(region.labelSize > province.labelSize);
});

test("stored label presentation is resolved independently from the map label text", () => {
  const row = feature("region", {
    fill: "#6879c9",
    fillOpacity: 0.45,
    stroke: "#253052",
    strokeWidth: 2.75,
    labelVisible: false,
    labelColor: "#f6e7bb",
    labelSize: 21,
    labelWeight: 700,
    labelHalo: "#101010",
    labelHaloWidth: 4,
    labelOpacity: 0.8,
    labelOffsetX: 12,
    labelOffsetY: -7,
    labelMinZoom: 2,
    labelMaxZoom: 8,
  });
  const presentation = resolveMapFeaturePresentation(row);
  assert.equal(row.label, "Westmark");
  assert.equal(presentation.fill, "#6879c9");
  assert.equal(presentation.fillOpacity, 0.45);
  assert.equal(presentation.strokeWidth, 2.75);
  assert.equal(presentation.labelVisible, false);
  assert.equal(presentation.labelColor, "#f6e7bb");
  assert.equal(presentation.labelSize, 21);
  assert.equal(presentation.labelOffsetX, 12);
  assert.equal(presentation.labelOffsetY, -7);
  assert.equal(presentation.labelMinZoom, 2);
  assert.equal(presentation.labelMaxZoom, 8);
});

test("auto stroke follows fill while manual stroke remains independent", () => {
  const auto = resolveMapFeaturePresentation(feature("country", { fill: "#6879c9", stroke: "#ffffff", autoStroke: true }));
  const manual = resolveMapFeaturePresentation(feature("country", { fill: "#6879c9", stroke: "#123456", autoStroke: false }));
  assert.equal(auto.stroke, automaticBorderColor("#6879c9"));
  assert.equal(manual.stroke, "#123456");
});
