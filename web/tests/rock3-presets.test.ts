import assert from "node:assert/strict";
import test from "node:test";
import { detectRock3Preset,ROCK3_LAYER_PRESETS } from "../src/lib/rock3-presets";

const expected:[string,string][]=[
  ["Satellite Color.png","satellite"],
  ["Biomes - Koppen-Geiger.png","biomes"],
  ["Rainfall - Annual Total.png","rainfall_annual"],
  ["Rainfall - Equinox.png","rainfall_equinox"],
  ["Rainfall - Summer.png","rainfall_summer"],
  ["Rainfall - Winter.png","rainfall_winter"],
  ["Temperature - Annual Mean.png","temperature_annual"],
  ["Temperature - Equinox.png","temperature_equinox"],
  ["Temperature - Summer.png","temperature_summer"],
  ["Temperature - Winter.png","temperature_winter"],
  ["Terrain - Elevation Above Sea Level.png","elevation_land"],
  ["Terrain - Elevation Below Sea Level.png","elevation_sea"],
  ["Terrain - Full Elevation.png","elevation_full"],
  ["Terrain - Land Mask.png","land_mask"],
];

test("recognizes every standard Rock 3 export from the supplied world set",()=>{
  assert.equal(expected.length,14);
  for(const [filename,role] of expected)assert.equal(detectRock3Preset(filename)?.role,role,filename);
});

test("preset roles are unique and unknown files are ignored",()=>{
  assert.equal(new Set(ROCK3_LAYER_PRESETS.map(item=>item.role)).size,ROCK3_LAYER_PRESETS.length);
  assert.equal(detectRock3Preset("notes.txt"),null);
  assert.equal(detectRock3Preset("political-custom.png"),null);
});
