import assert from "node:assert/strict";
import test from "node:test";
import { parseEnvFile, requireDatabaseUrl } from "../src/lib/environment";

test("parseEnvFile supports comments, export and quoted values", () => {
  assert.deepEqual(
    parseEnvFile(`# comment\nDATABASE_URL=postgresql://localhost/worldreborn\nexport ADMIN_USERNAME=admin\nVALUE=\"hello world\"\n`),
    {
      DATABASE_URL: "postgresql://localhost/worldreborn",
      ADMIN_USERNAME: "admin",
      VALUE: "hello world",
    },
  );
});

test("requireDatabaseUrl rejects missing configuration", () => {
  assert.throws(
    () => requireDatabaseUrl(""),
    /DATABASE_URL is missing/,
  );
});

test("requireDatabaseUrl rejects placeholder hosts", () => {
  assert.throws(
    () => requireDatabaseUrl("postgresql://user:pass@DATABASE_HOST:5432/worldreborn"),
    /placeholder host/,
  );
});

test("requireDatabaseUrl accepts PostgreSQL URLs", () => {
  const value = "postgresql://user:pass@localhost:5432/worldreborn";
  assert.equal(requireDatabaseUrl(value), value);
});
