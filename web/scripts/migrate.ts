import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

async function main() {
  const direction = process.argv[2];

  if (direction !== "up" && direction !== "down") {
    throw new Error("Usage: tsx scripts/migrate.ts <up|down>");
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const file =
    direction === "up"
      ? "0001_worldreborn_foundation.sql"
      : "0001_worldreborn_foundation.down.sql";

  const sqlPath = path.resolve(
    process.cwd(),
    "..",
    "migrations",
    file,
  );

  const sql = await readFile(sqlPath, "utf8");

  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query(sql);
    console.log(`Applied ${file}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});