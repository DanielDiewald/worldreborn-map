"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  anonymizeRateLimitKey,
  clearRateLimit,
  consumeRateLimit,
} from "@/lib/auth/rate-limit";
import {
  clearPlayerSession,
  createPlayerSession,
} from "@/lib/auth/player-session";
import { authenticatePlayerCode } from "@/lib/players";

const loginSchema = z.object({
  code: z.string().trim().min(1).max(64),
});

export async function loginPlayer(_previousState: string | null, formData: FormData) {
  const parsed = loginSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) return "Bitte gib einen gültigen Spielercode ein.";

  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwardedFor || requestHeaders.get("x-real-ip") || "unknown";
  const rateKey = anonymizeRateLimitKey("player-login", address);
  const rate = await consumeRateLimit(rateKey, {
    maxAttempts: 6,
    windowMinutes: 15,
    blockMinutes: 15,
  });

  if (!rate.allowed) {
    return "Zu viele Anmeldeversuche. Bitte versuche es später erneut.";
  }

  const player = await authenticatePlayerCode(parsed.data.code);
  if (!player) return "Der Spielercode ist ungültig oder wurde deaktiviert.";

  await clearRateLimit(rateKey);
  await createPlayerSession(player.playerId, player.projectId);
  redirect("/player/home");
}

export async function logoutPlayer() {
  await clearPlayerSession();
  redirect("/player");
}
