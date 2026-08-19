import assert from "node:assert/strict";
import test from "node:test";
import { MAP_KIND_LABELS, mapKindFromConfig, mapKindLabel } from "../src/lib/map-presentation";

test("Rock 3 maps are presented as world maps without exposing technical map type",()=>{
  assert.equal(mapKindFromConfig({rock3:true}),"world");
  assert.equal(mapKindLabel({rock3:true}),"Weltkarte");
});

test("semantic map kind wins over technical storage details",()=>{
  assert.equal(mapKindFromConfig({map_kind:"city",width:8192,height:4096,crs:"simple"}),"city");
  assert.equal(mapKindLabel({map_kind:"city"}),"Stadtkarte");
  assert.equal(MAP_KIND_LABELS.dungeon,"Dungeon");
});

test("unknown or legacy maps fall back safely",()=>{
  assert.equal(mapKindFromConfig({map_kind:"spaceship"}),"other");
  assert.equal(mapKindFromConfig({}),"other");
  assert.equal(mapKindLabel({}),"Andere Karte");
});
