import assert from "node:assert/strict";
import test from "node:test";
import { inheritRaceBiology, inheritRaceTraits, normalizeRaceBiology, raceTraitKey } from "../src/lib/race-worldbuilding";

test("subspecies inherit missing biology and override only authored fields", () => {
  const parent = normalizeRaceBiology({ lifespanYears: 500, adulthoodYears: 40, diet: "omnivor", preferredClimate: "gemäßigt" });
  const child = normalizeRaceBiology({ lifespanYears: 650, preferredClimate: "kühl" });
  const result = inheritRaceBiology(parent, child);
  assert.equal(result.effective.lifespanYears, 650);
  assert.equal(result.effective.adulthoodYears, 40);
  assert.equal(result.effective.diet, "omnivor");
  assert.equal(result.effective.preferredClimate, "kühl");
  assert.equal(result.inheritedKeys.has("adulthoodYears"), true);
  assert.equal(result.inheritedKeys.has("diet"), true);
  assert.equal(result.inheritedKeys.has("lifespanYears"), false);
});

test("custom child trait overrides the parent trait with the same stable key", () => {
  const parent = [{ traitKey: "blood", label: "Blut", value: "rot", unit: null, notes: null, inheritedFromRaceId: 1, inheritedFromRaceName: "Elf" }];
  const own = [{ traitKey: "blood", label: "Blut", value: "silbern", unit: null, notes: "Eigene Subspezies-Ausprägung" }];
  const result = inheritRaceTraits(parent, own);
  assert.equal(result.length, 1);
  assert.equal(result[0].value, "silbern");
  assert.equal(result[0].inheritedFromRaceName, null);
});

test("free trait keys are deterministic and safe for inheritance", () => {
  assert.equal(raceTraitKey("  Magische Affinität  "), "magische-affinität");
  assert.equal(raceTraitKey("Unter Wasser atmen!"), "unter-wasser-atmen");
});
