import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

function unquote(value: string) {
  const trimmed = value.trim();

  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }

  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function parseEnvFile(content: string) {
  const parsed: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separator = normalized.indexOf("=");

    if (separator <= 0) {
      continue;
    }

    const key = normalized.slice(0, separator).trim();
    const rawValue = normalized.slice(separator + 1);

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    parsed[key] = unquote(rawValue);
  }

  return parsed;
}

export function loadProjectEnvironment(cwd = process.cwd()) {
  const externallyDefined = new Set(Object.keys(process.env));
  const loaded: string[] = [];

  for (const filename of [".env", ".env.local"]) {
    // These runtime configuration files are intentionally outside Next's build trace.
    const envPath = path.join(/*turbopackIgnore: true*/ cwd, filename);

    if (!existsSync(envPath)) {
      continue;
    }

    const values = parseEnvFile(readFileSync(envPath, "utf8"));

    for (const [key, value] of Object.entries(values)) {
      if (!externallyDefined.has(key)) {
        process.env[key] = value;
      }
    }

    loaded.push(envPath);
  }

  return loaded;
}

export function requireDatabaseUrl(value = process.env.DATABASE_URL) {
  if (!value?.trim()) {
    throw new Error(
      "DATABASE_URL is missing. Create web/.env.local based on .env.example.",
    );
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "DATABASE_URL is invalid. Expected a PostgreSQL URL such as postgresql://user:password@localhost:5432/worldreborn.",
    );
  }

  if (!POSTGRES_PROTOCOLS.has(url.protocol) || !url.hostname || !url.pathname.slice(1)) {
    throw new Error(
      "DATABASE_URL is invalid. Expected postgresql://user:password@host:5432/database.",
    );
  }

  if (/^(DATABASE_HOST|HOST|POSTGRES_HOST)$/i.test(url.hostname)) {
    throw new Error(
      `DATABASE_URL contains the placeholder host "${url.hostname}". Replace it with the real PostgreSQL hostname in web/.env.local.`,
    );
  }

  return value;
}
