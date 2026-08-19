import assert from "node:assert/strict";
import test from "node:test";
import { personLocationRoleLabel } from "../src/lib/person-location-presentation";

test("NPC spatial roles use clear German labels",()=>{
  assert.equal(personLocationRoleLabel("current"),"Aktueller Ort");
  assert.equal(personLocationRoleLabel("home"),"Wohnort / Heimat");
  assert.equal(personLocationRoleLabel("birthplace"),"Geburtsort");
  assert.equal(personLocationRoleLabel("workplace"),"Arbeitsplatz");
  assert.equal(personLocationRoleLabel("temporary"),"Temporärer Aufenthalt");
});
