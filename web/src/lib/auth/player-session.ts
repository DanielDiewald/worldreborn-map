import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { pool } from "@/lib/db";

const PLAYER_COOKIE = "wr_player_session";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type PlayerSession = {
  playerId: number;
  projectId: number;
};

export async function createPlayerSession(playerId: number, projectId: number) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const hours = Number.parseInt(process.env.PLAYER_SESSION_HOURS ?? "24", 10);
  const expiresAt = new Date(Date.now() + Math.max(1, hours) * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO player_sessions (player_id, project_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [playerId, projectId, tokenHash, expiresAt],
  );

  const cookieStore = await cookies();
  cookieStore.set(PLAYER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/player",
    expires: expiresAt,
  });
}

export async function getPlayerSession(): Promise<PlayerSession | null> {
  const token = (await cookies()).get(PLAYER_COOKIE)?.value;
  if (!token) return null;

  const result = await pool.query<{ player_id: number; project_id: number }>(
    `UPDATE player_sessions s
        SET last_seen_at = now()
       FROM users u, campaigns c
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.user_id = s.player_id
        AND u.camp_id = s.project_id
        AND u.active = true
        AND c.camp_id = s.project_id
        AND c.status <> 'archived'
      RETURNING s.player_id, s.project_id`,
    [hashToken(token)],
  );

  return result.rows[0]
    ? { playerId: result.rows[0].player_id, projectId: result.rows[0].project_id }
    : null;
}

export async function requirePlayerSession() {
  const session = await getPlayerSession();
  if (!session) redirect("/player");
  return session;
}

export async function clearPlayerSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PLAYER_COOKIE)?.value;

  if (token) {
    await pool.query(
      `UPDATE player_sessions SET revoked_at = now() WHERE token_hash = $1`,
      [hashToken(token)],
    );
  }

  cookieStore.delete(PLAYER_COOKIE);
}
