import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here=path.dirname(fileURLToPath(import.meta.url));
const webRoot=path.resolve(here,"..");
const read=(file:string)=>readFileSync(path.join(webRoot,file),"utf8");

test("shared form UI is loaded globally",()=>{
  assert.match(read("src/components/form-ui.tsx"),/FormRequiredLegend/);
  assert.match(read("src/components/form-ui.tsx"),/FormErrorSummary/);
  assert.match(read("src/app/form-quality.css"),/aria-invalid/);
  assert.match(read("src/app/layout.tsx"),/form-quality\.css/);
});

test("EntityPicker is keyboard accessible",()=>{
  const source=read("src/components/entity-picker.tsx");
  for(const key of ["ArrowDown","ArrowUp","Home","End","Enter","Escape"])assert.match(source,new RegExp(key));
  assert.match(source,/aria-activedescendant/);
  assert.match(source,/aria-required/);
  assert.match(source,/role="combobox"/);
});

test("image forms use the real 50 MB limit",()=>{
  for(const file of ["src/components/image-source-input.tsx","src/components/profile-image-editor.tsx"]){
    const source=read(file);
    assert.match(source,/50 \* 1024 \* 1024/,file);
    assert.match(source,/image\/webp/,file);
    assert.match(source,/URL\.createObjectURL/,file);
  }
  const media=read("src/app/admin/projects/[projectId]/media/page.tsx");
  assert.match(media,/maximal 50 MB/);
  assert.doesNotMatch(media,/10 MB/);
});

test("entity crops survive unrelated saves",()=>{
  for(const file of [
    "src/app/admin/projects/[projectId]/npcs/actions.ts",
    "src/app/admin/projects/[projectId]/gods/actions.ts",
    "src/app/admin/projects/[projectId]/characters/actions.ts",
    "src/app/admin/projects/[projectId]/races/actions.ts",
    "src/app/admin/projects/[projectId]/cultures/actions.ts",
  ]) assert.match(read(file),/formData\.has\("imageCrop"\)/,file);
});

test("fantasy date precision clears hidden detail values",()=>{
  const source=read("src/components/fantasy-date-input.tsx");
  assert.match(source,/\$\{prefix\}Month/);
  assert.match(source,/\$\{prefix\}Day/);
  assert.match(source,/value=""/);
  assert.match(source,/setDay/);
});

test("large create flows use lazy dialogs",()=>{
  for(const file of [
    "src/app/admin/page.tsx",
    "src/app/admin/projects/[projectId]/npcs/page.tsx",
    "src/app/admin/projects/[projectId]/gods/page.tsx",
    "src/app/admin/projects/[projectId]/groups/page.tsx",
    "src/app/admin/projects/[projectId]/cultures/page.tsx",
    "src/app/admin/projects/[projectId]/locations/page.tsx",
    "src/app/admin/projects/[projectId]/timeline/page.tsx",
    "src/app/admin/projects/[projectId]/players/page.tsx",
  ]) assert.doesNotMatch(read(file),/<details className="create-dropdown"/,file);
});

test("FormData helpers parse missing values and checkboxes explicitly",()=>{
  const source=read("src/lib/form-data.ts");
  assert.match(source,/formData\.has/);
  assert.match(source,/value === "on"/);
  assert.match(source,/Number\.isSafeInteger/);
});

test("linked worldbuilding entities are project validated",()=>{
  const races=read("src/app/admin/projects/[projectId]/races/actions.ts");
  assert.match(races,/assertLocation\(projectId,locationId\)/);
  assert.match(races,/assertCulture\(projectId,cultureId\)/);
  const identity=read("src/lib/species-person-identity.ts");
  assert.match(identity,/assertRace\(projectId,raceId\)/);
  assert.match(identity,/assertCulture\(projectId,cultureId\)/);
  assert.match(read("src/lib/entities/relationships.ts"),/Eine Entität kann keine Beziehung zu sich selbst haben/);
});

test("domain writes with audit records are transactional",()=>{
  const cultures=read("src/lib/entities/cultures.ts");
  const relationships=read("src/lib/entities/relationships.ts");
  assert.match(cultures,/client\.query\("BEGIN"\)/);
  assert.match(cultures,/culture\.race_linked/);
  assert.match(relationships,/client\.query\("BEGIN"\)/);
  assert.match(relationships,/relationship\.created/);
});

test("dashboard has no hardcoded legacy project special case",()=>{
  const source=read("src/app/admin/page.tsx");
  assert.doesNotMatch(source,/project\.id\s*===\s*1/);
  assert.doesNotMatch(source,/Legacy-Karte verbunden/);
});
