import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const repositoryRoot = path.resolve(root, "..");
function webSource(relativePath: string) { return readFileSync(path.join(root, relativePath), "utf8"); }
function repoSource(relativePath: string) { return readFileSync(path.join(repositoryRoot, relativePath), "utf8"); }

test("race migration creates first-class project races and backfills legacy character race text", () => {
  const migration = repoSource("migrations/0010_races_and_gender.sql");
  assert.match(migration, /CREATE TABLE public\.races/);
  assert.match(migration, /masculine_name/);
  assert.match(migration, /feminine_name/);
  assert.match(migration, /hermaphrodite_name/);
  assert.match(migration, /origin_map_id/);
  assert.match(migration, /origin_x/);
  assert.match(migration, /origin_lat/);
  assert.match(migration, /ADD COLUMN race_id/);
  assert.match(migration, /legacy_charakters\.race/);
  assert.match(migration, /worldreborn_validate_character_race/);
  assert.match(migration, /worldreborn_validate_person_gender/);
});

test("race origin UI stores a map plus the correct coordinate representation", () => {
  const picker = webSource("src/components/race-origin-picker.tsx");
  assert.match(picker, /name="originMapId"/);
  assert.match(picker, /name="originCoordinateMode"/);
  assert.match(picker, /name="originX"/);
  assert.match(picker, /name="originY"/);
  assert.match(picker, /name="originLat"/);
  assert.match(picker, /name="originLng"/);
  assert.match(picker, /mapType === "image"/);
  assert.match(picker, /ol\.proj\.toLonLat/);
});

test("NPC and player-character forms select race records instead of accepting free race text", () => {
  const npcPage = webSource("src/app/admin/projects/[projectId]/npcs/page.tsx");
  const npcDetail = webSource("src/app/admin/projects/[projectId]/npcs/[npcId]/page.tsx");
  const characterDetail = webSource("src/app/admin/projects/[projectId]/characters/[charId]/page.tsx");
  assert.match(npcPage, /select name="raceId"/);
  assert.match(npcDetail, /select name="raceId"/);
  assert.match(characterDetail, /select name="raceId"/);
  assert.doesNotMatch(npcPage, /input name="race"/);
  assert.doesNotMatch(npcDetail, /input name="race"/);
  assert.doesNotMatch(characterDetail, /input name="race"/);
});

test("all person editors use the shared gender dropdown", () => {
  const files = [
    "src/app/admin/projects/[projectId]/npcs/page.tsx",
    "src/app/admin/projects/[projectId]/npcs/[npcId]/page.tsx",
    "src/app/admin/projects/[projectId]/gods/page.tsx",
    "src/app/admin/projects/[projectId]/gods/[godId]/page.tsx",
    "src/app/admin/projects/[projectId]/characters/[charId]/page.tsx",
  ];
  for (const file of files) {
    const source = webSource(file);
    assert.match(source, /PersonGenderSelect/, file);
    assert.doesNotMatch(source, /<input name="gender"/, file);
  }
});

test("character queries derive the displayed species term from gender with a base-name fallback", () => {
  const npcs = webSource("src/lib/entities/npcs.ts");
  const characters = webSource("src/lib/entities/characters.ts");
  for (const source of [npcs, characters]) {
    assert.match(source, /masculine_name/);
    assert.match(source, /feminine_name/);
    assert.match(source, /hermaphrodite_name/);
    assert.match(source, /race_id/);
  }
});
