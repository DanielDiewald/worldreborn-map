import assert from "node:assert/strict";
import test from "node:test";
import { allowedParentKinds, locationKindLabel } from "../src/lib/location-presentation";

test("location kinds use worldbuilding language",()=>{
  assert.equal(locationKindLabel("country"),"Land");
  assert.equal(locationKindLabel("city"),"Stadt");
  assert.equal(locationKindLabel("building"),"Gebäude");
});

test("city parent search is limited to meaningful geographic parents",()=>{
  assert.deepEqual(allowedParentKinds("city"),["province","region","country"]);
  assert.ok(!allowedParentKinds("city").includes("building"));
  assert.ok(!allowedParentKinds("city").includes("district"));
});

test("country and province hierarchy follows world to local structure",()=>{
  assert.deepEqual(allowedParentKinds("country"),["continent","world"]);
  assert.deepEqual(allowedParentKinds("province"),["country","continent"]);
});
