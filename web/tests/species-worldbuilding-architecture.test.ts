import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here=path.dirname(fileURLToPath(import.meta.url));const webRoot=path.resolve(here,"..");const repoRoot=path.resolve(webRoot,"..");
const web=(file:string)=>readFileSync(path.join(webRoot,file),"utf8");const repo=(file:string)=>readFileSync(path.join(repoRoot,file),"utf8");

test("species worldbuilding migration separates biology culture geography and relations",()=>{
  const sql=repo("migrations/0012_species_worldbuilding.sql");
  assert.match(sql,/ADD COLUMN biology jsonb/);
  assert.match(sql,/CREATE TABLE public\.race_traits/);
  assert.match(sql,/CREATE TABLE public\.cultures/);
  assert.match(sql,/CREATE TABLE public\.culture_races/);
  assert.match(sql,/CREATE TABLE public\.race_location_links/);
  assert.match(sql,/historical_home/);
  assert.match(sql,/CREATE TABLE public\.race_relations/);
  assert.match(sql,/hybrid_of/);
});

test("mixed ancestry and culture are separate character identity layers",()=>{
  const sql=repo("migrations/0013_species_character_identity.sql");
  assert.match(sql,/CREATE TABLE public\.character_ancestry/);
  assert.match(sql,/CREATE TABLE public\.person_cultures/);
  const characterPage=web("src/app/admin/projects/[projectId]/characters/[charId]/page.tsx");
  assert.match(characterPage,/Biologische Herkunft/);
  assert.match(characterPage,/Kulturelle Zugehörigkeit/);
  assert.match(characterPage,/Keine Prozentwerte werden erzwungen/);
});

test("species detail exposes inherited biology traits distribution relations and cultures",()=>{
  const page=web("src/app/admin/projects/[projectId]/races/[raceId]/page.tsx");
  assert.match(page,/VERERBBARE BIOLOGIE/);
  assert.match(page,/geerbt von/);
  assert.match(page,/FREIE MERKMALE/);
  assert.match(page,/Heimat & Verbreitung/);
  assert.match(page,/VERWANDTSCHAFT/);
  assert.match(page,/KULTUREN \/ VÖLKER/);
});

test("cultures have their own navigation and admin pages instead of being stored in race",()=>{
  const shell=web("src/components/admin/admin-shell.tsx");
  const culturePage=web("src/app/admin/projects/[projectId]/cultures/page.tsx");
  assert.match(shell,/Kulturen & Völker/);
  assert.match(culturePage,/Kultur ist bewusst von Biologie getrennt/);
});

test("ancestry and person culture stay admin-only unless explicitly released to the player",()=>{
  const sql=repo("migrations/0014_species_identity_player_visibility.sql");
  assert.match(sql,/character_ancestry ADD COLUMN visible_to_player boolean NOT NULL DEFAULT false/);
  assert.match(sql,/person_cultures ADD COLUMN visible_to_player boolean NOT NULL DEFAULT false/);
  const playerWorld=web("src/lib/player-world.ts");
  assert.match(playerWorld,/ca\.visible_to_player=true/);
  assert.match(playerWorld,/pc\.visible_to_player=true/);
  const characterPage=web("src/app/admin/projects/[projectId]/characters/[charId]/page.tsx");
  assert.match(characterPage,/ancestryVisible/);
  assert.match(characterPage,/cultureVisible/);
});
