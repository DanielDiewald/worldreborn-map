import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const repoRoot = path.resolve(webRoot, "..");
const readWeb = (file: string) => readFileSync(path.join(webRoot, file), "utf8");
const readRepo = (file: string) => readFileSync(path.join(repoRoot, file), "utf8");

test("0016 adds persistent avatar derivatives and extends crops to cultures", () => {
  const sql = readRepo("migrations/0016_image_derivatives_and_culture_crops.sql");
  assert.match(sql, /CREATE TABLE public\.entity_image_derivatives/);
  assert.match(sql, /entity_type IN \('person','race','culture'\)/);
  assert.match(sql, /variant IN \('avatar'\)/);
  assert.match(sql, /UNIQUE\(project_id, entity_type, entity_id, variant\)/);
});

test("asset authentication does not update the admin session for every image", () => {
  const session = readWeb("src/lib/auth/session.ts");
  const mediaRoute = readWeb("src/app/api/media/[mediaId]/route.ts");
  const avatarRoute = readWeb("src/app/api/admin/projects/[projectId]/entity-images/[entityType]/[entityId]/avatar/route.ts");
  assert.match(session, /options: \{ touch\?: boolean \}/);
  assert.match(session, /if \(options\.touch === false\)/);
  assert.match(mediaRoute, /hasValidAdminSession\(\{touch:false\}\)/);
  assert.match(avatarRoute, /hasValidAdminSession\(\{ touch: false \}\)/);
});

test("avatar endpoint uses the existing derivative fast path before lazy generation", () => {
  const route = readWeb("src/app/api/admin/projects/[projectId]/entity-images/[entityType]/[entityId]/avatar/route.ts");
  const fast = route.indexOf("getExistingEntityAvatarDerivative");
  const ensure = route.lastIndexOf("ensureEntityAvatarDerivative");
  assert.ok(fast >= 0);
  assert.ok(ensure > fast);
  assert.match(route, /wr-avatar-/);
});

test("avatar derivatives are 256px webp and are refreshed from profile crops", () => {
  const derivatives = readWeb("src/lib/entity-image-derivatives.ts");
  const profiles = readWeb("src/lib/entity-image-profiles.ts");
  assert.match(derivatives, /ENTITY_AVATAR_SIZE = 256/);
  assert.match(derivatives, /\.webp\(\{ quality: 78, effort: 4 \}\)/);
  assert.match(derivatives, /squareExtract/);
  assert.match(profiles, /ensureEntityAvatarDerivative/);
  assert.match(profiles, /CroppableEntityType = "person" \| "race" \| "culture"/);
});

test("dense image frames have a one-image thumbnail mode without the blur fallback", () => {
  const frame = readWeb("src/components/entity-image-frame.tsx");
  assert.match(frame, /mode\?: "profile" \| "thumbnail"/);
  assert.match(frame, /effectiveMode === "thumbnail"/);
  assert.match(frame, /entity-image-frame-thumbnail/);
  assert.match(frame, /entity-image-backdrop/);
});

test("NPC registry uses a lean list select and generated avatar urls", () => {
  const npcs = readWeb("src/lib/entities/npcs.ts");
  const page = readWeb("src/app/admin/projects/[projectId]/npcs/page.tsx");
  assert.match(npcs, /const npcListSelect=/);
  assert.match(npcs, /entity-images\/person/);
  assert.match(npcs, /pool\.query<NpcRow>\(`\$\{npcListSelect\}/);
  assert.doesNotMatch(page, /listEntityImageProfiles/);
  assert.match(page, /mode="thumbnail"/);
});

test("species and group registries aggregate counts instead of per-row correlated counts", () => {
  const races = readWeb("src/lib/race-registry.ts");
  const groups = readWeb("src/lib/entities/groups.ts");
  assert.match(races, /WITH character_counts AS/);
  assert.match(races, /child_counts AS/);
  assert.match(groups, /GROUP BY project_id,group_id/);
  assert.match(groups, /entity-images\/group/);
});

test("race and culture image flows both support non-destructive 1:1 crops", () => {
  const raceCreate = readWeb("src/app/admin/projects/[projectId]/races/race-create-dialog.tsx");
  const raceImage = readWeb("src/app/admin/projects/[projectId]/races/[raceId]/image/page.tsx");
  const cultureDetail = readWeb("src/app/admin/projects/[projectId]/cultures/[cultureId]/page.tsx");
  const cultureActions = readWeb("src/app/admin/projects/[projectId]/cultures/actions.ts");
  assert.match(raceCreate, /ProfileImageEditor/);
  assert.match(raceImage, /currentCrop=\{imageProfile\?\.crop\}/);
  assert.match(cultureDetail, /ProfileImageEditor current=\{culture\.image\} currentCrop=\{imageProfile\?\.crop\}/);
  assert.match(cultureActions, /saveEntityImageProfile\(projectId, "culture"/);
});

test("media lifecycle cleans and regenerates derivative files", () => {
  const media = readWeb("src/lib/media.ts");
  const location = readWeb("src/lib/location-media.ts");
  assert.match(media, /ensureEntityAvatarDerivative/);
  assert.match(media, /deleteEntityAvatarDerivative/);
  assert.match(media, /SELECT storage_path FROM entity_image_derivatives/);
  assert.match(location, /ensureEntityAvatarDerivative/);
});
