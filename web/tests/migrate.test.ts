import assert from "node:assert/strict";
import test from "node:test";
import { normalizeHistoricalMigrationSql } from "../scripts/migrate";

test("normalizes the reserved OVERLAPS identifier only for immutable 0004",()=>{
  const source="DECLARE overlaps integer; BEGIN IF overlaps <> 0 THEN NULL; END IF; END";
  const normalized=normalizeHistoricalMigrationSql("0004_person_identity_normalization.sql",source);
  assert.match(normalized,/subtype_overlaps integer/);
  assert.match(normalized,/subtype_overlaps <> 0/);
  assert.doesNotMatch(normalized,/\boverlaps\b/);
});

test("leaves every other migration untouched",()=>{
  const source="SELECT 'overlaps' AS label";
  assert.equal(normalizeHistoricalMigrationSql("0005_groups_relationships_family_trees.sql",source),source);
});
