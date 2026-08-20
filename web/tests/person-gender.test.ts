import assert from "node:assert/strict";
import test from "node:test";
import { PERSON_GENDER_OPTIONS, isPersonGender, personGenderLabel } from "../src/lib/person-gender";

test("person gender has exactly the three configured canonical values", () => {
  assert.deepEqual(PERSON_GENDER_OPTIONS.map((option) => option.value), ["male", "female", "hermaphrodite"]);
  assert.deepEqual(PERSON_GENDER_OPTIONS.map((option) => option.label), ["Männlich", "Weiblich", "Hermaphrodit"]);
});

test("gender helpers reject legacy free text and render canonical labels", () => {
  assert.equal(isPersonGender("male"), true);
  assert.equal(isPersonGender("female"), true);
  assert.equal(isPersonGender("hermaphrodite"), true);
  assert.equal(isPersonGender("unknown"), false);
  assert.equal(isPersonGender("männlich"), false);
  assert.equal(personGenderLabel("male"), "Männlich");
  assert.equal(personGenderLabel("female"), "Weiblich");
  assert.equal(personGenderLabel("hermaphrodite"), "Hermaphrodit");
});
