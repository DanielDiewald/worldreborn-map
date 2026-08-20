import assert from "node:assert/strict";
import test from "node:test";
import { squareCropRect } from "../src/components/map/species-marker-avatar";

test("species marker crop uses the centered square at zoom 1", () => {
  assert.deepEqual(squareCropRect(100, 200, { x: 50, y: 50, zoom: 1 }), {
    sx: 0,
    sy: 50,
    side: 100,
  });
});

test("species marker crop follows focus and zoom while staying inside the source", () => {
  assert.deepEqual(squareCropRect(300, 100, { x: 100, y: 0, zoom: 2 }), {
    sx: 250,
    sy: 0,
    side: 50,
  });
});
