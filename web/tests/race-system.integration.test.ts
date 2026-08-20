import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const dbTest = (name: string, fn: (pool: Pool) => Promise<void>) => test(name, { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  try { await fn(pool); } finally { await pool.end(); }
});

async function count(pool: Pool, sql: string) {
  const result = await pool.query<{ value: number | string }>(sql);
  return Number(result.rows[0]?.value ?? 0);
}

dbTest("every migrated character has a same-project race and synchronized legacy shadow", async (pool) => {
  assert.equal(await count(pool, "SELECT count(*) value FROM charakters WHERE race_id IS NULL"), 0);
  assert.equal(await count(pool, `SELECT count(*) value FROM charakters c JOIN npcs n ON n.n_id=c.n_id LEFT JOIN races r ON r.race_id=c.race_id WHERE r.race_id IS NULL OR r.project_id<>n.camp_id`), 0);
  assert.equal(await count(pool, `SELECT count(*) value FROM charakters c JOIN races r ON r.race_id=c.race_id WHERE btrim(c.race) IS DISTINCT FROM btrim(r.name)`), 0);
});

dbTest("race origins always reference a map from the same project with matching coordinate mode", async (pool) => {
  assert.equal(await count(pool, `SELECT count(*) value FROM races r LEFT JOIN project_maps m ON m.map_id=r.origin_map_id WHERE r.origin_map_id IS NOT NULL AND (m.map_id IS NULL OR m.project_id<>r.project_id)`), 0);
  assert.equal(await count(pool, `SELECT count(*) value FROM races r JOIN project_maps m ON m.map_id=r.origin_map_id WHERE (m.map_type='image' AND r.origin_coordinate_mode<>'xy') OR (m.map_type='tile' AND r.origin_coordinate_mode<>'latlng')`), 0);
});
