const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

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
