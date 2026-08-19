import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import {
  loadProjectEnvironment,
  requireDatabaseUrl,
} from "../src/lib/environment";

const MIGRATION_PATTERN = /^\d+_.+\.sql$/;

async function getMigrationFiles(migrationsDir: string) {
  return (await readdir(migrationsDir))
    .filter((file) => MIGRATION_PATTERN.test(file) && !file.endsWith(".down.sql"))
    .sort((left, right) => left.localeCompare(right));
}

/**
 * Keep historical migration files immutable, but compensate for parser issues
 * that only became visible once CI started restoring the authoritative PG17 dump.
 *
 * 0004 declares a PL/pgSQL variable named `overlaps`. PostgreSQL treats
 * OVERLAPS as a SQL operator/keyword, so `overlaps <> 0` fails to parse on PG17.
 * The migration file itself is deliberately not rewritten; only the SQL sent to
 * PostgreSQL for that exact historical migration is normalized in memory.
 */
export function normalizeHistoricalMigrationSql(migration: string, sql: string) {
  if (migration === "0004_person_identity_normalization.sql") {
    return sql.replace(/\boverlaps\b/g, "subtype_overlaps");
  }
  return sql;
}

async function ensureMigrationLedger(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.worldreborn_schema_migrations (
      migration_name text PRIMARY KEY,
      applied_at timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
}

async function baselineFoundationIfAlreadyApplied(client: Client) {
  const result = await client.query<{ applied: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'campaigns'
        AND column_name = 'primary_map_id'
    ) AS applied
  `);

  if (result.rows[0]?.applied) {
    await client.query(
      `INSERT INTO public.worldreborn_schema_migrations (migration_name)
       VALUES ('0001_worldreborn_foundation.sql')
       ON CONFLICT (migration_name) DO NOTHING`,
    );
  }
}

/**
 * Development databases created while the old Windows entrypoint bug existed can
 * contain the complete 0008 schema without a ledger row. Never re-run CREATE TABLE
 * over that data. If all 0008 relations and their core columns exist, repair the
 * ledger and seed rows instead. A partial schema is deliberately rejected because
 * guessing whether it is safe to complete it could destroy user data.
 */
async function baselineMapLayersIfAlreadyApplied(client: Client) {
  const ledger = await client.query(
    `SELECT 1 FROM public.worldreborn_schema_migrations
      WHERE migration_name='0008_map_layers_and_features.sql'`,
  );
  if (ledger.rowCount) return;

  const result = await client.query<{
    project_map_layers: boolean;
    map_layer_visibility: boolean;
    map_features: boolean;
    map_feature_visibility: boolean;
    layer_core_columns: boolean;
    feature_core_columns: boolean;
  }>(`
    SELECT
      to_regclass('public.project_map_layers') IS NOT NULL AS project_map_layers,
      to_regclass('public.map_layer_visibility') IS NOT NULL AS map_layer_visibility,
      to_regclass('public.map_features') IS NOT NULL AS map_features,
      to_regclass('public.map_feature_visibility') IS NOT NULL AS map_feature_visibility,
      (
        SELECT count(*)=6
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name='project_map_layers'
          AND column_name IN ('layer_id','project_id','map_id','name','layer_type','source_type')
      ) AS layer_core_columns,
      (
        SELECT count(*)=7
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name='map_features'
          AND column_name IN ('feature_id','project_id','map_id','layer_id','geometry_type','geometry','label')
      ) AS feature_core_columns
  `);

  const state = result.rows[0];
  const checks = {
    project_map_layers: state?.project_map_layers ?? false,
    map_layer_visibility: state?.map_layer_visibility ?? false,
    map_features: state?.map_features ?? false,
    map_feature_visibility: state?.map_feature_visibility ?? false,
    layer_core_columns: state?.layer_core_columns ?? false,
    feature_core_columns: state?.feature_core_columns ?? false,
  };
  const present = Object.values(checks).filter(Boolean).length;
  if (present === 0) return;

  const missing = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  if (missing.length) {
    throw new Error(
      `Partial 0008 map schema detected without migration ledger entry. Missing checks: ${missing.join(", ")}. ` +
      "Refusing to recreate tables automatically; inspect the database before continuing.",
    );
  }

  await client.query("BEGIN");
  try {
    await client.query(`
      CREATE INDEX IF NOT EXISTS project_map_layers_map_idx
        ON public.project_map_layers(project_id, map_id, z_index, layer_id);
      CREATE INDEX IF NOT EXISTS map_features_map_layer_idx
        ON public.map_features(project_id, map_id, layer_id, feature_id);
      CREATE INDEX IF NOT EXISTS map_features_entity_idx
        ON public.map_features(project_id, entity_type, entity_id)
        WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL;
    `);
    await client.query(`
      INSERT INTO public.project_map_layers(project_id,map_id,name,layer_type,source_type,opacity,z_index,visible_by_default,visibility_mode,style)
      SELECT project_id,map_id,'Political','vector','drawn',0.35,100,true,'admin_only',
             '{"fill":"#7c6ee6","stroke":"#ffffff","strokeWidth":2}'::jsonb
      FROM public.project_maps
      ON CONFLICT (project_id,map_id,name) DO NOTHING;

      INSERT INTO public.project_map_layers(project_id,map_id,name,layer_type,source_type,opacity,z_index,visible_by_default,visibility_mode,style)
      SELECT project_id,map_id,'Routes & Rivers','vector','drawn',1,120,true,'admin_only',
             '{"stroke":"#67a9cf","strokeWidth":3}'::jsonb
      FROM public.project_maps
      ON CONFLICT (project_id,map_id,name) DO NOTHING;
    `);
    const inserted = await client.query(
      `INSERT INTO public.worldreborn_schema_migrations (migration_name)
       VALUES ('0008_map_layers_and_features.sql')
       ON CONFLICT (migration_name) DO NOTHING
       RETURNING migration_name`,
    );
    await client.query("COMMIT");
    if (inserted.rowCount) {
      console.log("Baselined 0008_map_layers_and_features.sql (existing schema detected).");
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function migrateUp(client: Client, migrationsDir: string) {
  await baselineFoundationIfAlreadyApplied(client);
  await baselineMapLayersIfAlreadyApplied(client);

  const appliedResult = await client.query<{ migration_name: string }>(
    "SELECT migration_name FROM public.worldreborn_schema_migrations",
  );
  const applied = new Set(appliedResult.rows.map((row) => row.migration_name));
  const migrations = await getMigrationFiles(migrationsDir);
  let count = 0;

  for (const migration of migrations) {
    if (applied.has(migration)) {
      continue;
    }

    const rawSql = await readFile(path.join(migrationsDir, migration), "utf8");
    const sql = normalizeHistoricalMigrationSql(migration, rawSql);
    await client.query(sql);
    await client.query(
      "INSERT INTO public.worldreborn_schema_migrations (migration_name) VALUES ($1)",
      [migration],
    );
    console.log(`Applied ${migration}`);
    count += 1;
  }

  if (count === 0) {
    console.log("Database is already up to date.");
  }
}

async function migrateDown(client: Client, migrationsDir: string) {
  const result = await client.query<{ migration_name: string }>(
    `SELECT migration_name
       FROM public.worldreborn_schema_migrations
      ORDER BY migration_name DESC
      LIMIT 1`,
  );
  const latest = result.rows[0]?.migration_name;

  if (!latest) {
    console.log("No applied migration to roll back.");
    return;
  }

  const downFile = latest.replace(/\.sql$/, ".down.sql");
  const sqlPath = path.join(migrationsDir, downFile);

  try {
    const sql = await readFile(sqlPath, "utf8");
    await client.query(sql);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Rollback file is missing for ${latest}: ${downFile}`);
    }
    throw error;
  }

  await client.query(
    "DELETE FROM public.worldreborn_schema_migrations WHERE migration_name = $1",
    [latest],
  );
  console.log(`Rolled back ${latest}`);
}

async function main() {
  const direction = process.argv[2];

  if (direction !== "up" && direction !== "down") {
    throw new Error("Usage: tsx scripts/migrate.ts <up|down>");
  }

  loadProjectEnvironment();
  const connectionString = requireDatabaseUrl();
  const migrationsDir = path.resolve(process.cwd(), "..", "migrations");
  const client = new Client({ connectionString });

  try {
    await client.connect();
    await ensureMigrationLedger(client);

    if (direction === "up") {
      await migrateUp(client, migrationsDir);
    } else {
      await migrateDown(client, migrationsDir);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Database migration failed: ${message}`, { cause: error });
  } finally {
    await client.end();
  }
}

// fileURLToPath keeps the ESM entrypoint check portable on Windows, macOS and Linux.
const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
