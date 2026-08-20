import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
function source(relativePath: string) { return readFileSync(path.join(root, relativePath), "utf8"); }

test("editor and viewer share the same map feature presentation renderer", () => {
  const editor = source("src/components/map/map-editor.tsx");
  const viewer = source("src/components/map/world-map-viewer.tsx");
  assert.match(editor, /createMapFeatureStyle/);
  assert.match(viewer, /createMapFeatureStyle/);
  assert.match(viewer, /declutter:\s*true/);
});

test("player map is fed by server-filtered visible features", () => {
  const playerPage = source("src/app/player/map/page.tsx");
  assert.match(playerPage, /listVisibleMapFeatures/);
  assert.match(playerPage, /WorldMapViewer/);
  assert.doesNotMatch(playerPage, /listMapFeatures\(/);
});

test("presentation API has an explicit safe patch path and optional lore sync", () => {
  const route = source("src/app/api/admin/projects/[projectId]/maps/[mapId]/features/[featureId]/route.ts");
  const patches = source("src/lib/map-feature-patches.ts");
  assert.match(route, /patchType\s*===\s*"presentation"/);
  assert.match(patches, /mapFeaturePresentationPatchSchema\.parse/);
  assert.match(patches, /if \(parsed\.syncLoreName/);
  assert.match(patches, /UPDATE locations[\s\S]*SET name=/);
});

test("map label search and lore location search remain separate searchable sources", () => {
  const search = source("src/lib/map-spatial-search.ts");
  assert.match(search, /f\.label ILIKE/);
  assert.match(search, /loc\.name ILIKE/);
});
