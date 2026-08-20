import assert from "node:assert/strict";
import test from "node:test";
import { mapFeaturePresentationPatchSchema } from "@/lib/map-presentation-schema";

test("presentation patch accepts safe label and style fields", () => {
  const parsed = mapFeaturePresentationPatchSchema.parse({
    label: "Kashraan",
    syncLoreName: false,
    style: {
      fill: "#6879C9",
      fillOpacity: 0.3,
      stroke: "#AAB5FF",
      strokeWidth: 3.5,
      autoStroke: false,
      labelVisible: true,
      labelColor: "#FFFFFF",
      labelSize: 18,
      labelWeight: 700,
      labelHalo: "#111111",
      labelHaloWidth: 3,
      labelOpacity: 1,
      labelOffsetX: 0,
      labelOffsetY: 0,
      labelMinZoom: 1,
      labelMaxZoom: 9,
      presentationVersion: 1,
    },
  });
  assert.equal(parsed.label, "Kashraan");
  assert.equal(parsed.style.labelSize, 18);
});

test("presentation patch rejects invalid colors and arbitrary style keys", () => {
  assert.equal(mapFeaturePresentationPatchSchema.safeParse({ style: { fill: "red" } }).success, false);
  assert.equal(mapFeaturePresentationPatchSchema.safeParse({ style: { dangerousCss: "url(x)" } }).success, false);
});

test("map label cannot be empty or exceed its bounds", () => {
  assert.equal(mapFeaturePresentationPatchSchema.safeParse({ label: "   ", style: {} }).success, false);
  assert.equal(mapFeaturePresentationPatchSchema.safeParse({ label: "x".repeat(201), style: {} }).success, false);
});

test("lore name synchronization requires an explicit map label", () => {
  assert.equal(mapFeaturePresentationPatchSchema.safeParse({ syncLoreName: true, style: { labelVisible: true } }).success, false);
  assert.equal(mapFeaturePresentationPatchSchema.safeParse({ label: "Nordmark", syncLoreName: true, style: {} }).success, true);
});

test("label zoom range must remain ordered", () => {
  assert.equal(mapFeaturePresentationPatchSchema.safeParse({ style: { labelMinZoom: 5, labelMaxZoom: 3 } }).success, false);
  assert.equal(mapFeaturePresentationPatchSchema.safeParse({ style: { labelMinZoom: 2, labelMaxZoom: 8 } }).success, true);
});
