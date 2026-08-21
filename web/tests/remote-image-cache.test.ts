import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { isPublicRemoteAddress, parseRemoteImageUrl } from "../src/lib/remote-image-policy";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const read = (file: string) => readFileSync(path.join(webRoot, file), "utf8");

test("remote image policy rejects local and private destinations", () => {
  for (const address of ["127.0.0.1", "10.0.0.5", "172.16.4.2", "192.168.1.20", "169.254.169.254", "::1", "fc00::1", "fe80::1"]) {
    assert.equal(isPublicRemoteAddress(address), false, address);
  }
  assert.equal(isPublicRemoteAddress("8.8.8.8"), true);
  assert.equal(isPublicRemoteAddress("2606:4700:4700::1111"), true);
  assert.throws(() => parseRemoteImageUrl("http://localhost/avatar.png"));
  assert.throws(() => parseRemoteImageUrl("http://127.0.0.1/avatar.png"));
  assert.throws(() => parseRemoteImageUrl("file:///tmp/avatar.png"));
  assert.equal(parseRemoteImageUrl("//example.com/avatar.png").protocol, "https:");
});

test("remote entity URLs are imported into managed local media", () => {
  const media = read("src/lib/media.ts");
  assert.match(media, /saveRemoteMediaImport/);
  assert.match(media, /downloadRemoteImage/);
  assert.match(media, /external_url/);
  assert.match(media, /remote_cached:true/);
  assert.match(media, /image:`\/api\/media\/\$\{mediaId\}`/);
});

test("cached remote media is served locally and can generate 256px derivatives", () => {
  const mediaRoute = read("src/app/api/media/[mediaId]/route.ts");
  const derivatives = read("src/lib/entity-image-derivatives.ts");
  assert.ok(mediaRoute.indexOf("if(record.storage_path)") < mediaRoute.indexOf("if(record.external_url)"));
  assert.match(derivatives, /ENTITY_AVATAR_SIZE = 256/);
  assert.match(derivatives, /if \(!row\?\.storage_path\) return null/);
  assert.doesNotMatch(derivatives, /!row\?\.storage_path \|\| row\.external_url/);
});

test("legacy remote URLs are materialized once and keep their saved crop", () => {
  const materialize = read("src/lib/legacy-remote-image-materialize.ts");
  const derivatives = read("src/lib/entity-image-derivatives.ts");
  assert.match(materialize, /legacy_materialized: true/);
  assert.match(materialize, /AND \$\{config\.image\}=\$3/);
  assert.match(materialize, /UPDATE entity_image_crops SET source_image=\$4/);
  assert.match(derivatives, /materializeLegacyRemoteEntityImage/);
});

test("npc race and culture lists route legacy remote URLs through avatar endpoints", () => {
  const npc = read("src/lib/entities/npcs.ts");
  const race = read("src/lib/race-registry.ts");
  const culture = read("src/lib/entities/cultures.ts");
  for (const source of [npc, race, culture]) {
    assert.match(source, /\^https\?:\/\//);
    assert.match(source, /LIKE '\/\/%'/);
    assert.match(source, /entity-images\//);
    assert.match(source, /\/avatar/);
  }
});
