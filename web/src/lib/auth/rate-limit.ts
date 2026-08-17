import "server-only";

import { createHash } from "node:crypto";
import { pool } from "@/lib/db";

export function anonymizeRateLimitKey(scope: string, value: string) {
  const digest = createHash("sha256").update(value).digest("hex");
  return `${scope}:${digest}`.slice(0, 160);
}

export async function consumeRateLimit(
  scopeKey: string,
  options: { maxAttempts?: number; windowMinutes?: number; blockMinutes?: number } = {},
) {
  const maxAttempts = options.maxAttempts ?? 5;
  const windowMinutes = options.windowMinutes ?? 15;
  const blockMinutes = options.blockMinutes ?? 15;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const existing = await client.query<{
      window_started_at: Date;
      attempts: number;
      blocked_until: Date | null;
    }>(
      `SELECT window_started_at, attempts, blocked_until
         FROM auth_rate_limits
        WHERE scope_key = $1
        FOR UPDATE`,
      [scopeKey],
    );

    const now = new Date();
    const row = existing.rows[0];

    if (row?.blocked_until && row.blocked_until > now) {
      await client.query("COMMIT");
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((row.blocked_until.getTime() - now.getTime()) / 1000)),
      };
    }

    const windowMs = windowMinutes * 60_000;
    const windowExpired = !row || now.getTime() - row.window_started_at.getTime() >= windowMs;
    const attempts = windowExpired ? 1 : row.attempts + 1;
    const blockedUntil = attempts > maxAttempts ? new Date(now.getTime() + blockMinutes * 60_000) : null;
    const windowStartedAt = windowExpired ? now : row.window_started_at;

    await client.query(
      `INSERT INTO auth_rate_limits (scope_key, window_started_at, attempts, blocked_until, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (scope_key) DO UPDATE SET
         window_started_at = EXCLUDED.window_started_at,
         attempts = EXCLUDED.attempts,
         blocked_until = EXCLUDED.blocked_until,
         updated_at = now()`,
      [scopeKey, windowStartedAt, attempts, blockedUntil],
    );

    await client.query("COMMIT");
    return {
      allowed: blockedUntil === null,
      retryAfterSeconds: blockedUntil ? blockMinutes * 60 : 0,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function clearRateLimit(scopeKey: string) {
  await pool.query("DELETE FROM auth_rate_limits WHERE scope_key = $1", [scopeKey]);
}
