import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
export { requireDatabaseUrl } from "./database-url";

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
