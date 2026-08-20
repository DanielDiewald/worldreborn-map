import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { pool } from "@/lib/db";

const ADMIN_COOKIE = "wr_admin_session";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAdminSession() {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const hours = Number.parseInt(process.env.ADMIN_SESSION_HOURS ?? "12", 10);
  const expiresAt = new Date(Date.now() + Math.max(1, hours) * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO admin_sessions (token_hash, expires_at)
     VALUES ($1, $2)`,
    [tokenHash, expiresAt],
  );

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function hasValidAdminSession(options: { touch?: boolean } = {}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE)?.value;
  if (!token) return false;

  const tokenHash = hashToken(token);
  if (options.touch === false) {
    const result = await pool.query<{ session_id: string }>(
      `SELECT session_id
         FROM admin_sessions
        WHERE token_hash = $1
          AND revoked_at IS NULL
          AND expires_at > now()
        LIMIT 1`,
      [tokenHash],
    );
    return result.rowCount === 1;
  }

  const result = await pool.query<{ session_id: string }>(
    `UPDATE admin_sessions
        SET last_seen_at = now()
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND expires_at > now()
      RETURNING session_id`,
    [tokenHash],
  );

  return result.rowCount === 1;
}

export async function requireAdminSession() {
  if (!(await hasValidAdminSession())) redirect("/admin/login");
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE)?.value;

  if (token) {
    await pool.query(
      `UPDATE admin_sessions
          SET revoked_at = now()
        WHERE token_hash = $1`,
      [hashToken(token)],
    );
  }

  cookieStore.delete(ADMIN_COOKIE);
}
