import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const read = (file: string) => readFileSync(path.join(webRoot, file), "utf8");

test("avatar pipeline renders persistent 256x256 webp derivatives", () => {
  const derivatives = read("src/lib/entity-image-derivatives.ts");
  assert.match(derivatives, /ENTITY_AVATAR_SIZE = 256/);
  assert.match(derivatives, /\.webp\(\{ quality: 78/);
  assert.match(derivatives, /resolveSafeLocalImage/);
  assert.match(derivatives, /realpath\(/);
  assert.match(derivatives, /sourceKey = `local:/);
  assert.match(derivatives, /fit: "contain"/);
});

test("dense entity lists route managed and local sources through avatar derivatives", () => {
  const files = [
    "src/lib/entities/npcs.ts",
    "src/lib/entities/gods.ts",
    "src/lib/entities/groups.ts",
    "src/lib/entities/cultures.ts",
    "src/lib/entities/locations.ts",
    "src/lib/race-registry.ts",
  ];
  for (const file of files) {
    const source = read(file);
    assert.match(source, /entity-images\//, file);
    assert.match(source, /\/img\/%|LIKE '\/img\/%'/, file);
    assert.match(source, /\/images\/%|LIKE '\/images\/%'/, file);
    assert.match(source, /\/uploads\/%|LIKE '\/uploads\/%'/, file);
  }
});

test("species crop is pointer-safe, persisted, reloaded and reused by the map", () => {
  const editor = read("src/components/profile-image-editor.tsx");
  const action = read("src/app/admin/projects/[projectId]/races/actions.ts");
  const page = read("src/app/admin/projects/[projectId]/races/[raceId]/image/page.tsx");
  const markers = read("src/lib/race-map-markers.ts");
  assert.match(editor, /touchAction: "none"/);
  assert.match(editor, /event\.preventDefault\(\)/);
  assert.match(editor, /1:1-Zuschnitt verwenden/);
  assert.match(action, /saveEntityImageProfile\(projectId,"race",raceId/);
  assert.match(action, /getEntityImageProfile\(projectId,"race",raceId,source\.image\)/);
  assert.match(page, /getEntityImageProfile\(projectId,"race",raceId,race\.image\)/);
  assert.match(markers, /imageReferenceUsesAvatarDerivative/);
});

test("asset endpoint keeps authentication read-only", () => {
  const route = read("src/app/api/admin/projects/[projectId]/entity-images/[entityType]/[entityId]/avatar/route.ts");
  assert.match(route, /hasValidAdminSession\(\{ touch: false \}\)/);
  assert.doesNotMatch(route, /last_seen_at/);
});
