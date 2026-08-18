import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
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

async function migrateUp(client: Client, migrationsDir: string) {
  await baselineFoundationIfAlreadyApplied(client);

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

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
