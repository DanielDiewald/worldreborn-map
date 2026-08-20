import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here=path.dirname(fileURLToPath(import.meta.url));
const webRoot=path.resolve(here,"..");
const repoRoot=path.resolve(webRoot,"..");
const readWeb=(file:string)=>readFileSync(path.join(webRoot,file),"utf8");
const readRepo=(file:string)=>readFileSync(path.join(repoRoot,file),"utf8");

test("profile image crop is stored separately from the original image",()=>{
  const migration=readRepo("migrations/0015_entity_image_crops.sql");
  assert.match(migration,/CREATE TABLE public\.entity_image_crops/);
  assert.match(migration,/source_image text NOT NULL/);
  assert.match(migration,/crop jsonb NOT NULL/);
  assert.match(migration,/entity_type IN \('person','race'\)/);
});

test("entity image frame keeps full original without crop and uses cover only for an explicit crop",()=>{
  const frame=readWeb("src/components/entity-image-frame.tsx");
  assert.match(frame,/objectFit: "contain"/);
  assert.match(frame,/crop \? <>/);
  assert.match(frame,/className="entity-image-crop-content"/);
  assert.match(frame,/objectFit: "cover"/);
  assert.match(frame,/data-has-crop/);
});

test("profile editor can create move zoom and remove a square crop",()=>{
  const editor=readWeb("src/components/profile-image-editor.tsx");
  assert.match(editor,/1:1 PROFILZUSCHNITT/);
  assert.match(editor,/onPointerMove=\{moveDrag\}/);
  assert.match(editor,/Zoom ·/);
  assert.match(editor,/Zuschnitt entfernen/);
  assert.match(editor,/JSON\.stringify\(crop\)/);
});

test("npc god and species writes persist profile crops",()=>{
  const npc=readWeb("src/app/admin/projects/[projectId]/npcs/actions.ts");
  const god=readWeb("src/app/admin/projects/[projectId]/gods/actions.ts");
  const race=readWeb("src/app/admin/projects/[projectId]/races/actions.ts");
  assert.match(npc,/saveEntityImageProfile\(projectId,"person",created\.nId/);
  assert.match(god,/saveEntityImageProfile\(projectId,"person",personId/);
  assert.match(race,/saveEntityImageProfile\(projectId,"race",created\.raceId/);
  assert.match(race,/if\(formData\.has\("imageCrop"\)\)await saveEntityImageProfile/);
});

test("species has a dedicated crop editor and existing crops are rendered in registries",()=>{
  const imagePage=readWeb("src/app/admin/projects/[projectId]/races/[raceId]/image/page.tsx");
  const registry=readWeb("src/app/admin/projects/[projectId]/races/page.tsx");
  assert.match(imagePage,/ProfileImageEditor/);
  assert.match(imagePage,/updateRaceImageAction/);
  assert.match(registry,/listEntityImageProfiles/);
  assert.match(registry,/Bild zuschneiden/);
  assert.match(registry,/crop=\{cropFor\(race, profiles\)\}/);
});
