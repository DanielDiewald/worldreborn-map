import assert from "node:assert/strict";
import test from "node:test";
import { PERSON_GENDER_OPTIONS, isPersonGender, personGenderLabel } from "../src/lib/person-gender";

test("person gender has the four configured canonical values including unknown", () => {
  assert.deepEqual(PERSON_GENDER_OPTIONS.map((option) => option.value), ["unknown", "male", "female", "hermaphrodite"]);
  assert.deepEqual(PERSON_GENDER_OPTIONS.map((option) => option.label), ["Unbekannt", "Männlich", "Weiblich", "Hermaphrodit"]);
});

test("gender helpers accept unknown but still reject legacy free text", () => {
  assert.equal(isPersonGender("unknown"), true);
  assert.equal(isPersonGender("male"), true);
  assert.equal(isPersonGender("female"), true);
  assert.equal(isPersonGender("hermaphrodite"), true);
  assert.equal(isPersonGender("männlich"), false);
  assert.equal(personGenderLabel("unknown"), "Unbekannt");
  assert.equal(personGenderLabel("male"), "Männlich");
  assert.equal(personGenderLabel("female"), "Weiblich");
  assert.equal(personGenderLabel("hermaphrodite"), "Hermaphrodit");
});
