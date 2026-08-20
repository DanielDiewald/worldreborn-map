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

test("species origins are opt-in and have a prominent visibility control", () => {
  const visibility = read("src/components/map/map-content-visibility.ts");
  const viewer = read("src/components/map/world-map-viewer.tsx");
  assert.match(visibility, /species: false/);
  assert.match(viewer, /SPECIES_VISIBILITY_STORAGE_PREFIX/);
  assert.match(viewer, /speciesWasExplicitlyEnabled/);
  assert.match(viewer, /◉ Spezies & Ursprünge/);
  assert.match(viewer, /standardmäßig ausgeblendet/);
  assert.match(viewer, /toggleContent\("species", event\.target\.checked\)/);
  assert.match(viewer, /speciesMarkerCount > 0/);
});

test("direct species map links reveal the focused origin without changing the saved default", () => {
  const viewer = read("src/components/map/world-map-viewer.tsx");
  assert.match(viewer, /focusIsSpecies/);
  assert.match(viewer, /contentVisibilityRef\.current\.species/);
  assert.match(viewer, /setContentVisibility\(next\)/);
  assert.doesNotMatch(viewer, /focusIsSpecies[\s\S]{0,500}SPECIES_VISIBILITY_STORAGE_PREFIX/);
});

test("species preview markers preserve their source aspect ratio", () => {
  const viewer = read("src/components/map/world-map-viewer.tsx");
  assert.match(viewer, /markerType === "species"/);
  assert.match(viewer, /height: SPECIES_MARKER_HEIGHT/);
  assert.doesNotMatch(viewer, /src: image,[\s\S]{0,120}width:[\s\S]{0,80}height:/);
  assert.match(viewer, /preserves portrait\/landscape aspect ratios/);
  assert.match(viewer, /aspectRatio: "1 \/ 1"/);
  assert.match(viewer, /previewImage/);
  assert.match(viewer, /Details öffnen/);
});

test("species markers use resolution-aware vertical collision lanes instead of disappearing", () => {
  const viewer = read("src/components/map/world-map-viewer.tsx");
  assert.match(viewer, /SPECIES_COLLISION_RADIUS_PX/);
  assert.match(viewer, /speciesStackLane/);
  assert.match(viewer, /Math\.hypot\(dxPixels, dyPixels\)/);
  assert.match(viewer, /stackIndex \* SPECIES_STACK_GAP/);
  assert.match(viewer, /displacement: \[0, -stackOffset\]/);
  assert.match(viewer, /declutterMode: "none"/);
  assert.match(viewer, /renderBuffer:/);
});
