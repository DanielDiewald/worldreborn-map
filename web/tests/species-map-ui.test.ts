import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const read = (file: string) => readFileSync(path.join(webRoot, file), "utf8");

test("species creation is opened explicitly instead of rendering the full form on the registry page", () => {
  const page = read("src/app/admin/projects/[projectId]/races/page.tsx");
  const dialog = read("src/app/admin/projects/[projectId]/races/race-create-dialog.tsx");
  assert.match(page, /RaceCreateDialog/);
  assert.doesNotMatch(page, /<form action=\{createRaceAction/);
  assert.match(dialog, /showModal/);
  assert.match(dialog, /Spezies \/ Subspezies anlegen/);
  assert.match(dialog, /RaceOriginPicker/);
});

test("species registry renders a parent to subspecies hierarchy", () => {
  const page = read("src/app/admin/projects/[projectId]/races/page.tsx");
  assert.match(page, /TAXONOMISCHER CODEX/);
  assert.match(page, /Subspezies/);
  assert.match(page, /byParent/);
  assert.match(page, /Erben Biologie und Merkmale/);
});

test("species origins are projected into the admin map without duplicating map_marker rows", () => {
  const markers = read("src/lib/race-map-markers.ts");
  const mapPage = read("src/app/admin/projects/[projectId]/map/page.tsx");
  assert.match(markers, /FROM races r/);
  assert.match(markers, /marker_id: -raceId/);
  assert.match(markers, /marker_type: "species"/);
  assert.match(markers, /icon: previewImage\(race\.image\)/);
  assert.match(mapPage, /listRaceOriginMarkers/);
  assert.match(mapPage, /const markers = \[\.\.\.regularMarkers, \.\.\.speciesMarkers\]/);
});

test("world map uses species preview images and links back to the species codex", () => {
  const viewer = read("src/components/map/world-map-viewer.tsx");
  assert.match(viewer, /markerType === "species"/);
  assert.match(viewer, /new ol\.style\.Icon\(\{ src: image, width: 42, height: 42 \}\)/);
  assert.match(viewer, /previewImage/);
  assert.match(viewer, /Details öffnen/);
});
