import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { migrationErrorMessage, normalizeHistoricalMigrationSql } from "../scripts/migrate";

const here=path.dirname(fileURLToPath(import.meta.url));
const repoRoot=path.resolve(here,"../..");

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

test("race migration preserves legacy view_npc around typmod changes",()=>{
  const sql=readFileSync(path.join(repoRoot,"migrations/0010_races_and_gender.sql"),"utf8");
  assert.match(sql,/pg_get_viewdef\(c\.oid,true\)/);
  assert.match(sql,/DROP MATERIALIZED VIEW public\.view_npc/);
  assert.match(sql,/ALTER COLUMN gender TYPE character varying\(20\)/);
  assert.match(sql,/ALTER COLUMN race TYPE character varying\(120\)/);
  assert.match(sql,/regexp_replace\(saved\.definition, ';\[\[:space:\]\]\*\$', ''\)/);
  assert.match(sql,/CREATE MATERIALIZED VIEW public\.view_npc AS %s WITH NO DATA/);
  assert.match(sql,/REFRESH MATERIALIZED VIEW public\.view_npc/);
});

test("migration errors include the exact migration filename",()=>{
  assert.equal(
    migrationErrorMessage("0010_races_and_gender.sql",new Error('syntax error at or near "DATA"')),
    'Migration 0010_races_and_gender.sql failed: syntax error at or near "DATA"',
  );
});
