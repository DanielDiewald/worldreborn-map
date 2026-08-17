"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { verifyAdminCredentials } from "@/lib/auth/admin";
import { anonymizeRateLimitKey, clearRateLimit, consumeRateLimit } from "@/lib/auth/rate-limit";
import { createAdminSession } from "@/lib/auth/session";
import { pool } from "@/lib/db";

const loginSchema = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(1024),
});

export async function loginAdmin(formData: FormData) {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });

  if (!parsed.success) redirect("/admin/login?error=invalid");

  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headerStore.get("x-real-ip") || "local";
  const rateKey = anonymizeRateLimitKey("admin-login", ip);
  const rate = await consumeRateLimit(rateKey, { maxAttempts: 5, windowMinutes: 15, blockMinutes: 15 });

  if (!rate.allowed) redirect("/admin/login?error=rate");

  const valid = await verifyAdminCredentials(parsed.data.username, parsed.data.password);
  if (!valid) redirect("/admin/login?error=credentials");

  await clearRateLimit(rateKey);
  await createAdminSession();
  await pool.query(
    `INSERT INTO audit_log (actor_type, action, metadata)
     VALUES ('admin', 'admin.login', '{}'::jsonb)`,
  );

  redirect("/admin");
}
