import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const read = (file: string) => readFileSync(path.join(webRoot, file), "utf8");

test("entity image frame is square while preserving the full source artwork", () => {
  const component = read("src/components/entity-image-frame.tsx");
  assert.match(component, /aspectRatio: "1 \/ 1"/);
  assert.match(component, /objectFit: "contain"/);
  assert.match(component, /objectFit: "cover"/);
  assert.match(component, /entity-image-backdrop/);
  assert.match(component, /entity-image-content/);
  assert.doesNotMatch(component, /objectFit: "fill"/);
});

test("npc god and species surfaces use the shared square artwork frame", () => {
  const npcList = read("src/app/admin/projects/[projectId]/npcs/page.tsx");
  const npcDetail = read("src/app/admin/projects/[projectId]/npcs/[npcId]/page.tsx");
  const gods = read("src/app/admin/projects/[projectId]/gods/page.tsx");
  const godDetail = read("src/app/admin/projects/[projectId]/gods/[godId]/page.tsx");
  const races = read("src/app/admin/projects/[projectId]/races/page.tsx");

  for (const source of [npcList, npcDetail, gods, godDetail, races]) {
    assert.match(source, /EntityImageFrame/);
  }
});

test("image editor preview explains and uses the non-cropping square presentation", () => {
  const input = read("src/components/image-source-input.tsx");
  const compatibility = read("src/app/entity-images.css");
  assert.match(input, /image-source-square-preview/);
  assert.match(input, /Hoch- und Querformat bleiben vollständig sichtbar/);
  assert.match(compatibility, /object-fit: contain !important/);
});
